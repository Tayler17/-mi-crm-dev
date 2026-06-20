import { Injectable, OnModuleInit, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
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
      autoSync:  !!r.config?.autoSync,
      lastSyncAt: r.config?.lastSyncAt ?? null,
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
      try {
        const r = await this.upsertExternalContact(tenantId, provider, ext, note);
        if (r === 'created') created++;
        else if (r === 'updated') updated++;
        else skipped++;
      } catch (e: any) {
        this.logger.warn(`[integrations] sync skip ${provider}:${ext.externalId} — ${e.message}`);
        skipped++;
      }
    }

    await this.db.query(
      `UPDATE tenant_integrations SET
         status='connected', last_error=NULL, updated_at=NOW(),
         config = jsonb_set(config, '{lastSyncAt}', to_jsonb(NOW()::text), true)
       WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider],
    );
    this.logger.log(`[integrations] ${provider} sync tenant ${tenantId}: +${created} ~${updated} skip ${skipped} / ${externals.length}`);
    return { ok: true, total: externals.length, created, updated, skipped };
  }

  /** Turn the automatic background sync on/off for a tenant's integration. */
  async setAutoSync(tenantId: string, provider: string, enabled: boolean) {
    const { config } = await this.getConnected(tenantId, provider);
    const next = { ...config, autoSync: enabled };
    await this.db.query(
      `UPDATE tenant_integrations SET config=$3, updated_at=NOW()
       WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider, JSON.stringify(next)],
    );
    return { ok: true, autoSync: enabled };
  }

  /**
   * Background auto-sync: every 15 min, re-pull contacts for every connected
   * integration that has autoSync enabled. This is the "token-only" model —
   * the client just provides a token; no webhook URL to paste anywhere.
   */
  @Cron('*/15 * * * *')
  async autoSyncTick() {
    let rows: any[] = [];
    try {
      rows = await this.db.query(
        `SELECT tenant_id, provider FROM tenant_integrations
         WHERE status <> 'disabled' AND config->>'autoSync' = 'true'`,
      );
    } catch (e: any) {
      this.logger.warn(`[integrations] autoSync query failed: ${e.message}`);
      return;
    }
    if (!rows.length) return;
    this.logger.log(`[integrations] autoSync tick — ${rows.length} integration(s)`);
    for (const r of rows) {
      try {
        await this.syncContacts(r.tenant_id, r.provider);
      } catch (e: any) {
        // syncContacts already records the error on the integration row.
        this.logger.warn(`[integrations] autoSync ${r.provider} tenant ${r.tenant_id} failed: ${e.message}`);
      }
    }
  }

  /** Phase 3: bookable professionals from the external system. */
  async listPractitioners(tenantId: string, provider: string) {
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.listPractitioners) throw new BadRequestException(`${provider} no soporta agendar citas.`);
    return connector.listPractitioners(config);
  }

  /** Phase 3: open appointment slots for a practitioner over a date range. */
  async listAvailability(
    tenantId: string, provider: string,
    opts: { practitionerId: string; startDate: string; finishDate: string; durationMinutes?: number },
  ) {
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.listAvailability) throw new BadRequestException(`${provider} no soporta agendar citas.`);
    if (!opts.practitionerId || !opts.startDate || !opts.finishDate) {
      throw new BadRequestException('Faltan datos: profesional y rango de fechas.');
    }
    try {
      return await connector.listAvailability(config, opts);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'Error al consultar disponibilidad.');
    }
  }

  /**
   * Phase 3: book an appointment for a CRM contact. The contact must be linked
   * to an external patient (created/linked by the Phase 2 sync).
   */
  async bookAppointment(
    tenantId: string, provider: string,
    input: { contactId: string; practitionerId: string; start: string; finish?: string; reason?: string },
  ) {
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.createAppointment) throw new BadRequestException(`${provider} no soporta agendar citas.`);
    if (!input.contactId || !input.practitionerId || !input.start) {
      throw new BadRequestException('Faltan datos: contacto, profesional y horario.');
    }

    // Auto-link the contact to a Dentally patient on demand (find by email/phone,
    // else create) — no need to import the whole patient base first.
    const externalId = await this.linkOrCreatePatient(tenantId, provider, input.contactId);

    let booked;
    try {
      booked = await connector.createAppointment(config, {
        patientExternalId: externalId,
        practitionerId: input.practitionerId,
        start: input.start,
        finish: input.finish,
        reason: input.reason,
      });
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'No se pudo crear la cita.');
    }
    this.logger.log(`[integrations] ${provider} booked appt ${booked.id} for contact ${input.contactId} (tenant ${tenantId})`);
    return { ok: true, appointment: booked };
  }

  /**
   * Link a CRM contact to an external patient on demand: return the existing
   * mapping, else find the patient by email/phone, else create it — then record
   * the mapping. Avoids having to bulk-import every patient just to book.
   */
  async linkOrCreatePatient(tenantId: string, provider: string, contactId: string): Promise<string> {
    const { connector, config } = await this.getConnected(tenantId, provider);

    const [map] = await this.db.query(
      `SELECT external_id FROM integration_contact_map
       WHERE tenant_id::text=$1 AND provider=$2 AND contact_id::text=$3`,
      [tenantId, provider, contactId],
    );
    if (map?.external_id) return map.external_id;

    const [c] = await this.db.query(
      `SELECT full_name, email, phone FROM contacts WHERE id::text=$1 AND tenant_id::text=$2`,
      [contactId, tenantId],
    );
    if (!c) throw new BadRequestException('Contacto no encontrado.');

    let ext: { externalId: string } | null = null;
    try {
      if (connector.findPatient) {
        ext = await connector.findPatient(config, { email: c.email || undefined, phone: c.phone || undefined });
      }
      if (!ext) {
        if (!connector.createPatient) {
          throw new BadRequestException('No se encontró el paciente en Dentally. Créalo en Dentally o sincroniza los pacientes.');
        }
        const parts = (c.full_name || '').trim().split(/\s+/);
        ext = await connector.createPatient(config, {
          firstName: parts[0] || 'Paciente',
          lastName: parts.slice(1).join(' ') || 'CRM',
          email: c.email || undefined,
          phone: c.phone || undefined,
        });
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(e?.message || 'No se pudo vincular el paciente en Dentally.');
    }

    await this.db.query(
      `INSERT INTO integration_contact_map (tenant_id, provider, external_id, contact_id) VALUES ($1,$2,$3,$4)`,
      [tenantId, provider, ext.externalId, contactId],
    ).catch(() => {});
    return ext.externalId;
  }

  /**
   * Upsert one external contact into CRM contacts + record the mapping.
   * Shared by the bulk sync (Phase 2) and inbound webhooks (Phase 4).
   * Returns 'created' | 'updated' | 'skipped'.
   */
  private async upsertExternalContact(
    tenantId: string, provider: string,
    ext: { externalId: string; fullName: string; email?: string; phone?: string; location?: string },
    note: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (!ext.externalId || !ext.fullName) return 'skipped';

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

    let result: 'created' | 'updated';
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
      result = 'updated';
    } else {
      const [row] = await this.db.query(
        `INSERT INTO contacts (tenant_id, full_name, email, phone, location, notes)
         VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),$6)
         RETURNING id`,
        [tenantId, ext.fullName, ext.email ?? '', ext.phone ?? '', ext.location ?? '', note],
      );
      contactId = row.id;
      result = 'created';
    }

    await this.db.query(
      `INSERT INTO integration_contact_map (tenant_id, provider, external_id, contact_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, provider, external_id) DO UPDATE SET contact_id=$4`,
      [tenantId, provider, ext.externalId, contactId],
    );
    return result;
  }

  // ── Phase 4: webhooks (real-time inbound sync) ──────────────────────────────

  private webhookBaseUrl() {
    return process.env.API_PUBLIC_URL || 'https://api.automarkiq.com';
  }

  /** Enable webhooks for a tenant: generate a per-tenant secret + return the URL to paste in the provider. */
  async enableWebhook(tenantId: string, provider: string) {
    const { config } = await this.getConnected(tenantId, provider);
    let secret = config.webhookSecret;
    if (!secret) {
      secret = randomBytes(24).toString('hex');
      const next = { ...config, webhookSecret: secret };
      await this.db.query(
        `UPDATE tenant_integrations SET config=$3, updated_at=NOW()
         WHERE tenant_id::text=$1 AND provider=$2`,
        [tenantId, provider, JSON.stringify(next)],
      );
    }
    return { url: `${this.webhookBaseUrl()}/integrations/${provider}/webhook/${secret}` };
  }

  /** Webhook status/URL for the UI (only reveals the URL, derived from the stored secret). */
  async webhookInfo(tenantId: string, provider: string) {
    const [row] = await this.db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id::text=$1 AND provider=$2`,
      [tenantId, provider],
    );
    const secret = row?.config?.webhookSecret;
    return {
      enabled: !!secret,
      url: secret ? `${this.webhookBaseUrl()}/integrations/${provider}/webhook/${secret}` : null,
    };
  }

  /**
   * Handle an inbound webhook. The secret in the URL identifies the tenant.
   * Best-effort event parsing — confirm event names/payload shape against real
   * provider deliveries and adjust the connector's normalizeWebhook if needed.
   */
  async handleInboundWebhook(provider: string, secret: string, payload: any) {
    if (!secret) return { ok: false };
    const [row] = await this.db.query(
      `SELECT tenant_id, config FROM tenant_integrations
       WHERE provider=$1 AND config->>'webhookSecret'=$2`,
      [provider, secret],
    );
    if (!row) {
      this.logger.warn(`[integrations] webhook with unknown secret for ${provider}`);
      return { ok: false };
    }
    const tenantId = row.tenant_id;
    const connector = this.connectors.get(provider);

    // Provider normalizes its payload to a common event; default: ignore.
    const event = connector?.normalizeWebhook ? connector.normalizeWebhook(payload) : null;
    if (!event) {
      this.logger.log(`[integrations] webhook ${provider} (tenant ${tenantId}) — unhandled event`);
      return { ok: true };
    }

    if (event.type === 'contact' && event.contact) {
      try {
        const r = await this.upsertExternalContact(tenantId, provider, event.contact, `Sincronizado de ${connector!.label}`);
        this.logger.log(`[integrations] webhook ${provider} contact ${event.contact.externalId} → ${r} (tenant ${tenantId})`);
      } catch (e: any) {
        this.logger.warn(`[integrations] webhook contact upsert failed: ${e.message}`);
      }
    } else {
      // Appointment / other events: logged for now. (Mirroring clinical
      // appointments into the CRM reminders table would mis-fire reminders.)
      this.logger.log(`[integrations] webhook ${provider} event '${event.type}' (tenant ${tenantId})`);
    }
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
