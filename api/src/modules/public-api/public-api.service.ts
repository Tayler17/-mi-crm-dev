import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';

/** Identity resolved from a public API key. */
export interface ApiKeyAuth { tenantId: string; keyId: string }

/**
 * Public REST API (v1) auth: per-tenant API keys so a tenant's external system
 * (their website, etc.) can read/write the CRM. Keys are bearer tokens validated
 * by ApiKeyGuard; every /v1 handler is then scoped to the key's tenant.
 */
@Injectable()
export class PublicApiService implements OnModuleInit {
  private readonly logger = new Logger(PublicApiService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        created_by uuid,
        key text NOT NULL UNIQUE,
        label text,
        last_used_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => this.logger.error(`api_keys init: ${e.message}`));
  }

  async listKeys(tenantId: string) {
    return this.db.query(
      `SELECT id, label, last_used_at, revoked_at, created_at, '…' || RIGHT(key, 4) AS key_hint
       FROM api_keys WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  /** Create a key. Full value returned ONCE here (only the last 4 chars are stored-visible after). */
  async createKey(tenantId: string, createdBy: string | undefined, label?: string) {
    const key = `amk_live_${randomBytes(24).toString('hex')}`;
    const [row] = await this.db.query(
      `INSERT INTO api_keys (tenant_id, created_by, key, label) VALUES ($1,$2,$3,$4)
       RETURNING id, label, created_at`,
      [tenantId, createdBy ?? null, key, label ?? 'API key'],
    );
    return { ...row, key };
  }

  async revokeKey(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE api_keys SET revoked_at=NOW() WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL`,
      [id, tenantId],
    );
    return { ok: true };
  }

  /** Validate a bearer/x-api-key value → identity, or null. Touches last_used_at. */
  async authenticate(raw?: string): Promise<ApiKeyAuth | null> {
    const key = String(raw ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!key) return null;
    const [row] = await this.db.query(
      `SELECT id, tenant_id FROM api_keys WHERE key=$1 AND revoked_at IS NULL LIMIT 1`,
      [key],
    );
    if (!row) return null;
    await this.db.query(`UPDATE api_keys SET last_used_at=NOW() WHERE id=$1`, [row.id]).catch(() => {});
    return { tenantId: row.tenant_id, keyId: row.id };
  }
}
