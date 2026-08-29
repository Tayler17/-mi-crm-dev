import { DataSource } from 'typeorm';

/**
 * Central, provider-agnostic CRM tool registry.
 *
 * Each tool is defined ONCE here (name + description + JSON-schema params + handler),
 * instead of being re-declared per LLM provider (OpenAI/Anthropic/Gemini) as the
 * customer-facing chatbot engine does today. The converters below turn this single
 * source into each provider's tool format, and `runTool` executes by name.
 *
 * This is the shared foundation for:
 *  - the internal "Asistente de Negocio AI" (operates the whole CRM, voice/text),
 *  - (later) migrating the customer chatbots off their triplicated tool defs,
 *  - (later) exposing the same tools as a real MCP server for the owner via Claude.
 *
 * Every handler is TENANT-SCOPED (receives ctx.tenantId) and must never read/write
 * across tenants.
 */

export interface ToolContext {
  db: DataSource;
  tenantId: string;
  /** Role of the caller (agent/admin/owner) — for gating destructive tools later. */
  role?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON-schema object: { type:'object', properties:{...}, required:[...] } */
  parameters: { type: 'object'; properties: Record<string, any>; required?: string[] };
  /** Executes the tool. Returns a plain JSON-serializable result. */
  handler: (ctx: ToolContext, args: any) => Promise<any>;
  /** Powerful/destructive/costly: the backend refuses to run it unless args.confirm===true,
   *  so the assistant must ask the user and re-call with confirm after an explicit yes. */
  sensitive?: boolean;
}

// ── Provider format converters ──────────────────────────────────────────────

/** OpenAI Chat Completions tools format. */
export function toOpenAITools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Anthropic Messages API tools format. */
export function toAnthropicTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Gemini function-calling format (types are UPPERCASE there). */
export function toGeminiTools(tools: ToolDef[]) {
  const up = (t: string) => (t || 'string').toUpperCase();
  const conv = (props: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(props)) {
      out[k] = { type: up(v.type), description: v.description, ...(v.enum ? { enum: v.enum } : {}) };
      if (v.type === 'array' && v.items) out[k].items = { type: up(v.items.type) };
    }
    return out;
  };
  return [{
    function_declarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: { type: 'OBJECT', properties: conv(t.parameters.properties), required: t.parameters.required ?? [] },
    })),
  }];
}

/** Execute a tool call by name. Returns { ok, ... } or { ok:false, error }. */
export async function runTool(tools: ToolDef[], name: string, ctx: ToolContext, args: any): Promise<any> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  // Gate: sensitive actions won't run without explicit confirmation.
  if (tool.sensitive && args?.confirm !== true) {
    return { ok: false, needs_confirmation: true, message: 'Acción sensible: pide confirmación explícita al usuario y vuelve a llamar la herramienta con confirm=true.' };
  }
  try {
    return await tool.handler(ctx, args ?? {});
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'tool error' };
  }
}

/** Whitelisted period → SQL "since" fragment (no user text ever reaches the query). */
function periodSince(p?: string, fallback = 'month'): { period: string; since: string | null } {
  const map: Record<string, string | null> = {
    today: "date_trunc('day', now())",
    week: "date_trunc('week', now())",
    month: "date_trunc('month', now())",
    all: null,
  };
  const key = String(p ?? fallback).toLowerCase();
  const period = key in map ? key : fallback;
  return { period, since: map[period] };
}

// ── CRM tools (starter set — expanded in Fase 2) ────────────────────────────

export const CRM_TOOLS: ToolDef[] = [
  {
    name: 'search_contacts',
    description: 'Buscar contactos del CRM por nombre, teléfono o email. Devuelve hasta 10 resultados.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar (nombre, teléfono o email)' } },
      required: ['query'],
    },
    handler: async (ctx, args) => {
      const q = `%${String(args.query ?? '').trim()}%`;
      const rows = await ctx.db.query(
        `SELECT id, full_name, phone, email
         FROM contacts
         WHERE tenant_id=$1 AND (full_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
         ORDER BY updated_at DESC LIMIT 10`,
        [ctx.tenantId, q],
      );
      return { ok: true, count: rows.length, contacts: rows };
    },
  },
  {
    name: 'list_recent_contacts',
    description: 'Listar los contactos MÁS RECIENTES creados en el CRM. Úsalo cuando pregunten "quiénes son los contactos nuevos/de hoy", "los últimos contactos" o "quiénes son esos". Devuelve nombre, teléfono, email y fecha de creación.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'today (hoy), week (esta semana), month (este mes) o all (todos, los más recientes). Por defecto: all.' },
        limit: { type: 'number', description: 'Máximo de contactos a devolver (default 10, máx 50).' },
      },
      required: [],
    },
    handler: async (ctx, args) => {
      const lim = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const { period, since } = periodSince(args.period, 'all');
      const where = since ? `AND created_at >= ${since}` : '';
      const rows = await ctx.db.query(
        `SELECT id, full_name, phone, email, created_at
         FROM contacts WHERE tenant_id=$1 ${where}
         ORDER BY created_at DESC LIMIT ${lim}`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, period, contacts: rows };
    },
  },
  {
    name: 'create_contact',
    description: 'Crear un nuevo contacto en el CRM.',
    parameters: {
      type: 'object',
      properties: {
        full_name: { type: 'string', description: 'Nombre completo del contacto' },
        phone: { type: 'string', description: 'Teléfono (con código de país)' },
        email: { type: 'string', description: 'Email' },
      },
      required: ['full_name'],
    },
    handler: async (ctx, args) => {
      const name = String(args.full_name ?? '').trim();
      if (!name) return { ok: false, error: 'full_name es obligatorio' };
      const [row] = await ctx.db.query(
        `INSERT INTO contacts (tenant_id, full_name, phone, email, created_at, updated_at)
         VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id, full_name, phone, email`,
        [ctx.tenantId, name, args.phone ?? null, args.email ?? null],
      );
      return { ok: true, contact: row };
    },
  },
  {
    name: 'get_crm_summary',
    description: 'Resumen rápido del CRM: total de contactos, conversaciones abiertas y deals abiertos.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const [c] = await ctx.db.query(`SELECT COUNT(*)::int AS n FROM contacts WHERE tenant_id=$1`, [ctx.tenantId]);
      const [o] = await ctx.db.query(`SELECT COUNT(*)::int AS n FROM conversations WHERE tenant_id=$1 AND status='open'`, [ctx.tenantId]);
      const [d] = await ctx.db.query(`SELECT COUNT(*)::int AS n FROM deals WHERE tenant_id=$1 AND status='open'`, [ctx.tenantId]);
      return { ok: true, contacts: c?.n ?? 0, open_conversations: o?.n ?? 0, open_deals: d?.n ?? 0 };
    },
  },
  {
    name: 'get_business_snapshot',
    description: 'Resumen COMPLETO del negocio para un período (por defecto HOY): contactos nuevos, conversaciones (nuevas/resueltas en el período + abiertas/pendientes ahora), deals creados y ganados con su valor, pipeline abierto, tareas (vencen hoy/vencidas/completadas hoy), citas de hoy, y llamadas. Úsalo SIEMPRE que pregunten "cómo va el negocio hoy", "resumen del día", "detalles de hoy", "qué ha pasado hoy" o similar. Da los números REALES de cada área, no generalices.',
    parameters: { type: 'object', properties: { period: { type: 'string', description: 'today (hoy, por defecto), week (esta semana) o month (este mes).' } }, required: [] },
    handler: async (ctx, args) => {
      const { period, since } = periodSince(args.period, 'today');
      const w = since ? `AND created_at >= ${since}` : '';
      const wCalls = since ? `AND started_at >= ${since}` : '';
      const q = (sql: string): Promise<any[]> => ctx.db.query(sql, [ctx.tenantId]).catch(() => []);
      const [cNew, cTot, conv, convNow, dNew, dWon, pipe, tasks, appts, calls] = await Promise.all([
        q(`SELECT COUNT(*)::int n FROM contacts WHERE tenant_id=$1 ${w}`),
        q(`SELECT COUNT(*)::int n FROM contacts WHERE tenant_id=$1`),
        q(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='resolved')::int resolved FROM conversations WHERE tenant_id=$1 ${w}`),
        q(`SELECT COUNT(*) FILTER (WHERE status='open')::int open, COUNT(*) FILTER (WHERE status='pending')::int pending FROM conversations WHERE tenant_id=$1`),
        q(`SELECT COUNT(*)::int n, COALESCE(SUM(value),0)::numeric v FROM deals WHERE tenant_id=$1 ${w}`),
        q(`SELECT COUNT(*) FILTER (WHERE status='won')::int n, COALESCE(SUM(value) FILTER (WHERE status='won'),0)::numeric v FROM deals WHERE tenant_id=$1 ${w}`),
        q(`SELECT COUNT(*)::int n, COALESCE(SUM(value),0)::numeric v FROM deals WHERE tenant_id=$1 AND status NOT IN ('won','lost')`),
        q(`SELECT COUNT(*) FILTER (WHERE status='pending' AND due_date::date=current_date)::int due_today, COUNT(*) FILTER (WHERE status='pending' AND due_date::date<current_date)::int overdue, COUNT(*) FILTER (WHERE status='completed' AND updated_at::date=current_date)::int done_today FROM tasks WHERE tenant_id=$1`),
        q(`SELECT COUNT(*)::int n FROM appointments WHERE tenant_id=$1 AND scheduled_at::date=current_date`),
        q(`SELECT COUNT(*)::int n, COALESCE(SUM(duration),0)::int secs FROM call_logs WHERE tenant_id=$1 ${wCalls}`),
      ]);
      return {
        ok: true, period,
        contacts: { new_in_period: cNew[0]?.n ?? 0, total: cTot[0]?.n ?? 0 },
        conversations: { new_in_period: conv[0]?.total ?? 0, resolved_in_period: conv[0]?.resolved ?? 0, open_now: convNow[0]?.open ?? 0, pending_now: convNow[0]?.pending ?? 0 },
        deals: { created_in_period: dNew[0]?.n ?? 0, created_value: Number(dNew[0]?.v ?? 0), won_in_period: dWon[0]?.n ?? 0, won_value: Number(dWon[0]?.v ?? 0), open_pipeline_count: pipe[0]?.n ?? 0, open_pipeline_value: Number(pipe[0]?.v ?? 0) },
        tasks: { due_today: tasks[0]?.due_today ?? 0, overdue: tasks[0]?.overdue ?? 0, completed_today: tasks[0]?.done_today ?? 0 },
        appointments_today: appts[0]?.n ?? 0,
        calls: { in_period: calls[0]?.n ?? 0, total_seconds: calls[0]?.secs ?? 0 },
      };
    },
  },
  {
    name: 'get_conversation_stats',
    description: 'Conteo de conversaciones por PERÍODO y ESTADO. Úsalo para "¿cuántas conversaciones tenemos hoy?", "¿cuántas abiertas/en espera/resueltas?", "conversaciones de esta semana". Devuelve total + desglose (abiertas/pendientes/resueltas).',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', description: 'today (hoy), week (esta semana), month (este mes) o all (todas). Por defecto: today.' } },
      required: [],
    },
    handler: async (ctx, args) => {
      const p = String(args.period ?? 'today').toLowerCase();
      // Whitelisted period → fixed SQL fragment (no user text reaches the query).
      const sinceSql: Record<string, string | null> = {
        today: "date_trunc('day', now())",
        week: "date_trunc('week', now())",
        month: "date_trunc('month', now())",
        all: null,
      };
      const since = p in sinceSql ? sinceSql[p] : sinceSql.today;
      const where = since ? `AND created_at >= ${since}` : '';
      const [row] = await ctx.db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status='open')::int     AS open,
                COUNT(*) FILTER (WHERE status='pending')::int  AS pending,
                COUNT(*) FILTER (WHERE status='resolved')::int AS resolved
         FROM conversations WHERE tenant_id=$1 ${where}`,
        [ctx.tenantId],
      );
      return { ok: true, period: p in sinceSql ? p : 'today', total: row?.total ?? 0, open: row?.open ?? 0, pending: row?.pending ?? 0, resolved: row?.resolved ?? 0 };
    },
  },
  {
    name: 'get_deals_stats',
    description: 'Estadísticas de ventas: pipeline abierto (valor y nº actual), y ganados/perdidos + valor ganado + tasa de cierre en el período. Úsalo para "¿cuánto vendimos este mes?", "¿cuál es mi pipeline?", "tasa de cierre".',
    parameters: { type: 'object', properties: { period: { type: 'string', description: 'today|week|month|all para ganados/perdidos (default month). El pipeline abierto es actual, no depende del período.' } }, required: [] },
    handler: async (ctx, args) => {
      const { period, since } = periodSince(args.period, 'month');
      const [pipe] = await ctx.db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(value),0)::numeric AS v
         FROM deals WHERE tenant_id=$1 AND status NOT IN ('won','lost')`,
        [ctx.tenantId],
      );
      const where = since ? `AND created_at >= ${since}` : '';
      const [row] = await ctx.db.query(
        `SELECT COUNT(*) FILTER (WHERE status='won')::int  AS won,
                COUNT(*) FILTER (WHERE status='lost')::int AS lost,
                COALESCE(SUM(value) FILTER (WHERE status='won'),0)::numeric AS won_value,
                ROUND(100.0 * COUNT(*) FILTER (WHERE status='won') / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')),0),1)::numeric AS win_rate
         FROM deals WHERE tenant_id=$1 ${where}`,
        [ctx.tenantId],
      );
      return {
        ok: true, period,
        open_deals: pipe?.n ?? 0, open_pipeline_value: Number(pipe?.v ?? 0),
        won: row?.won ?? 0, lost: row?.lost ?? 0, won_value: Number(row?.won_value ?? 0),
        win_rate: row?.win_rate == null ? null : Number(row.win_rate),
      };
    },
  },
  {
    name: 'get_tasks_due',
    description: 'Tareas PENDIENTES por vencimiento: today (vencen hoy), overdue (atrasadas) o week (próximos 7 días). Úsalo para "¿qué tareas tengo hoy?", "¿tengo tareas atrasadas?".',
    parameters: { type: 'object', properties: { filter: { type: 'string', description: 'today|overdue|week (default today)' } }, required: [] },
    handler: async (ctx, args) => {
      const cond: Record<string, string> = {
        today: 't.due_date::date = current_date',
        overdue: 't.due_date::date < current_date',
        week: "t.due_date::date BETWEEN current_date AND current_date + interval '7 days'",
      };
      const f = String(args.filter ?? 'today').toLowerCase();
      const c = f in cond ? cond[f] : cond.today;
      const rows = await ctx.db.query(
        `SELECT t.id, t.title, t.due_date, t.priority, ct.full_name AS contact
         FROM tasks t LEFT JOIN contacts ct ON ct.id = t.contact_id
         WHERE t.tenant_id=$1 AND t.status='pending' AND t.due_date IS NOT NULL AND ${c}
         ORDER BY t.due_date ASC LIMIT 30`,
        [ctx.tenantId],
      );
      return { ok: true, filter: f in cond ? f : 'today', count: rows.length, tasks: rows };
    },
  },
  {
    name: 'get_contacts_stats',
    description: 'Cuántos contactos NUEVOS se agregaron en el período (hoy/semana/mes) y el total. Úsalo para "¿cuántos contactos nuevos esta semana?".',
    parameters: { type: 'object', properties: { period: { type: 'string', description: 'today|week|month|all (default month)' } }, required: [] },
    handler: async (ctx, args) => {
      const { period, since } = periodSince(args.period, 'month');
      const [tot] = await ctx.db.query(`SELECT COUNT(*)::int AS n FROM contacts WHERE tenant_id=$1`, [ctx.tenantId]);
      let newInPeriod = tot?.n ?? 0;
      if (since) {
        const [a] = await ctx.db.query(`SELECT COUNT(*)::int AS n FROM contacts WHERE tenant_id=$1 AND created_at >= ${since}`, [ctx.tenantId]);
        newInPeriod = a?.n ?? 0;
      }
      return { ok: true, period, total_contacts: tot?.n ?? 0, new_in_period: newInPeriod };
    },
  },
  {
    name: 'get_appointment_stats',
    description: 'Cuántas citas hay en el período según su fecha programada (today/week/month), con la lista. Úsalo para "¿cuántas citas hay hoy?".',
    parameters: { type: 'object', properties: { period: { type: 'string', description: 'today|week|month (default today)' } }, required: [] },
    handler: async (ctx, args) => {
      const range: Record<string, string> = {
        today: 'a.scheduled_at::date = current_date',
        week: "a.scheduled_at >= date_trunc('week', now()) AND a.scheduled_at < date_trunc('week', now()) + interval '7 days'",
        month: "date_trunc('month', a.scheduled_at) = date_trunc('month', now())",
      };
      const key = String(args.period ?? 'today').toLowerCase();
      const cond = key in range ? range[key] : range.today;
      const rows = await ctx.db.query(
        `SELECT a.id, a.title, a.scheduled_at, a.status, ct.full_name AS contact
         FROM appointments a LEFT JOIN contacts ct ON ct.id = a.contact_id
         WHERE a.tenant_id=$1 AND ${cond} ORDER BY a.scheduled_at ASC LIMIT 30`,
        [ctx.tenantId],
      );
      return { ok: true, period: key in range ? key : 'today', count: rows.length, appointments: rows };
    },
  },
  {
    name: 'list_recent_conversations',
    description: 'Lista las conversaciones más recientes (contacto, estado, canal, última actividad) para luego LEER una con get_conversation_messages. Opcional: filtrar por estado. Hasta 15.',
    parameters: { type: 'object', properties: { status: { type: 'string', description: 'open|pending|resolved (opcional)' } }, required: [] },
    handler: async (ctx, args) => {
      const params: any[] = [ctx.tenantId];
      let where = 'c.tenant_id=$1';
      const st = String(args.status ?? '').trim().toLowerCase();
      if (['open', 'pending', 'resolved'].includes(st)) { params.push(st); where += ` AND c.status=$${params.length}`; }
      const rows = await ctx.db.query(
        `SELECT c.id, c.status, c.channel_type, c.updated_at,
                COALESCE(NULLIF(ct.full_name,''), ct.email, ct.phone, 'Sin contacto') AS contact
         FROM conversations c LEFT JOIN contacts ct ON ct.id = c.contact_id
         WHERE ${where} ORDER BY c.updated_at DESC LIMIT 15`,
        params,
      );
      return { ok: true, count: rows.length, conversations: rows };
    },
  },
  {
    name: 'get_conversation_messages',
    description: 'Lee los últimos mensajes de una conversación (usa list_recent_conversations para el id) para resumirla o responder sobre su contenido. Excluye notas privadas.',
    parameters: {
      type: 'object',
      properties: { conversation_id: { type: 'string' }, limit: { type: 'number', description: 'Cuántos mensajes (default 20, máx 50)' } },
      required: ['conversation_id'],
    },
    handler: async (ctx, args) => {
      const lim = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const [conv] = await ctx.db.query(`SELECT id FROM conversations WHERE id=$1 AND tenant_id=$2`, [args.conversation_id, ctx.tenantId]);
      if (!conv) return { ok: false, error: 'Conversación no encontrada' };
      const rows = await ctx.db.query(
        `SELECT direction, sender_type, body, content_type, created_at
         FROM messages
         WHERE conversation_id=$1 AND is_private=false AND content_type <> 'activity'
         ORDER BY created_at DESC LIMIT ${lim}`,
        [args.conversation_id],
      );
      rows.reverse();
      return { ok: true, count: rows.length, messages: rows };
    },
  },
  {
    name: 'update_contact',
    description: 'Actualizar datos de un contacto (nombre, teléfono, email, puesto, notas). Usa search_contacts primero para el contact_id. Solo cambia los campos que envíes.',
    parameters: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'ID del contacto' },
        full_name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
        job_title: { type: 'string', description: 'Puesto/cargo' },
        notes: { type: 'string', description: 'Notas del contacto (reemplaza las existentes)' },
      },
      required: ['contact_id'],
    },
    handler: async (ctx, args) => {
      const sets: string[] = []; const params: any[] = [];
      if (String(args.full_name ?? '').trim()) { params.push(args.full_name.trim()); sets.push(`full_name=$${params.length}`); }
      if (String(args.phone ?? '').trim()) { params.push(args.phone.trim()); sets.push(`phone=$${params.length}`); }
      if (String(args.email ?? '').trim()) { params.push(args.email.trim()); sets.push(`email=$${params.length}`); }
      if (String(args.job_title ?? '').trim()) { params.push(args.job_title.trim()); sets.push(`job_title=$${params.length}`); }
      if (args.notes !== undefined) { params.push(String(args.notes ?? '')); sets.push(`notes=$${params.length}`); }
      if (!sets.length) return { ok: false, error: 'Nada que actualizar' };
      params.push(args.contact_id, ctx.tenantId);
      const r = await ctx.db.query(
        `UPDATE contacts SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length - 1} AND tenant_id=$${params.length} RETURNING id, full_name, phone, email, job_title, notes`,
        params,
      );
      if (!r.length) return { ok: false, error: 'Contacto no encontrado' };
      return { ok: true, contact: r[0] };
    },
  },
  {
    name: 'list_pipeline_stages',
    description: 'Listar las etapas del pipeline (para saber a qué etapa crear o mover un deal).',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT ps.name FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
         WHERE p.tenant_id=$1 ORDER BY ps.position`,
        [ctx.tenantId],
      );
      return { ok: true, stages: rows.map((r: any) => r.name) };
    },
  },
  {
    name: 'list_deals',
    description: 'Listar deals abiertos (opcionalmente filtrando por nombre de etapa). Hasta 20.',
    parameters: { type: 'object', properties: { stage: { type: 'string', description: 'Filtrar por etapa (opcional)' } }, required: [] },
    handler: async (ctx, args) => {
      const params: any[] = [ctx.tenantId];
      let where = `d.tenant_id=$1 AND d.status='open'`;
      if (String(args.stage ?? '').trim()) { params.push(`%${args.stage.trim()}%`); where += ` AND ps.name ILIKE $${params.length}`; }
      const rows = await ctx.db.query(
        `SELECT d.id, d.title, d.value, d.currency, ps.name AS stage, ct.full_name AS contact
         FROM deals d
         LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
         LEFT JOIN contacts ct ON ct.id = d.contact_id
         WHERE ${where} ORDER BY d.updated_at DESC LIMIT 20`,
        params,
      );
      return { ok: true, count: rows.length, deals: rows };
    },
  },
  {
    name: 'create_deal',
    description: 'Crear un deal para un contacto. Usa search_contacts para el contact_id y list_pipeline_stages para la etapa.',
    parameters: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'ID del contacto (de search_contacts)' },
        title: { type: 'string' },
        value: { type: 'number' },
        currency: { type: 'string', description: 'USD/GBP/EUR' },
        stage: { type: 'string', description: 'Nombre de la etapa' },
        notes: { type: 'string' },
      },
      required: ['contact_id', 'title'],
    },
    handler: async (ctx, args) => {
      const [c] = await ctx.db.query(`SELECT id FROM contacts WHERE id=$1 AND tenant_id=$2`, [args.contact_id, ctx.tenantId]);
      if (!c) return { ok: false, error: 'Contacto no encontrado' };
      let stageId: any = null;
      if (String(args.stage ?? '').trim()) {
        const [s] = await ctx.db.query(
          `SELECT ps.id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id WHERE p.tenant_id=$1 AND ps.name ILIKE $2 LIMIT 1`,
          [ctx.tenantId, args.stage.trim()],
        );
        stageId = s?.id ?? null;
      }
      const [row] = await ctx.db.query(
        `INSERT INTO deals (tenant_id, contact_id, title, value, currency, stage_id, notes, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'open',NOW(),NOW()) RETURNING id, title`,
        [ctx.tenantId, args.contact_id, String(args.title), args.value ?? 0, args.currency ?? 'USD', stageId, args.notes ?? null],
      );
      return { ok: true, deal: row };
    },
  },
  {
    name: 'move_deal',
    description: 'Mover un deal a otra etapa del pipeline.',
    parameters: {
      type: 'object',
      properties: { deal_id: { type: 'string' }, stage: { type: 'string', description: 'Etapa destino' } },
      required: ['deal_id', 'stage'],
    },
    handler: async (ctx, args) => {
      const [s] = await ctx.db.query(
        `SELECT ps.id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id WHERE p.tenant_id=$1 AND ps.name ILIKE $2 LIMIT 1`,
        [ctx.tenantId, String(args.stage ?? '').trim()],
      );
      if (!s) return { ok: false, error: `La etapa "${args.stage}" no existe` };
      const r = await ctx.db.query(`UPDATE deals SET stage_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING id`, [s.id, args.deal_id, ctx.tenantId]);
      if (!r.length) return { ok: false, error: 'Deal no encontrado' };
      return { ok: true, moved: true };
    },
  },
  {
    name: 'update_deal',
    description: 'Actualizar los datos de un deal (título, valor, moneda, notas, estado). Usa list_deals para el deal_id. Para cambiar de etapa usa move_deal. Solo cambia los campos que envíes.',
    parameters: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        title: { type: 'string' },
        value: { type: 'number' },
        currency: { type: 'string', description: 'USD/GBP/EUR' },
        notes: { type: 'string', description: 'Notas del deal (reemplaza las existentes)' },
        status: { type: 'string', description: 'Estado: open (abierto), won (ganado) o lost (perdido)' },
      },
      required: ['deal_id'],
    },
    handler: async (ctx, args) => {
      const sets: string[] = []; const params: any[] = [];
      if (String(args.title ?? '').trim()) { params.push(args.title.trim()); sets.push(`title=$${params.length}`); }
      if (args.value !== undefined && args.value !== null && !Number.isNaN(Number(args.value))) { params.push(Number(args.value)); sets.push(`value=$${params.length}`); }
      if (String(args.currency ?? '').trim()) { params.push(args.currency.trim().toUpperCase()); sets.push(`currency=$${params.length}`); }
      if (args.notes !== undefined) { params.push(String(args.notes ?? '')); sets.push(`notes=$${params.length}`); }
      if (String(args.status ?? '').trim()) {
        const st = String(args.status).trim().toLowerCase();
        if (!['open', 'won', 'lost'].includes(st)) return { ok: false, error: 'status debe ser open, won o lost' };
        params.push(st); sets.push(`status=$${params.length}`);
      }
      if (!sets.length) return { ok: false, error: 'Nada que actualizar' };
      params.push(args.deal_id, ctx.tenantId);
      const r = await ctx.db.query(
        `UPDATE deals SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length - 1} AND tenant_id=$${params.length} RETURNING id, title, value, currency, status`,
        params,
      );
      if (!r.length) return { ok: false, error: 'Deal no encontrado' };
      return { ok: true, deal: r[0] };
    },
  },
  {
    name: 'create_task',
    description: 'Crear una tarea (opcionalmente ligada a un contacto).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'Fecha ISO YYYY-MM-DD (opcional)' },
        priority: { type: 'string', description: 'low/medium/high' },
        contact_id: { type: 'string', description: 'ID del contacto (opcional)' },
      },
      required: ['title'],
    },
    handler: async (ctx, args) => {
      let contactId = args.contact_id ?? null;
      if (contactId) {
        const [c] = await ctx.db.query(`SELECT id FROM contacts WHERE id=$1 AND tenant_id=$2`, [contactId, ctx.tenantId]);
        if (!c) contactId = null;
      }
      const [row] = await ctx.db.query(
        `INSERT INTO tasks (tenant_id, contact_id, title, description, due_date, priority, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::timestamptz,$6,'pending',NOW(),NOW()) RETURNING id, title`,
        [ctx.tenantId, contactId, String(args.title), args.description ?? null, args.due_date ?? null, args.priority ?? 'medium'],
      );
      return { ok: true, task: row };
    },
  },
  {
    name: 'list_tasks',
    description: 'Listar tareas pendientes (hasta 20).',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT t.id, t.title, t.due_date, t.priority, ct.full_name AS contact
         FROM tasks t LEFT JOIN contacts ct ON ct.id = t.contact_id
         WHERE t.tenant_id=$1 AND t.status='pending' ORDER BY t.due_date ASC NULLS LAST LIMIT 20`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, tasks: rows };
    },
  },
  {
    name: 'list_campaigns',
    description: 'Listar campañas y su estado/estadísticas (enviadas/entregadas/abiertas). Hasta 20.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT id, name, type, status, sent_count, delivered_count, opened_count
         FROM campaigns WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 20`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, campaigns: rows };
    },
  },
  {
    name: 'list_content',
    description: 'Listar el contenido de marketing (título, estado, canal, fechas). Hasta 20.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT id, title, status, channel, scheduled_at, published_at
         FROM content_posts WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 20`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, content: rows };
    },
  },
  {
    name: 'list_appointments',
    description: 'Listar citas/recordatorios próximos (desde ayer en adelante). Hasta 20.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT a.id, a.title, a.scheduled_at, a.status, ct.full_name AS contact
         FROM appointments a LEFT JOIN contacts ct ON ct.id = a.contact_id
         WHERE a.tenant_id=$1 AND a.scheduled_at >= NOW() - interval '1 day'
         ORDER BY a.scheduled_at ASC LIMIT 20`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, appointments: rows };
    },
  },
  {
    name: 'list_contact_lists',
    description: 'Listar las listas de contactos. Hasta 30.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT id, name, description FROM contact_lists WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, lists: rows };
    },
  },
  {
    name: 'create_contact_list',
    description: 'Crear una nueva lista de contactos.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' } },
      required: ['name'],
    },
    handler: async (ctx, args) => {
      const name = String(args.name ?? '').trim();
      if (!name) return { ok: false, error: 'Falta el nombre de la lista' };
      const [row] = await ctx.db.query(
        `INSERT INTO contact_lists (tenant_id, name, description, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id, name`,
        [ctx.tenantId, name, args.description ?? null],
      );
      return { ok: true, list: row };
    },
  },
  {
    name: 'add_contact_to_list',
    description: 'Agregar un contacto a una lista de contactos (usa search_contacts y list_contact_lists para los IDs).',
    parameters: {
      type: 'object',
      properties: { contact_id: { type: 'string' }, list_id: { type: 'string' } },
      required: ['contact_id', 'list_id'],
    },
    handler: async (ctx, args) => {
      const [c] = await ctx.db.query(`SELECT id FROM contacts WHERE id=$1 AND tenant_id=$2`, [args.contact_id, ctx.tenantId]);
      if (!c) return { ok: false, error: 'Contacto no encontrado' };
      const [l] = await ctx.db.query(`SELECT id FROM contact_lists WHERE id=$1 AND tenant_id=$2`, [args.list_id, ctx.tenantId]);
      if (!l) return { ok: false, error: 'Lista no encontrada' };
      await ctx.db.query(`INSERT INTO contact_list_contacts (list_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [args.list_id, args.contact_id]);
      return { ok: true, added: true };
    },
  },
  {
    name: 'list_tags',
    description: 'Listar las etiquetas (tags) disponibles.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(`SELECT id, name FROM tags WHERE tenant_id=$1 ORDER BY name`, [ctx.tenantId]);
      return { ok: true, count: rows.length, tags: rows };
    },
  },
  {
    name: 'add_tag_to_contact',
    description: 'Poner una etiqueta (existente) a un contacto. Usa list_tags para ver las disponibles.',
    parameters: {
      type: 'object',
      properties: { contact_id: { type: 'string' }, tag_name: { type: 'string' } },
      required: ['contact_id', 'tag_name'],
    },
    handler: async (ctx, args) => {
      const [c] = await ctx.db.query(`SELECT id FROM contacts WHERE id=$1 AND tenant_id=$2`, [args.contact_id, ctx.tenantId]);
      if (!c) return { ok: false, error: 'Contacto no encontrado' };
      const [tag] = await ctx.db.query(`SELECT id FROM tags WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`, [ctx.tenantId, String(args.tag_name ?? '').trim()]);
      if (!tag) return { ok: false, error: `La etiqueta "${args.tag_name}" no existe (créala primero en Tags)` };
      await ctx.db.query(`INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [args.contact_id, tag.id]);
      return { ok: true, tagged: true };
    },
  },
  {
    name: 'remove_tag_from_contact',
    description: 'Quitar una etiqueta de un contacto.',
    parameters: {
      type: 'object',
      properties: { contact_id: { type: 'string' }, tag_name: { type: 'string' } },
      required: ['contact_id', 'tag_name'],
    },
    handler: async (ctx, args) => {
      const [tag] = await ctx.db.query(`SELECT id FROM tags WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`, [ctx.tenantId, String(args.tag_name ?? '').trim()]);
      if (!tag) return { ok: false, error: `La etiqueta "${args.tag_name}" no existe` };
      await ctx.db.query(`DELETE FROM contact_tags WHERE contact_id=$1 AND tag_id=$2`, [args.contact_id, tag.id]);
      return { ok: true, removed: true };
    },
  },
  {
    name: 'list_connections',
    description: 'Listar los canales/conexiones y su estado (WhatsApp, email, etc.). NO expone credenciales.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT name, channel_type, status FROM channel_connections WHERE tenant_id=$1 ORDER BY channel_type`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, connections: rows };
    },
  },
  {
    name: 'delete_task',
    sensitive: true,
    description: 'Eliminar una tarea. ACCIÓN DESTRUCTIVA — el usuario debe confirmar antes.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        confirm: { type: 'boolean', description: 'true SOLO si el usuario ya confirmó explícitamente' },
      },
      required: ['task_id'],
    },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(`DELETE FROM tasks WHERE id=$1 AND tenant_id=$2 RETURNING id`, [args.task_id, ctx.tenantId]);
      if (!r.length) return { ok: false, error: 'Tarea no encontrada' };
      return { ok: true, deleted: true };
    },
  },
  {
    name: 'launch_campaign',
    sensitive: true,
    description: 'Lanzar (poner en marcha) una campaña existente. ENVÍA mensajes reales a los destinatarios y tiene COSTO. El usuario debe confirmar antes.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        confirm: { type: 'boolean', description: 'true SOLO tras confirmación explícita del usuario' },
      },
      required: ['campaign_id'],
    },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(
        `UPDATE campaigns SET status='running', started_at=COALESCE(started_at, NOW()), updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2 AND status IN ('draft','scheduled','paused') RETURNING id, name, type`,
        [args.campaign_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Campaña no encontrada o no está en un estado lanzable (draft/scheduled/paused).' };
      return { ok: true, launched: true, campaign: r[0] };
    },
  },
  {
    name: 'pause_campaign',
    description: 'Pausar una campaña que está en marcha (reversible).',
    parameters: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(
        `UPDATE campaigns SET status='paused', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND status='running' RETURNING id, name`,
        [args.campaign_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Campaña no encontrada o no está en marcha.' };
      return { ok: true, paused: true, campaign: r[0] };
    },
  },
  {
    name: 'publish_content',
    sensitive: true,
    description: 'Publicar un contenido de marketing (lo marca como publicado). El usuario debe confirmar antes.',
    parameters: {
      type: 'object',
      properties: {
        content_id: { type: 'string' },
        confirm: { type: 'boolean', description: 'true SOLO tras confirmación explícita del usuario' },
      },
      required: ['content_id'],
    },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(
        `UPDATE content_posts SET status='published', published_at=COALESCE(published_at, NOW()), updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2 RETURNING id, title`,
        [args.content_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Contenido no encontrado' };
      return { ok: true, published: true, content: r[0] };
    },
  },

  // ── Batch: conversation actions ────────────────────────────────────────────
  {
    name: 'list_users',
    description: 'Lista los agentes/usuarios activos del equipo (id, nombre, email, rol). Úsalo para saber a quién asignar una conversación.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(
        `SELECT id, full_name, email, role FROM users WHERE tenant_id=$1 AND is_active=true ORDER BY full_name`,
        [ctx.tenantId],
      );
      return { ok: true, count: rows.length, users: rows };
    },
  },
  {
    name: 'resolve_conversation',
    description: 'Marca una conversación como resuelta. Usa list_recent_conversations para el id.',
    parameters: { type: 'object', properties: { conversation_id: { type: 'string' } }, required: ['conversation_id'] },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(
        `UPDATE conversations SET status='resolved', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING id`,
        [args.conversation_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Conversación no encontrada' };
      return { ok: true, resolved: true };
    },
  },
  {
    name: 'assign_conversation',
    description: 'Asigna una conversación a un agente. Usa list_users para el agent_id y list_recent_conversations para el conversation_id.',
    parameters: { type: 'object', properties: { conversation_id: { type: 'string' }, agent_id: { type: 'string' } }, required: ['conversation_id', 'agent_id'] },
    handler: async (ctx, args) => {
      const [u] = await ctx.db.query(`SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND is_active=true`, [args.agent_id, ctx.tenantId]);
      if (!u) return { ok: false, error: 'Agente no encontrado' };
      const r = await ctx.db.query(
        `UPDATE conversations SET assigned_to=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING id`,
        [args.agent_id, args.conversation_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Conversación no encontrada' };
      return { ok: true, assigned: true };
    },
  },
  {
    name: 'add_conversation_note',
    description: 'Agrega una NOTA INTERNA (privada, no la ve el cliente) a una conversación. Úsalo para dejar contexto al equipo.',
    parameters: { type: 'object', properties: { conversation_id: { type: 'string' }, note: { type: 'string' } }, required: ['conversation_id', 'note'] },
    handler: async (ctx, args) => {
      const note = String(args.note ?? '').trim();
      if (!note) return { ok: false, error: 'La nota está vacía' };
      const [conv] = await ctx.db.query(`SELECT id FROM conversations WHERE id=$1 AND tenant_id=$2`, [args.conversation_id, ctx.tenantId]);
      if (!conv) return { ok: false, error: 'Conversación no encontrada' };
      await ctx.db.query(
        `INSERT INTO messages (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
         VALUES ($1,$2,$3,'text','outbound','agent',true,NOW(),NOW())`,
        [ctx.tenantId, args.conversation_id, note],
      );
      return { ok: true, added: true };
    },
  },
  {
    name: 'add_tag_to_conversation',
    description: 'Etiqueta una conversación con una etiqueta existente (usa list_tags). No la crea si no existe.',
    parameters: { type: 'object', properties: { conversation_id: { type: 'string' }, tag_name: { type: 'string' } }, required: ['conversation_id', 'tag_name'] },
    handler: async (ctx, args) => {
      const [conv] = await ctx.db.query(`SELECT id FROM conversations WHERE id=$1 AND tenant_id=$2`, [args.conversation_id, ctx.tenantId]);
      if (!conv) return { ok: false, error: 'Conversación no encontrada' };
      const [tag] = await ctx.db.query(`SELECT id FROM tags WHERE tenant_id=$1 AND name ILIKE $2 LIMIT 1`, [ctx.tenantId, String(args.tag_name ?? '').trim()]);
      if (!tag) return { ok: false, error: `La etiqueta "${args.tag_name}" no existe (usa create_tag primero)` };
      await ctx.db.query(
        `INSERT INTO conversation_tags (conversation_id, tag_id, tenant_id, created_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT DO NOTHING`,
        [args.conversation_id, tag.id, ctx.tenantId],
      );
      return { ok: true, tagged: true };
    },
  },

  // ── Batch: task & appointment actions ──────────────────────────────────────
  {
    name: 'complete_task',
    description: 'Marca una tarea como completada. Usa list_tasks o get_tasks_due para el task_id.',
    parameters: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(
        `UPDATE tasks SET status='completed', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING id, title`,
        [args.task_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Tarea no encontrada' };
      return { ok: true, completed: true, task: r[0] };
    },
  },
  {
    name: 'update_task',
    description: 'Actualiza una tarea (título, descripción, fecha límite, prioridad). Solo cambia los campos que envíes.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string' }, description: { type: 'string' },
        due_date: { type: 'string', description: 'Fecha ISO YYYY-MM-DD' },
        priority: { type: 'string', description: 'low/medium/high' },
      },
      required: ['task_id'],
    },
    handler: async (ctx, args) => {
      const sets: string[] = []; const params: any[] = [];
      if (String(args.title ?? '').trim()) { params.push(args.title.trim()); sets.push(`title=$${params.length}`); }
      if (args.description !== undefined) { params.push(String(args.description ?? '')); sets.push(`description=$${params.length}`); }
      if (String(args.due_date ?? '').trim()) { params.push(args.due_date.trim()); sets.push(`due_date=$${params.length}`); }
      if (String(args.priority ?? '').trim()) { params.push(args.priority.trim().toLowerCase()); sets.push(`priority=$${params.length}`); }
      if (!sets.length) return { ok: false, error: 'Nada que actualizar' };
      params.push(args.task_id, ctx.tenantId);
      const r = await ctx.db.query(
        `UPDATE tasks SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length - 1} AND tenant_id=$${params.length} RETURNING id, title`,
        params,
      );
      if (!r.length) return { ok: false, error: 'Tarea no encontrada' };
      return { ok: true, task: r[0] };
    },
  },
  {
    name: 'create_appointment',
    description: 'Crea una cita/recordatorio con fecha y hora. scheduled_at en ISO (YYYY-MM-DDTHH:MM). Opcional: contacto.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        scheduled_at: { type: 'string', description: 'Fecha y hora ISO, ej. 2026-08-20T15:30' },
        contact_id: { type: 'string', description: 'ID del contacto (opcional)' },
      },
      required: ['title', 'scheduled_at'],
    },
    handler: async (ctx, args) => {
      if (!String(args.scheduled_at ?? '').trim()) return { ok: false, error: 'scheduled_at es obligatorio' };
      const [row] = await ctx.db.query(
        `INSERT INTO appointments (tenant_id, contact_id, title, scheduled_at, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4::timestamptz,'pending',NOW(),NOW()) RETURNING id, title, scheduled_at`,
        [ctx.tenantId, args.contact_id ?? null, String(args.title), args.scheduled_at],
      );
      return { ok: true, appointment: row };
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela una cita. Usa list_appointments/get_appointment_stats para el appointment_id.',
    parameters: { type: 'object', properties: { appointment_id: { type: 'string' } }, required: ['appointment_id'] },
    handler: async (ctx, args) => {
      const r = await ctx.db.query(
        `UPDATE appointments SET status='cancelled', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING id`,
        [args.appointment_id, ctx.tenantId],
      );
      if (!r.length) return { ok: false, error: 'Cita no encontrada' };
      return { ok: true, cancelled: true };
    },
  },

  // ── Batch: creation & management ───────────────────────────────────────────
  {
    name: 'create_tag',
    description: 'Crea una etiqueta nueva (nombre y color opcional). Si ya existe una con ese nombre, la devuelve.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string', description: 'Color hex, ej. #6366f1' } }, required: ['name'] },
    handler: async (ctx, args) => {
      const name = String(args.name ?? '').trim();
      if (!name) return { ok: false, error: 'name es obligatorio' };
      const [existing] = await ctx.db.query(`SELECT id, name, color FROM tags WHERE tenant_id=$1 AND name ILIKE $2 LIMIT 1`, [ctx.tenantId, name]);
      if (existing) return { ok: true, tag: existing, existed: true };
      const [row] = await ctx.db.query(
        `INSERT INTO tags (tenant_id, name, color, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id, name, color`,
        [ctx.tenantId, name, args.color ?? '#6366f1'],
      );
      return { ok: true, tag: row };
    },
  },
  {
    name: 'create_content',
    description: 'Crea un contenido de marketing en borrador (título, cuerpo, canal). Para publicarlo usa publish_content.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        channel: { type: 'string', description: 'blog|instagram|facebook|linkedin|twitter|youtube|other (default blog)' },
        scheduled_at: { type: 'string', description: 'Fecha ISO para programar (opcional)' },
      },
      required: ['title'],
    },
    handler: async (ctx, args) => {
      const [row] = await ctx.db.query(
        `INSERT INTO content_posts (tenant_id, title, body, channel, status, scheduled_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'draft',$5,NOW(),NOW()) RETURNING id, title, channel, status`,
        [ctx.tenantId, String(args.title), args.body ?? null, args.channel ?? 'blog', args.scheduled_at ?? null],
      );
      return { ok: true, content: row };
    },
  },
  {
    name: 'create_campaign',
    description: 'Crea una campaña en borrador (nombre y tipo: email|whatsapp|sms|phone). NO la lanza — para eso usa launch_campaign tras revisarla.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', description: 'email|whatsapp|sms|phone (default email)' } }, required: ['name'] },
    handler: async (ctx, args) => {
      const type = ['email', 'whatsapp', 'sms', 'phone'].includes(String(args.type ?? '').toLowerCase()) ? String(args.type).toLowerCase() : 'email';
      const [row] = await ctx.db.query(
        `INSERT INTO campaigns (tenant_id, name, type, status, created_at, updated_at) VALUES ($1,$2,$3,'draft',NOW(),NOW()) RETURNING id, name, type, status`,
        [ctx.tenantId, String(args.name), type],
      );
      return { ok: true, campaign: row };
    },
  },
  {
    name: 'list_list_contacts',
    description: 'Lista los contactos de una lista de contactos (usa list_contact_lists para el list_id). Hasta 50.',
    parameters: { type: 'object', properties: { list_id: { type: 'string' } }, required: ['list_id'] },
    handler: async (ctx, args) => {
      const [l] = await ctx.db.query(`SELECT id FROM contact_lists WHERE id=$1 AND tenant_id=$2`, [args.list_id, ctx.tenantId]);
      if (!l) return { ok: false, error: 'Lista no encontrada' };
      const rows = await ctx.db.query(
        `SELECT ct.id, ct.full_name, ct.phone, ct.email
         FROM contact_list_contacts lc JOIN contacts ct ON ct.id = lc.contact_id
         WHERE lc.list_id=$1 AND ct.tenant_id=$2 ORDER BY ct.full_name LIMIT 50`,
        [args.list_id, ctx.tenantId],
      );
      return { ok: true, count: rows.length, contacts: rows };
    },
  },
  {
    name: 'remove_contact_from_list',
    description: 'Quita un contacto de una lista.',
    parameters: { type: 'object', properties: { list_id: { type: 'string' }, contact_id: { type: 'string' } }, required: ['list_id', 'contact_id'] },
    handler: async (ctx, args) => {
      const [l] = await ctx.db.query(`SELECT id FROM contact_lists WHERE id=$1 AND tenant_id=$2`, [args.list_id, ctx.tenantId]);
      if (!l) return { ok: false, error: 'Lista no encontrada' };
      await ctx.db.query(`DELETE FROM contact_list_contacts WHERE list_id=$1 AND contact_id=$2`, [args.list_id, args.contact_id]);
      return { ok: true, removed: true };
    },
  },
  {
    name: 'list_queues',
    description: 'Lista las colas de atención activas (id, nombre) para enrutar conversaciones.',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(`SELECT id, name FROM queues WHERE tenant_id=$1 AND is_active=true ORDER BY name`, [ctx.tenantId]);
      return { ok: true, count: rows.length, queues: rows };
    },
  },
  {
    name: 'list_teams',
    description: 'Lista los equipos (id, nombre).',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async (ctx) => {
      const rows = await ctx.db.query(`SELECT id, name FROM teams WHERE tenant_id=$1 ORDER BY name`, [ctx.tenantId]);
      return { ok: true, count: rows.length, teams: rows };
    },
  },

  // ── Batch: setup / onboarding (estructura del CRM) ──────────────────────────
  {
    name: 'create_pipeline',
    description: 'Crea un pipeline (embudo) de ventas. Luego agrégale etapas con create_stage. Úsalo al configurar el CRM.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, is_default: { type: 'boolean', description: 'Marcar como pipeline por defecto' } }, required: ['name'] },
    handler: async (ctx, args) => {
      const name = String(args.name ?? '').trim();
      if (!name) return { ok: false, error: 'name es obligatorio' };
      const [row] = await ctx.db.query(
        `INSERT INTO pipelines (tenant_id, name, is_default, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id, name`,
        [ctx.tenantId, name, args.is_default === true],
      );
      return { ok: true, pipeline: row };
    },
  },
  {
    name: 'create_stage',
    description: 'Crea una etapa dentro de un pipeline. Indica el pipeline por nombre o id (o se usa el primero). Si no das posición, se agrega al final.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        pipeline: { type: 'string', description: 'Nombre o id del pipeline (opcional; por defecto el primero)' },
        position: { type: 'number', description: 'Orden (opcional)' },
      },
      required: ['name'],
    },
    handler: async (ctx, args) => {
      const name = String(args.name ?? '').trim();
      if (!name) return { ok: false, error: 'name es obligatorio' };
      let pipelineId: string | null = null;
      const pref = String(args.pipeline ?? '').trim();
      if (pref) {
        const [p] = await ctx.db.query(`SELECT id FROM pipelines WHERE tenant_id=$1 AND (id::text=$2 OR name ILIKE $2) LIMIT 1`, [ctx.tenantId, pref]);
        pipelineId = p?.id ?? null;
        if (!pipelineId) return { ok: false, error: `Pipeline "${pref}" no encontrado` };
      } else {
        const [p] = await ctx.db.query(`SELECT id FROM pipelines WHERE tenant_id=$1 ORDER BY is_default DESC, created_at ASC LIMIT 1`, [ctx.tenantId]);
        pipelineId = p?.id ?? null;
        if (!pipelineId) return { ok: false, error: 'No hay pipelines. Crea uno con create_pipeline primero.' };
      }
      let position = args.position;
      if (position === undefined || position === null) {
        const [m] = await ctx.db.query(`SELECT COALESCE(MAX(position),-1)+1 AS pos FROM pipeline_stages WHERE pipeline_id=$1`, [pipelineId]);
        position = m?.pos ?? 0;
      }
      const [row] = await ctx.db.query(
        `INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, position, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id, name, position`,
        [ctx.tenantId, pipelineId, name, Number(position)],
      );
      return { ok: true, stage: row };
    },
  },
  {
    name: 'create_team',
    description: 'Crea un equipo (para agrupar agentes). Úsalo al configurar el CRM.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] },
    handler: async (ctx, args) => {
      const name = String(args.name ?? '').trim();
      if (!name) return { ok: false, error: 'name es obligatorio' };
      const [row] = await ctx.db.query(
        `INSERT INTO teams (tenant_id, name, description, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id, name`,
        [ctx.tenantId, name, args.description ?? null],
      );
      return { ok: true, team: row };
    },
  },
  {
    name: 'create_queue',
    description: 'Crea una cola de atención (para enrutar conversaciones). Úsalo al configurar el CRM.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] },
    handler: async (ctx, args) => {
      const name = String(args.name ?? '').trim();
      if (!name) return { ok: false, error: 'name es obligatorio' };
      const [row] = await ctx.db.query(
        `INSERT INTO queues (tenant_id, name, description, is_active, created_at, updated_at) VALUES ($1,$2,$3,true,NOW(),NOW()) RETURNING id, name`,
        [ctx.tenantId, name, args.description ?? null],
      );
      return { ok: true, queue: row };
    },
  },
  {
    name: 'list_payment_links',
    description: 'Lista los links de pago generados (por el bot o agentes) con su estado: pending (pendiente), paid (pagado) o expired (expirado). Filtra por estado opcional. Úsalo para "¿quién no ha pagado?", "¿cuánto cobramos?", "links pendientes".',
    parameters: { type: 'object', properties: { status: { type: 'string', description: 'paid|pending|expired (opcional)' } }, required: [] },
    handler: async (ctx, args) => {
      const params: any[] = [ctx.tenantId];
      let where = 'pl.tenant_id=$1';
      const st = String(args.status ?? '').trim().toLowerCase();
      if (['paid', 'pending', 'expired'].includes(st)) { params.push(st); where += ` AND pl.status=$${params.length}`; }
      const rows = await ctx.db.query(
        `SELECT pl.amount, pl.currency, pl.description, pl.status, pl.created_at, pl.paid_at, ct.full_name AS contact
         FROM payment_links pl LEFT JOIN contacts ct ON ct.id = pl.contact_id
         WHERE ${where} ORDER BY pl.created_at DESC LIMIT 30`,
        params,
      );
      return { ok: true, count: rows.length, payment_links: rows };
    },
  },
];
