import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { CRM_TOOLS, runTool } from '../ai-chatbots/crm-tools';

/** Resolved identity behind an MCP bearer token. */
export interface McpAuth { tenantId: string; role: string; tokenId: string }

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'AutoMarkIQ CRM', version: '1.0.0' };

/**
 * MCP (Model Context Protocol) server: exposes the central CRM tool registry
 * (`crm-tools.ts`) so the OWNER can operate their CRM from an MCP client
 * (Claude Desktop, etc.) over JSON-RPC. Auth is a per-tenant bearer token.
 * Every call runs tenant-scoped via `runTool`, and sensitive tools still require
 * `confirm:true` (the model must ask the user first).
 */
@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS mcp_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        created_by uuid,
        token text NOT NULL UNIQUE,
        label text,
        role text NOT NULL DEFAULT 'owner',
        last_used_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => this.logger.error(`mcp_tokens init: ${e.message}`));
  }

  // ── Token management (owner) ────────────────────────────────────────────────

  async listTokens(tenantId: string) {
    const rows = await this.db.query(
      `SELECT id, label, role, last_used_at, revoked_at, created_at,
              '…' || RIGHT(token, 4) AS token_hint
       FROM mcp_tokens WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  /** Create a token. The full value is returned ONCE here (not stored elsewhere). */
  async createToken(tenantId: string, createdBy: string | undefined, label?: string, role = 'owner') {
    const token = `amk_mcp_${randomBytes(24).toString('hex')}`;
    const [row] = await this.db.query(
      `INSERT INTO mcp_tokens (tenant_id, created_by, token, label, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, label, role, created_at`,
      [tenantId, createdBy ?? null, token, label ?? 'MCP token', role],
    );
    return { ...row, token };
  }

  async revokeToken(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE mcp_tokens SET revoked_at=NOW() WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL`,
      [id, tenantId],
    );
    return { ok: true };
  }

  /** Validate a bearer token → identity, or null. Touches last_used_at. */
  async authenticate(bearer?: string): Promise<McpAuth | null> {
    const token = String(bearer ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const [row] = await this.db.query(
      `SELECT id, tenant_id, role FROM mcp_tokens WHERE token=$1 AND revoked_at IS NULL LIMIT 1`,
      [token],
    );
    if (!row) return null;
    await this.db.query(`UPDATE mcp_tokens SET last_used_at=NOW() WHERE id=$1`, [row.id]).catch(() => {});
    return { tenantId: row.tenant_id, role: row.role, tokenId: row.id };
  }

  // ── JSON-RPC dispatch ───────────────────────────────────────────────────────

  private toMcpTools() {
    return CRM_TOOLS.map((t) => ({
      name: t.name,
      description: t.description + (t.sensitive ? ' (SENSITIVE: requires confirm=true after the user explicitly agrees.)' : ''),
      inputSchema: t.parameters,
    }));
  }

  private ok(id: any, result: any) { return { jsonrpc: '2.0', id, result }; }
  private err(id: any, code: number, message: string) { return { jsonrpc: '2.0', id, error: { code, message } }; }

  /**
   * Handle a single JSON-RPC message. Returns the response object, or null for
   * notifications (which get an empty 202/200 with no body).
   */
  async handleRpc(auth: McpAuth, msg: any): Promise<any | null> {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return this.err(msg?.id ?? null, -32600, 'Invalid Request');
    }
    const { id, method, params } = msg;
    const isNotification = id === undefined || id === null;

    switch (method) {
      case 'initialize':
        return this.ok(id, {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null; // notification — no response

      case 'ping':
        return this.ok(id, {});

      case 'tools/list':
        return this.ok(id, { tools: this.toMcpTools() });

      case 'tools/call': {
        const name = params?.name;
        const args = params?.arguments ?? {};
        if (!name) return this.err(id, -32602, 'Missing tool name');
        const result = await runTool(CRM_TOOLS, name, { db: this.db, tenantId: auth.tenantId, role: auth.role }, args);
        const isError = result && result.ok === false && !result.needs_confirmation;
        return this.ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: !!isError,
        });
      }

      default:
        if (isNotification) return null;
        return this.err(id, -32601, `Method not found: ${method}`);
    }
  }
}
