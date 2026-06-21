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
  // Short-lived cache of the practitioner list per tenant+provider. The list barely
  // changes but is fetched on every availability/booking call, so caching it removes
  // one external API round-trip per appointment turn (big latency win on voice).
  private readonly practitionerCache = new Map<string, { list: Array<{ id: string; name: string }>; exp: number }>();

  /** Practitioners with a 5-minute TTL cache to avoid repeated external calls. */
  private async getPractitionersCached(tenantId: string, provider: string, connector: any, config: any): Promise<Array<{ id: string; name: string }>> {
    if (!connector.listPractitioners) return [];
    const key = `${tenantId}:${provider}`;
    const hit = this.practitionerCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.list;
    const list = await connector.listPractitioners(config).catch(() => [] as Array<{ id: string; name: string }>);
    if (list.length) this.practitionerCache.set(key, { list, exp: Date.now() + 5 * 60 * 1000 });
    return list;
  }

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
    this.practitionerCache.delete(`${tenantId}:${provider}`);
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
    this.practitionerCache.delete(`${tenantId}:${provider}`);
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
    input: { contactId: string; practitionerId: string; start: string; finish?: string; reason?: string; patientData?: { dateOfBirth?: string; gender?: string; title?: string } },
    lang: 'es' | 'en' = 'es',
  ) {
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.createAppointment) throw new BadRequestException(`${provider} no soporta agendar citas.`);
    if (!input.contactId || !input.practitionerId || !input.start) {
      throw new BadRequestException('Faltan datos: contacto, profesional y horario.');
    }

    // Auto-link the contact to a Dentally patient on demand (find by email/phone,
    // else create) — no need to import the whole patient base first.
    const externalId = await this.linkOrCreatePatient(tenantId, provider, input.contactId, input.patientData, lang);

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

  // ── Bot helpers (used by the AI chatbot engine, scoped by tenantId) ──────────

  /** Whether the tenant has this provider connected (for gating bot tools). */
  async isConnected(tenantId: string, provider: string): Promise<boolean> {
    try { await this.getConnected(tenantId, provider); return true; }
    catch { return false; }
  }

  private slotTime(iso: string): string {
    const m = /T(\d{2}:\d{2})/.exec(iso || '');
    return m ? m[1] : iso;
  }

  /** Format an "HH:MM" 24h time into something natural for the bot to SPEAK
   *  ("08:00" → "8 AM" / "8 de la mañana", "14:30" → "2:30 PM"). */
  private speakTime(hhmm: string, lang: 'es' | 'en'): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
    if (!m) return hhmm;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const h12 = h % 12 || 12;
    if (lang === 'en') {
      const ampm = h < 12 ? 'AM' : 'PM';
      return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
    }
    const period = h < 12 ? 'de la mañana' : (h < 20 ? 'de la tarde' : 'de la noche');
    return min === 0 ? `${h12} ${period}` : `${h12} y ${min} ${period}`;
  }

  /** Normalize a spoken/written time ("8 am", "2:30 pm", "15:30", "8") to "HH:MM" 24h
   *  so booking matches the real slot regardless of how the caller said it. */
  private normalizeTime(s: string): string {
    const raw = (s || '').trim().toLowerCase();
    const ap = /(a\.?m\.?|p\.?m\.?)/.exec(raw);
    const m = /(\d{1,2})[:h.\s]?(\d{2})?/.exec(raw);
    if (!m) return raw;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (ap) {
      const pm = ap[1].startsWith('p');
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  /** Format a YYYY-MM-DD into natural language for the bot to speak (avoids "2026-06-23"). */
  private fmtApptDate(dateStr: string, lang: 'es' | 'en'): string {
    const d = new Date(`${dateStr}T12:00:00Z`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    });
  }

  /** Bot: list bookable professionals as a friendly message. */
  async botListPractitioners(tenantId: string, provider: string, lang: 'es' | 'en' = 'es'): Promise<string> {
    const { connector, config } = await this.getConnected(tenantId, provider);
    const list = await this.getPractitionersCached(tenantId, provider, connector, config);
    if (!list.length) return lang === 'en' ? 'There are no professionals available right now.' : 'No hay profesionales disponibles ahora mismo.';
    const names = list.map((p: any) => p.name).join(', ');
    return lang === 'en' ? `Available professionals: ${names}.` : `Profesionales disponibles: ${names}.`;
  }

  /** Bot: open slots for a day, formatted for the customer. */
  async botCheckAvailability(
    tenantId: string, provider: string,
    opts: { date: string; practitionerName?: string; durationMinutes?: number },
    lang: 'es' | 'en' = 'es',
  ): Promise<string> {
    const en = lang === 'en';
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.listAvailability || !connector.listPractitioners) return en ? 'Appointments are not available at the moment.' : 'Las citas no están disponibles en este momento.';

    const all = await this.getPractitionersCached(tenantId, provider, connector, config);
    if (!all.length) return en ? "I couldn't find professionals to check availability." : 'No encontré profesionales para consultar disponibilidad.';

    // The practitioner is OPTIONAL: if the caller named one, narrow to it; otherwise
    // check ALL practitioners in a single request so we don't always default to the first.
    const wanted = opts.practitionerName
      ? all.find((p) => {
          const n = opts.practitionerName!.toLowerCase().trim();
          return p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase());
        })
      : null;
    const targets = wanted ? [wanted] : all;

    let slots: any[];
    try {
      slots = await connector.listAvailability(config, {
        practitionerIds: targets.map((p) => p.id),
        startDate: `${opts.date}T00:00:00Z`,
        finishDate: `${opts.date}T23:59:59Z`,
        durationMinutes: opts.durationMinutes ?? 30,
      });
    } catch (e: any) {
      return en ? `I couldn't check availability: ${e?.message || 'error'}.` : `No pude consultar la disponibilidad: ${e?.message || 'error'}.`;
    }

    const when = this.fmtApptDate(opts.date, lang);
    if (!slots.length) {
      if (wanted) return en
        ? `There is no availability with ${wanted.name} on ${when}. Would you like to try another date or another professional?`
        : `No hay horarios disponibles con ${wanted.name} el ${when}. ¿Quieres probar con otra fecha u otro profesional?`;
      return en
        ? `There is no availability on ${when}. Would you like to try another date?`
        : `No hay horarios disponibles el ${when}. ¿Quieres probar con otra fecha?`;
    }

    // Unique times across whichever practitioner(s) we queried, earliest first,
    // formatted naturally for speech (no "08:00" → "cero ocho..." TTS artifacts).
    const times = [...new Set(slots.map((s: any) => this.slotTime(s.start)))]
      .sort()
      .slice(0, 12)
      .map((t) => this.speakTime(t, lang))
      .join(', ');
    if (wanted) return en
      ? `Available times with ${wanted.name} on ${when}: ${times}. Which one do you prefer?`
      : `Horarios disponibles con ${wanted.name} el ${when}: ${times}. ¿Cuál prefieres?`;
    return en
      ? `Available times on ${when}: ${times}. Which one do you prefer?`
      : `Horarios disponibles el ${when}: ${times}. ¿Cuál prefieres?`;
  }

  /** Bot: book a chosen time for the conversation's contact (matches a real slot). */
  async botBook(
    tenantId: string, provider: string,
    opts: { contactId: string; date: string; time: string; practitionerName?: string; durationMinutes?: number; reason?: string; dateOfBirth?: string; gender?: string; title?: string },
    lang: 'es' | 'en' = 'es',
  ): Promise<string> {
    const en = lang === 'en';
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.listAvailability || !connector.createAppointment || !connector.listPractitioners) return en ? 'Appointments are not available at the moment.' : 'Las citas no están disponibles en este momento.';

    const all = await this.getPractitionersCached(tenantId, provider, connector, config);
    if (!all.length) return en ? "I couldn't find the professional to book." : 'No encontré el profesional para agendar.';

    // Practitioner is optional: narrow to the named one if given, else consider all.
    const wanted = opts.practitionerName
      ? all.find((p) => {
          const n = opts.practitionerName!.toLowerCase().trim();
          return p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase());
        })
      : null;
    const targets = wanted ? [wanted] : all;

    let slots: any[] = [];
    try {
      slots = await connector.listAvailability(config, {
        practitionerIds: targets.map((p) => p.id),
        startDate: `${opts.date}T00:00:00Z`,
        finishDate: `${opts.date}T23:59:59Z`,
        durationMinutes: opts.durationMinutes ?? 30,
      });
    } catch { /* fall through to "not available" */ }

    const want = this.normalizeTime(opts.time || '');
    const spokenWant = this.speakTime(want, lang);
    const when = this.fmtApptDate(opts.date, lang);
    const slot = slots.find((s: any) => this.slotTime(s.start) === want);
    if (!slot) {
      if (wanted) return en
        ? `The ${spokenWant} slot is no longer available with ${wanted.name}. Would you like me to show other times?`
        : `El horario de las ${spokenWant} ya no está disponible con ${wanted.name}. ¿Quieres que te muestre otros horarios?`;
      return en
        ? `The ${spokenWant} slot is no longer available on ${when}. Would you like me to show other times?`
        : `El horario de las ${spokenWant} ya no está disponible el ${when}. ¿Quieres que te muestre otros horarios?`;
    }

    // The slot tells us which practitioner has that time; book with that one.
    const bookPracId = slot.practitionerId || targets[0].id;
    const bookPracName = all.find((p) => p.id === bookPracId)?.name ?? wanted?.name ?? (en ? 'the professional' : 'el profesional');
    try {
      await this.bookAppointment(tenantId, provider, {
        contactId: opts.contactId,
        practitionerId: bookPracId,
        start: slot.start,
        finish: slot.finish,
        reason: opts.reason,
        patientData: { dateOfBirth: opts.dateOfBirth, gender: opts.gender, title: opts.title },
      }, lang);
      return en
        ? `Done! Your appointment with ${bookPracName} is booked for ${when} at ${spokenWant}.`
        : `¡Listo! Tu cita con ${bookPracName} quedó agendada para el ${when} a las ${spokenWant}.`;
    } catch (e: any) {
      return en ? `I couldn't book the appointment: ${e?.message || 'unknown error'}.` : `No pude agendar la cita: ${e?.message || 'error desconocido'}.`;
    }
  }

  /** Bot: read the contact's upcoming appointments, formatted for the customer. */
  async botGetAppointments(
    tenantId: string, provider: string, contactId: string | null, lang: 'es' | 'en' = 'es',
  ): Promise<string> {
    const en = lang === 'en';
    if (!contactId) return en ? "I couldn't identify your record to look up your appointments." : 'No pude identificar tu ficha para consultar tus citas.';
    const { connector, config } = await this.getConnected(tenantId, provider);
    if (!connector.getAppointments || !connector.findPatient) return en ? 'I cannot look up appointments right now.' : 'No puedo consultar las citas en este momento.';

    // Resolve the patient WITHOUT creating one (a lookup must never create a record).
    const [c] = await this.db.query(
      `SELECT email, phone FROM contacts WHERE id::text=$1 AND tenant_id::text=$2`,
      [contactId, tenantId],
    );
    const [map] = await this.db.query(
      `SELECT external_id FROM integration_contact_map WHERE tenant_id::text=$1 AND provider=$2 AND contact_id::text=$3`,
      [tenantId, provider, contactId],
    );
    let patientId: string | undefined = map?.external_id;
    if (!patientId && c) {
      const found = await connector.findPatient(config, { email: c.email || undefined, phone: c.phone || undefined }).catch(() => null);
      patientId = found?.externalId;
    }
    if (!patientId) return en ? "I couldn't find you as a registered patient." : 'No te encontré como paciente registrado.';

    let appts;
    try {
      appts = await connector.getAppointments(config, { patientId, futureOnly: true });
    } catch (e: any) {
      return en ? `I couldn't check your appointments: ${e?.message || 'error'}.` : `No pude consultar tus citas: ${e?.message || 'error'}.`;
    }
    if (!appts.length) return en ? 'You have no upcoming appointments.' : 'No tienes citas próximas.';

    const pracs = await this.getPractitionersCached(tenantId, provider, connector, config).catch(() => [] as Array<{ id: string; name: string }>);
    const nameOf = (id?: string) => pracs.find((p) => p.id === id)?.name ?? (en ? 'the professional' : 'el profesional');
    const lines = appts.slice(0, 5).map((a) => {
      const date = this.fmtApptDate((a.start || '').slice(0, 10), lang);
      const time = this.speakTime(this.slotTime(a.start), lang);
      return en
        ? `${date} at ${time} with ${nameOf(a.practitionerId)}`
        : `${date} a las ${time} con ${nameOf(a.practitionerId)}`;
    });
    return en
      ? `Your upcoming appointment${appts.length > 1 ? 's' : ''}: ${lines.join('; ')}.`
      : `Tu${appts.length > 1 ? 's' : ''} próxima${appts.length > 1 ? 's' : ''} cita${appts.length > 1 ? 's' : ''}: ${lines.join('; ')}.`;
  }

  /**
   * Link a CRM contact to an external patient on demand: return the existing
   * mapping, else find the patient by email/phone, else create it — then record
   * the mapping. Avoids having to bulk-import every patient just to book.
   */
  async linkOrCreatePatient(
    tenantId: string,
    provider: string,
    contactId: string,
    patientData?: { dateOfBirth?: string; gender?: string; title?: string },
    lang: 'es' | 'en' = 'es',
  ): Promise<string> {
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
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'No se pudo buscar el paciente en Dentally.');
    }

    // Not found → create it from the contact's custom fields (Dentally requires
    // title, date of birth and gender; payment plan is auto-resolved).
    if (!ext) {
      if (!connector.createPatient) {
        throw new BadRequestException('Este contacto no existe como paciente en Dentally y este sistema no permite crearlo.');
      }
      // Read ALL contact custom fields and match tolerantly (ignore case,
      // spaces, underscores, punctuation) so dentally_DOB / "dentally DOB" /
      // dentally_dob all resolve to the same value.
      const cfRows = await this.db.query(
        `SELECT d.name, v.value
           FROM custom_field_definitions d
           LEFT JOIN custom_field_values v ON v.definition_id = d.id AND v.entity_id::text = $2
          WHERE d.tenant_id::text = $1 AND d.entity_type = 'contact'`,
        [tenantId, contactId],
      );
      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      let cfTitle: string | undefined, cfDob: string | undefined, cfGender: string | undefined;
      for (const r of cfRows) {
        if (!r.value) continue;
        const k = norm(r.name);
        if (k === 'dentallytitle') cfTitle = r.value;
        else if (k === 'dentallydob' || k === 'dentallydateofbirth') cfDob = r.value;
        else if (k === 'dentallygender') cfGender = r.value;
      }

      // Prefer data provided at call time (e.g. collected by a bot in chat),
      // fall back to the contact's custom fields.
      const fTitle  = patientData?.title       || cfTitle;
      const fDob    = patientData?.dateOfBirth || cfDob;
      const fGender = patientData?.gender      || cfGender;

      const en = lang === 'en';
      const missing: string[] = [];
      if (!fDob)    missing.push(en ? 'date of birth' : 'fecha de nacimiento');
      if (!fGender) missing.push(en ? 'gender (male/female)' : 'género (masculino/femenino)');
      if (!fTitle)  missing.push(en ? 'title (Mr/Mrs/Ms/Dr)' : 'título (Sr./Sra./Srta./Dr.)');
      if (missing.length) {
        // Customer-facing: ask for the details naturally; never expose internal field codes.
        throw new BadRequestException(
          en
            ? `To register you as a new patient I need a few details: ${missing.join(', ')}. Could you provide them?`
            : `Para registrarte como paciente nuevo necesito unos datos: ${missing.join(', ')}. ¿Me los puedes facilitar?`,
        );
      }

      const parts = (c.full_name || '').trim().split(/\s+/);
      try {
        ext = await connector.createPatient(config, {
          firstName: parts[0] || 'Paciente',
          lastName: parts.slice(1).join(' ') || 'CRM',
          email: c.email || undefined,
          phone: c.phone || undefined,
          title: fTitle,
          dateOfBirth: fDob,
          gender: fGender,
        });
      } catch (e: any) {
        throw new BadRequestException(e?.message || 'No se pudo crear el paciente en Dentally.');
      }
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
