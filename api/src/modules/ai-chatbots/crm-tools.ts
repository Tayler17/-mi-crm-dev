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
  try {
    return await tool.handler(ctx, args ?? {});
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'tool error' };
  }
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
    name: 'update_contact',
    description: 'Actualizar datos de un contacto (nombre, teléfono, email). Usa search_contacts primero para el contact_id.',
    parameters: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'ID del contacto' },
        full_name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
      },
      required: ['contact_id'],
    },
    handler: async (ctx, args) => {
      const sets: string[] = []; const params: any[] = [];
      if (String(args.full_name ?? '').trim()) { params.push(args.full_name.trim()); sets.push(`full_name=$${params.length}`); }
      if (String(args.phone ?? '').trim()) { params.push(args.phone.trim()); sets.push(`phone=$${params.length}`); }
      if (String(args.email ?? '').trim()) { params.push(args.email.trim()); sets.push(`email=$${params.length}`); }
      if (!sets.length) return { ok: false, error: 'Nada que actualizar' };
      params.push(args.contact_id, ctx.tenantId);
      const r = await ctx.db.query(
        `UPDATE contacts SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length - 1} AND tenant_id=$${params.length} RETURNING id, full_name, phone, email`,
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
         FROM content WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 20`,
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
];
