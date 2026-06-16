import { Injectable, OnModuleInit, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IntegrationConnector } from './connectors/connector.interface';
import { DentallyConnector } from './connectors/dentally.connector';

@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly connectors = new Map<string, IntegrationConnector>();

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly dentally: DentallyConnector,
  ) {
    // Register available connectors (add new systems here in future phases)
    [this.dentally].forEach((c) => this.connectors.set(c.provider, c));
  }

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS tenant_integrations (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id   UUID NOT NULL,
        provider    TEXT NOT NULL,
        config      JSONB NOT NULL DEFAULT '{}'::jsonb,
        status      TEXT NOT NULL DEFAULT 'connected',
        last_error  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, provider)
      )
    `).catch((e: any) => this.logger.warn(`tenant_integrations table init failed: ${e.message}`));
  }

  /** Catalog of connectors available to connect (for the UI). */
  catalog() {
    return [...this.connectors.values()].map((c) => ({ provider: c.provider, label: c.label }));
  }

  /** Tenant's integrations — credentials are NEVER returned, only a connected flag + status. */
  async list(tenantId: string) {
    const rows: any[] = await this.db.query(
      `SELECT provider, status, last_error, config, created_at, updated_at
       FROM tenant_integrations WHERE tenant_id::text=$1 ORDER BY provider`,
      [tenantId],
    );
    return rows.map((r) => ({
      provider:  r.provider,
      status:    r.status,
      lastError: r.last_error,
      region:    r.config?.region ?? 'global',
      hasToken:  !!r.config?.token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** Connect (or update) a provider for a tenant after validating credentials. */
  async connect(tenantId: string, provider: string, config: Record<string, any>) {
    const connector = this.connectors.get(provider);
    if (!connector) throw new BadRequestException(`Integración desconocida: ${provider}`);

    const result = await connector.testConnection(config);
    if (!result.ok) throw new BadRequestException(result.error || 'No se pudo conectar.');

    await this.db.query(
      `INSERT INTO tenant_integrations (tenant_id, provider, config, status, last_error)
       VALUES ($1,$2,$3,'connected',NULL)
       ON CONFLICT (tenant_id, provider) DO UPDATE SET
         config=$3, status='connected', last_error=NULL, updated_at=NOW()`,
      [tenantId, provider, JSON.stringify(config)],
    );
    this.logger.log(`[integrations] ${provider} connected for tenant ${tenantId}`);
    return { ok: true, info: result.info };
  }

  /** Re-test an existing connection. */
  async test(tenantId: string, provider: string) {
    const connector = this.connectors.get(provider);
    if (!connector) throw new BadRequestException(`Integración desconocida: ${provider}`);
    const [row] = await this.db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider],
    );
    if (!row) throw new NotFoundException('Integración no conectada');
    const result = await connector.testConnection(row.config ?? {});
    await this.db.query(
      `UPDATE tenant_integrations SET status=$3, last_error=$4, updated_at=NOW()
       WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider, result.ok ? 'connected' : 'error', result.ok ? null : (result.error ?? 'Error')],
    );
    return result;
  }

  async disconnect(tenantId: string, provider: string) {
    await this.db.query(
      `DELETE FROM tenant_integrations WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider],
    );
    return { ok: true };
  }

  /** Internal helper for future phases: get a connector + a tenant's stored config. */
  async getConnected(tenantId: string, provider: string): Promise<{ connector: IntegrationConnector; config: Record<string, any> }> {
    const connector = this.connectors.get(provider);
    if (!connector) throw new BadRequestException(`Integración desconocida: ${provider}`);
    const [row] = await this.db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id::text=$1 AND provider=$2 AND status='connected'`,
      [tenantId, provider],
    );
    if (!row) throw new BadRequestException(`${provider} no está conectado para este tenant.`);
    return { connector, config: row.config ?? {} };
  }
}
