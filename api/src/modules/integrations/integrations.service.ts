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

    // Maps an external record (e.g. a Dentally patient) to a CRM contact so
    // re-syncs update the same contact instead of creating duplicates.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS integration_contact_map (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id    UUID NOT NULL,
        provider     TEXT NOT NULL,
        external_id  TEXT NOT NULL,
        contact_id   UUID NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, provider, external_id)
      )
    `).catch((e: any) => this.logger.warn(`integration_contact_map table init failed: ${e.message}`));
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

  /**
   * Phase 2: pull contacts/patients from the external system into CRM contacts.
   * Dedupe order: (1) prior mapping → update same contact; (2) existing contact
   * by email/phone in this tenant → link + update; (3) otherwise create new.
   */
  async syncContacts(tenantId: string, provider: string) {
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.listPatients) throw new BadRequestException(`${provider} no soporta importar contactos.`);

    let externals;
    try {
      externals = await connector.listPatients(config);
    } catch (e: any) {
      await this.db.query(
        `UPDATE tenant_integrations SET status='error', last_error=$3, updated_at=NOW()
         WHERE tenant_id::text=$1 AND provider=$2`,
        [tenantId, provider, e.message?.slice(0, 500) ?? 'Error al importar'],
      );
      throw new BadRequestException(e.message || 'No se pudieron leer los contactos.');
    }

    let created = 0, updated = 0, skipped = 0;
    const note = `Importado de ${connector.label}`;

    for (const ext of externals) {
      if (!ext.externalId || !ext.fullName) { skipped++; continue; }
      try {
        // 1) Already mapped? update that contact.
        const [mapped] = await this.db.query(
          `SELECT contact_id FROM integration_contact_map
           WHERE tenant_id::text=$1 AND provider=$2 AND external_id=$3`,
          [tenantId, provider, ext.externalId],
        );

        let contactId: string | undefined = mapped?.contact_id;

        // 2) Not mapped — match an existing contact by email or phone.
        if (!contactId && (ext.email || ext.phone)) {
          const [match] = await this.db.query(
            `SELECT id FROM contacts
             WHERE tenant_id::text=$1
               AND ( ($2 <> '' AND lower(email)=lower($2)) OR ($3 <> '' AND phone=$3) )
             LIMIT 1`,
            [tenantId, ext.email ?? '', ext.phone ?? ''],
          );
          contactId = match?.id;
        }

        if (contactId) {
          await this.db.query(
            `UPDATE contacts SET
               full_name = COALESCE(NULLIF($2,''), full_name),
               email     = COALESCE(NULLIF($3,''), email),
               phone     = COALESCE(NULLIF($4,''), phone),
               location  = COALESCE(NULLIF($5,''), location),
               updated_at = NOW()
             WHERE id=$1 AND tenant_id::text=$6`,
            [contactId, ext.fullName, ext.email ?? '', ext.phone ?? '', ext.location ?? '', tenantId],
          );
          updated++;
        } else {
          const [row] = await this.db.query(
            `INSERT INTO contacts (tenant_id, full_name, email, phone, location, notes)
             VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),$6)
             RETURNING id`,
            [tenantId, ext.fullName, ext.email ?? '', ext.phone ?? '', ext.location ?? '', note],
          );
          contactId = row.id;
          created++;
        }

        // Record/refresh the mapping.
        await this.db.query(
          `INSERT INTO integration_contact_map (tenant_id, provider, external_id, contact_id)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id, provider, external_id) DO UPDATE SET contact_id=$4`,
          [tenantId, provider, ext.externalId, contactId],
        );
      } catch (e: any) {
        this.logger.warn(`[integrations] sync skip ${provider}:${ext.externalId} — ${e.message}`);
        skipped++;
      }
    }

    await this.db.query(
      `UPDATE tenant_integrations SET status='connected', last_error=NULL, updated_at=NOW()
       WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider],
    );
    this.logger.log(`[integrations] ${provider} sync tenant ${tenantId}: +${created} ~${updated} skip ${skipped} / ${externals.length}`);
    return { ok: true, total: externals.length, created, updated, skipped };
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
