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
];
