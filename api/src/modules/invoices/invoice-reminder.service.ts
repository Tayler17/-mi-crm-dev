import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { WhatsappWebService } from '../connections/whatsapp-web.service';
import { ConnectionsService } from '../connections/connections.service';

/**
 * Fase 2 — automatic payment-reminder bot.
 *
 * Once a day, for every tenant that OPTED IN (tenant_invoice_settings.reminders_enabled),
 * it finds open/overdue invoices whose contact has a phone and nudges them by WhatsApp:
 *   · due_soon_3 → 3 days before the due date
 *   · due_today  → on the due date
 *   · overdue_3  → 3 days after
 *   · overdue_7  → 7 days after
 * Each (invoice, rule) fires at most once (invoice_reminders log). Paid/void invoices are
 * never chased (PATCH to paid/void stops it). Delivery reuses the WhatsApp Web session, the
 * same path the appointment reminders use. Never messages anyone until the tenant enables it.
 */
// sendOffset = days relative to due_date when we intend to send (negative = before, positive = after).
const FIXED_RULES: Array<{ rule: string; sendOffset: number }> = [
  { rule: 'due_soon_3', sendOffset: -3 },
  { rule: 'due_today', sendOffset: 0 },
  { rule: 'overdue_3', sendOffset: 3 },
  { rule: 'overdue_7', sendOffset: 7 },
];
const ALL_RULE_KEYS = FIXED_RULES.map((r) => r.rule);

const SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', DOP: 'RD$' };

type ReminderChannel =
  | { kind: 'template'; connectionId: string; inboxId: string | null; templateName: string; templateLang: string; vars: string[] }
  | { kind: 'web'; connectionId: string; inboxId: string | null }
  | null;
type ConnRef = { connectionId: string; inboxId: string | null };
type Connections = { cloud: ConnRef | null; web: ConnRef | null };
type ConnCache = Map<string, Connections>;
type TemplateConfig = { name: string; lang: string; vars: string[] } | null;

@Injectable()
export class InvoiceReminderService implements OnModuleInit {
  private readonly logger = new Logger(InvoiceReminderService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly waSvc: WhatsappWebService,
    private readonly connections: ConnectionsService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS invoice_reminders (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  uuid NOT NULL,
        invoice_id uuid NOT NULL,
        rule       text NOT NULL,
        sent_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE(invoice_id, rule)
      )
    `).catch((e: any) => this.logger.error(`invoice_reminders init: ${e.message}`));
    await this.db.query(`CREATE INDEX IF NOT EXISTS invoice_reminders_invoice_idx ON invoice_reminders(invoice_id)`).catch(() => {});

    // Runs every hour; each tenant only sends at its own configured hour + allowed weekday (its timezone).
    const job = new CronJob('0 * * * *', () => { void this.runScheduled(); });
    try { this.schedulerRegistry.addCronJob('invoice-reminders', job as any); job.start(); } catch {}
    this.logger.log('Invoice reminder scheduler registered (hourly; per-tenant hour/timezone)');
  }

  /** Current hour (0-23) and weekday (0=Sun..6=Sat) in the given IANA timezone. */
  private nowInTz(tz: string): { hour: number; weekday: number } {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date());
      const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const weekday = map[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0;
      return { hour, weekday };
    } catch {
      const d = new Date();
      return { hour: d.getUTCHours(), weekday: d.getUTCDay() };
    }
  }

  /** Hourly cron entry. For every enabled tenant whose send hour == now (its timezone):
   *   · run the due-date notices (any day),
   *   · and, if the recurring dunning is on and today is one of its weekdays, run that too. */
  private async runScheduled(): Promise<void> {
    let tenants: any[] = [];
    try {
      tenants = await this.db.query(
        `SELECT tenant_id, reminder_send_hour, reminder_timezone, reminder_recurring_enabled, reminder_weekdays
           FROM tenant_invoice_settings WHERE reminders_enabled = true`,
      );
    } catch (e: any) { this.logger.error(`reminder schedule query failed: ${e?.message}`); return; }

    for (const t of tenants) {
      const tz = String(t.reminder_timezone || 'UTC');
      const hour = Number.isFinite(Number(t.reminder_send_hour)) ? Number(t.reminder_send_hour) : 14;
      const now = this.nowInTz(tz);
      if (now.hour !== hour) continue;

      try { await this.runOffsetForTenant(t.tenant_id); }
      catch (e: any) { this.logger.error(`reminder offset (tenant ${t.tenant_id}) failed: ${e?.message}`); }

      const days = Array.isArray(t.reminder_weekdays) ? t.reminder_weekdays.map((d: any) => Number(d)) : [];
      if (t.reminder_recurring_enabled && days.includes(now.weekday)) {
        try { await this.runRecurringForTenant(t.tenant_id, now.weekday); }
        catch (e: any) { this.logger.error(`reminder recurring (tenant ${t.tenant_id}) failed: ${e?.message}`); }
      }
    }
  }

  /** Public (manual "run now" endpoint, admin). Runs BOTH mechanisms for the tenant(s) now,
   *  ignoring the hour/weekday schedule (the recurring part uses today's weekday template). */
  async runDailyCheck(onlyTenantId?: string): Promise<{ sent: number; skipped: number }> {
    const tenantIds: string[] = onlyTenantId
      ? [onlyTenantId]
      : (await this.db.query(`SELECT tenant_id FROM tenant_invoice_settings WHERE reminders_enabled = true`).catch(() => [])).map((r: any) => r.tenant_id);
    let sent = 0, skipped = 0;
    for (const tid of tenantIds) {
      const a = await this.runOffsetForTenant(tid).catch(() => ({ sent: 0, skipped: 0 }));
      sent += a.sent; skipped += a.skipped;
      const [s] = await this.db.query(
        `SELECT reminder_recurring_enabled, reminder_timezone FROM tenant_invoice_settings WHERE tenant_id = $1 LIMIT 1`, [tid],
      ).catch(() => [undefined]);
      if (s?.reminder_recurring_enabled) {
        const wd = this.nowInTz(String(s.reminder_timezone || 'UTC')).weekday;
        const b = await this.runRecurringForTenant(tid, wd).catch(() => ({ sent: 0, skipped: 0 }));
        sent += b.sent; skipped += b.skipped;
      }
    }
    return { sent, skipped };
  }

  /** (A) Due-date notices: −3 / due / +3 / +7, each at most once. Fires on its exact date (any
   *  weekday) at the tenant's send hour; a 1-day catch-up absorbs a missed hourly run. */
  private async runOffsetForTenant(tenantId: string): Promise<{ sent: number; skipped: number }> {
    let sent = 0, skipped = 0;
    const connCache: ConnCache = new Map();

    const [settings] = await this.db.query(
      `SELECT reminders_enabled, reminder_rules, reminder_template_name, reminder_template_lang, reminder_template_vars
         FROM tenant_invoice_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    if (!settings?.reminders_enabled) return { sent, skipped };

    const conns = await this.getConnections(tenantId, connCache);
    const tpl = this.templateConfigFrom(settings.reminder_template_name, settings.reminder_template_lang, settings.reminder_template_vars);
    const channel = this.resolveChannel(conns, tpl);
    if (!channel) return { sent, skipped }; // no WhatsApp channel yet → retry on a later date

    const active: string[] = Array.isArray(settings.reminder_rules) && settings.reminder_rules.length
      ? settings.reminder_rules.filter((k: any) => ALL_RULE_KEYS.includes(k))
      : ALL_RULE_KEYS;

    for (const r of FIXED_RULES.filter((x) => active.includes(x.rule))) {
      let rows: any[] = [];
      try {
        rows = await this.db.query(
          `SELECT i.id, i.tenant_id, i.number, i.total_minor, i.currency, i.due_date,
                  i.external_url, i.pdf_url, i.contact_id,
                  ct.full_name, ct.phone,
                  COALESCE(t.lang, 'es') AS lang, s.business_name
             FROM invoices i
             JOIN tenant_invoice_settings s ON s.tenant_id = i.tenant_id AND s.reminders_enabled = true
             JOIN contacts ct ON ct.id = i.contact_id
             JOIN tenants  t  ON t.id  = i.tenant_id
            WHERE i.tenant_id = $1
              AND i.financial_status IN ('issued', 'partially_paid')
              AND i.reminders_muted = false
              AND i.due_date IS NOT NULL
              AND ct.phone IS NOT NULL AND ct.phone <> ''
              AND (CURRENT_DATE - (i.due_date + $2::int)) BETWEEN 0 AND 1
              AND NOT EXISTS (SELECT 1 FROM invoice_reminders rr WHERE rr.invoice_id = i.id AND rr.rule = $3)
            LIMIT 500`,
          [tenantId, r.sendOffset, r.rule],
        );
      } catch (e: any) { this.logger.error(`reminder query (${r.rule}) failed: ${e?.message}`); continue; }

      for (const inv of rows) {
        try {
          const ok = await this.sendReminder(inv, r.rule, channel);
          if (ok) sent++; else skipped++;
        } catch (e: any) { skipped++; this.logger.error(`reminder ${inv.id} (${r.rule}) failed: ${e?.message}`); }
      }
    }
    if (sent || skipped) this.logger.log(`Invoice reminders (tenant ${tenantId}): ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  }

  /** (B) Recurring weekly dunning: on a chosen weekday, remind EVERY unpaid invoice (issued /
   *  partially_paid), repeating on each configured day until paid. The template can differ per
   *  weekday (reminder_recurring_templates[weekday]); with none, it uses WhatsApp Web free text. */
  private async runRecurringForTenant(tenantId: string, weekday: number): Promise<{ sent: number; skipped: number }> {
    let sent = 0, skipped = 0;
    const connCache: ConnCache = new Map();

    const [settings] = await this.db.query(
      `SELECT reminders_enabled, reminder_recurring_enabled, reminder_recurring_templates
         FROM tenant_invoice_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    if (!settings?.reminders_enabled || !settings?.reminder_recurring_enabled) return { sent, skipped };

    const conns = await this.getConnections(tenantId, connCache);
    const map = settings.reminder_recurring_templates && typeof settings.reminder_recurring_templates === 'object'
      ? settings.reminder_recurring_templates : {};
    const dayTpl = map[String(weekday)];
    const tpl = dayTpl ? this.templateConfigFrom(dayTpl.name, dayTpl.lang, dayTpl.vars) : null;
    const channel = this.resolveChannel(conns, tpl);
    if (!channel) return { sent, skipped };

    // Per-DAY idempotency: re-sends on the next configured weekday, but never twice the same day.
    const rule = `recurring_${this.todayStr()}`;
    let rows: any[] = [];
    try {
      rows = await this.db.query(
        `SELECT i.id, i.tenant_id, i.number, i.total_minor, i.currency, i.due_date,
                i.external_url, i.pdf_url, i.contact_id,
                ct.full_name, ct.phone,
                COALESCE(t.lang, 'es') AS lang, s.business_name
           FROM invoices i
           JOIN tenant_invoice_settings s ON s.tenant_id = i.tenant_id AND s.reminders_enabled = true
           JOIN contacts ct ON ct.id = i.contact_id
           JOIN tenants  t  ON t.id  = i.tenant_id
          WHERE i.tenant_id = $1
            AND i.financial_status IN ('issued', 'partially_paid')
            AND i.reminders_muted = false
            AND ct.phone IS NOT NULL AND ct.phone <> ''
            AND NOT EXISTS (SELECT 1 FROM invoice_reminders rr WHERE rr.invoice_id = i.id AND rr.rule = $2)
          LIMIT 1000`,
        [tenantId, rule],
      );
    } catch (e: any) { this.logger.error(`recurring reminder query failed: ${e?.message}`); return { sent, skipped }; }

    for (const inv of rows) {
      try {
        const ok = await this.sendReminder(inv, rule, channel);
        if (ok) sent++; else skipped++;
      } catch (e: any) { skipped++; this.logger.error(`recurring reminder ${inv.id} failed: ${e?.message}`); }
    }
    if (sent || skipped) this.logger.log(`Recurring reminders (tenant ${tenantId}, weekday ${weekday}): ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  }

  private todayStr(): string { return new Date().toISOString().slice(0, 10); }

  /** Read-only preview: how many invoices WOULD get a reminder today (due-date notices + the
   *  recurring dunning if today is one of its weekdays), plus how many are muted. Sends nothing. */
  async previewForTenant(tenantId: string): Promise<{
    dueNotices: number; recurring: number; isRecurringDay: boolean; recurringEnabled: boolean;
    muted: number; sample: Array<{ number: string; name: string; due_date: string | null; reason: string }>;
  }> {
    const [settings] = await this.db.query(
      `SELECT reminders_enabled, reminder_rules, reminder_recurring_enabled, reminder_weekdays, reminder_timezone
         FROM tenant_invoice_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId],
    ).catch(() => [undefined]);
    const sample: Array<{ number: string; name: string; due_date: string | null; reason: string }> = [];
    let dueNotices = 0, recurring = 0;
    const recurringEnabled = !!settings?.reminder_recurring_enabled;

    // (A) due-date notices
    const active: string[] = Array.isArray(settings?.reminder_rules) && settings.reminder_rules.length
      ? settings.reminder_rules.filter((k: any) => ALL_RULE_KEYS.includes(k)) : ALL_RULE_KEYS;
    for (const r of FIXED_RULES.filter((x) => active.includes(x.rule))) {
      const rows = await this.db.query(
        `SELECT i.number, ct.full_name AS name, i.due_date
           FROM invoices i JOIN contacts ct ON ct.id = i.contact_id
          WHERE i.tenant_id = $1 AND i.financial_status IN ('issued','partially_paid')
            AND i.reminders_muted = false AND i.due_date IS NOT NULL
            AND ct.phone IS NOT NULL AND ct.phone <> ''
            AND (CURRENT_DATE - (i.due_date + $2::int)) BETWEEN 0 AND 1
            AND NOT EXISTS (SELECT 1 FROM invoice_reminders rr WHERE rr.invoice_id = i.id AND rr.rule = $3)
          LIMIT 100`, [tenantId, r.sendOffset, r.rule],
      ).catch(() => []);
      dueNotices += rows.length;
      for (const x of rows) if (sample.length < 25) sample.push({ number: x.number, name: x.name, due_date: x.due_date, reason: r.rule });
    }

    // (B) recurring — only if today is one of its weekdays (tenant timezone)
    const weekday = this.nowInTz(String(settings?.reminder_timezone || 'UTC')).weekday;
    const days = Array.isArray(settings?.reminder_weekdays) ? settings.reminder_weekdays.map((d: any) => Number(d)) : [];
    const isRecurringDay = recurringEnabled && days.includes(weekday);
    if (isRecurringDay) {
      const rows = await this.db.query(
        `SELECT i.number, ct.full_name AS name, i.due_date
           FROM invoices i JOIN contacts ct ON ct.id = i.contact_id
          WHERE i.tenant_id = $1 AND i.financial_status IN ('issued','partially_paid')
            AND i.reminders_muted = false AND ct.phone IS NOT NULL AND ct.phone <> ''
            AND NOT EXISTS (SELECT 1 FROM invoice_reminders rr WHERE rr.invoice_id = i.id AND rr.rule = $2)
          LIMIT 500`, [tenantId, `recurring_${this.todayStr()}`],
      ).catch(() => []);
      recurring = rows.length;
      for (const x of rows) if (sample.length < 25) sample.push({ number: x.number, name: x.name, due_date: x.due_date, reason: 'recurrente' });
    }

    const [m] = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM invoices i JOIN contacts ct ON ct.id = i.contact_id
        WHERE i.tenant_id = $1 AND i.financial_status IN ('issued','partially_paid')
          AND i.reminders_muted = true AND ct.phone IS NOT NULL AND ct.phone <> ''`, [tenantId],
    ).catch(() => [{ c: 0 }]);

    return { dueNotices, recurring, isRecurringDay, recurringEnabled, muted: m?.c ?? 0, sample };
  }

  /** The tenant's connected WhatsApp connections (official Cloud API + WhatsApp Web), cached per run. */
  private async getConnections(tenantId: string, cache: ConnCache): Promise<Connections> {
    if (cache.has(tenantId)) return cache.get(tenantId)!;
    const [cloud] = await this.db.query(
      `SELECT id, inbox_id FROM channel_connections
        WHERE tenant_id=$1 AND channel_type='whatsapp' AND status='connected' ORDER BY created_at ASC LIMIT 1`, [tenantId]);
    const [web] = await this.db.query(
      `SELECT id, inbox_id FROM channel_connections
        WHERE tenant_id=$1 AND channel_type='whatsapp_web' AND status='connected' ORDER BY created_at ASC LIMIT 1`, [tenantId]);
    const conns: Connections = {
      cloud: cloud ? { connectionId: cloud.id as string, inboxId: (cloud.inbox_id ?? null) as string | null } : null,
      web: web ? { connectionId: web.id as string, inboxId: (web.inbox_id ?? null) as string | null } : null,
    };
    cache.set(tenantId, conns);
    return conns;
  }

  private templateConfigFrom(name: any, lang: any, vars: any): TemplateConfig {
    const n = String(name ?? '').trim();
    if (!n) return null;
    return { name: n, lang: String(lang || 'es'), vars: Array.isArray(vars) ? (vars as string[]) : [] };
  }

  /** Prefer the official template when one is given AND a Cloud API number is connected; otherwise
   *  fall back to WhatsApp Web free text. Null when the tenant has no connected WhatsApp channel. */
  private resolveChannel(conns: Connections, tpl: TemplateConfig): ReminderChannel {
    if (tpl && conns.cloud) {
      return { kind: 'template', connectionId: conns.cloud.connectionId, inboxId: conns.cloud.inboxId, templateName: tpl.name, templateLang: tpl.lang, vars: tpl.vars };
    }
    if (conns.web) return { kind: 'web', connectionId: conns.web.connectionId, inboxId: conns.web.inboxId };
    return null;
  }

  /** Resolve one template {{n}} placeholder to its value for this invoice/rule. Unknown keys
   *  (and 'fixed:...') are treated as literal text, so the UI can hard-code a word if needed. */
  private templateParam(inv: any, rule: string, key: string): string {
    const lang = String(inv.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
    switch (key) {
      case 'first_name': return String(inv.full_name || '').split(' ')[0] || (lang === 'en' ? 'there' : 'Hola');
      case 'full_name': return String(inv.full_name || '').trim() || (lang === 'en' ? 'there' : 'Cliente');
      case 'company': return String(inv.business_name || 'AutoMarkIQ');
      case 'number': return String(inv.number || '');
      case 'amount': return this.money(inv.total_minor, inv.currency);
      case 'due_date':
        return new Date(inv.due_date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      case 'link': return String(inv.external_url || inv.pdf_url || '').trim();
      case 'state': return this.stateText(inv, lang);
      default:
        return key.startsWith('fixed:') ? key.slice(6) : '';
    }
  }

  /** Days until due (negative = overdue), from the invoice due_date. Null when no due_date. */
  private dueDiffDays(inv: any): number | null {
    if (!inv.due_date) return null;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const due = new Date(inv.due_date); due.setUTCHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86400000);
  }

  /** Short status phrase derived from the real due date (works for both the due-date notices and
   *  the recurring dunning, where the invoice may not even be overdue yet). */
  private stateText(inv: any, lang: 'en' | 'es'): string {
    const d = this.dueDiffDays(inv);
    if (d === null) return lang === 'en' ? 'pending payment' : 'pendiente de pago';
    if (d > 0) return lang === 'en' ? `due in ${d} day(s)` : `vence en ${d} día(s)`;
    if (d === 0) return lang === 'en' ? 'due today' : 'vence hoy';
    return lang === 'en' ? 'overdue' : 'está vencida';
  }

  /** Find an open conversation for the contact, or create one on the given channel. Shared by both paths. */
  private async findOrCreateConversation(inv: any, channelType: string, connectionId: string, inboxId: string | null, externalId: string | null): Promise<string> {
    const [existing] = await this.db.query(
      `SELECT id FROM conversations
        WHERE tenant_id=$1 AND contact_id=$2 AND status != 'resolved'
        ORDER BY created_at DESC LIMIT 1`,
      [inv.tenant_id, inv.contact_id],
    );
    if (existing) return existing.id;
    const [conv] = await this.db.query(
      `INSERT INTO conversations (tenant_id, contact_id, inbox_id, connection_id, channel_type, external_id, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NOW()) RETURNING id`,
      [inv.tenant_id, inv.contact_id, inboxId, connectionId, channelType, externalId],
    );
    return conv.id;
  }

  /** Record a sent reminder as an outbound 'bot' message + log the (invoice,rule) so it fires once. */
  private async logSentReminder(inv: any, rule: string, conversationId: string, body: string, externalId: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, external_id, created_at, updated_at)
       VALUES ($1,$2,$3,'text','outbound','bot',false,$4,NOW(),NOW())`,
      [inv.tenant_id, conversationId, body, externalId],
    ).catch(() => {});
    await this.db.query(`UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`, [conversationId]).catch(() => {});
    await this.db.query(
      `INSERT INTO invoice_reminders (tenant_id, invoice_id, rule) VALUES ($1,$2,$3) ON CONFLICT (invoice_id, rule) DO NOTHING`,
      [inv.tenant_id, inv.id, rule],
    );
  }

  private jidFromPhone(phone: string, connectionId: string): string | null {
    const p = String(phone || '').trim();
    if (!p) return null;
    if (p.startsWith('lid:')) {
      const lidDigits = p.slice(4);
      const resolved = this.waSvc.resolveLid(connectionId, lidDigits);
      return resolved ? `${resolved}@s.whatsapp.net` : `${lidDigits}@lid`;
    }
    const digits = p.replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : null;
  }

  private money(minor: any, currency: string): string {
    const n = Number(minor) / 100;
    const amount = n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sym = SYMBOL[String(currency || '').toUpperCase()];
    return sym ? `${sym}${amount}` : `${amount} ${currency}`;
  }

  private buildText(inv: any, _rule: string): string {
    const lang = String(inv.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
    const first = String(inv.full_name || '').split(' ')[0] || (lang === 'en' ? 'there' : '');
    const company = inv.business_name || 'AutoMarkIQ';
    const amount = this.money(inv.total_minor, inv.currency);
    const due = inv.due_date ? new Date(inv.due_date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const link = (inv.external_url || inv.pdf_url || '').trim();
    const diff = this.dueDiffDays(inv);

    if (lang === 'en') {
      const state = diff !== null && diff < 0 ? 'It is overdue — please settle it when you can.' : `It is ${this.stateText(inv, 'en')}.`;
      const linkLine = link ? `\nView it here: ${link}\n` : '';
      return `Hi ${first} 👋\n\nThis is ${company} about your invoice:\n\n📄 No: ${inv.number}\n💰 Amount: ${amount}\n📅 Due: ${due}\n\n${state}${linkLine}\nIf you have already paid, please ignore this message. Thank you!`;
    }
    const st = this.stateText(inv, 'es');
    const state = diff !== null && diff < 0 ? 'Está vencida — por favor regulariza el pago cuando puedas.' : `${st.charAt(0).toUpperCase()}${st.slice(1)}.`;
    const linkLine = link ? `\nPuedes verla aquí: ${link}\n` : '';
    return `Hola ${first} 👋\n\nTe escribimos de ${company} sobre tu factura:\n\n📄 N.º: ${inv.number}\n💰 Importe: ${amount}\n📅 Vencimiento: ${due}\n\n${state}${linkLine}\nSi ya realizaste el pago, ignora este mensaje. ¡Gracias!`;
  }

  private async sendReminder(inv: any, rule: string, ch: ReminderChannel): Promise<boolean> {
    if (!ch) return false;
    return ch.kind === 'template'
      ? this.sendViaTemplate(inv, rule, ch)
      : this.sendViaWeb(inv, rule, ch);
  }

  /** Official WhatsApp Cloud API: send an approved template and record it as a bot message. */
  private async sendViaTemplate(inv: any, rule: string, ch: Extract<ReminderChannel, { kind: 'template' }>): Promise<boolean> {
    const bodyParams = ch.vars.map((k) => this.templateParam(inv, rule, k));
    // Meta rejects empty params and sendWhatsappTemplate drops them (which would misalign {{n}}).
    // If any mapped value is blank for this invoice (e.g. no link), skip WITHOUT logging it as sent,
    // so it can fire later once the data exists. Admin can map to always-present fields to avoid this.
    if (bodyParams.some((p) => !p || !String(p).trim())) {
      this.logger.warn(`reminder ${inv.id}: template "${ch.templateName}" skipped — a mapped variable is empty`);
      return false;
    }
    const r = await this.connections.sendWhatsappTemplate(inv.tenant_id, {
      to: inv.phone, name: ch.templateName, language: ch.templateLang,
      bodyParams, connectionId: ch.connectionId, // no conversationId: we record it ourselves as 'bot'
    });
    if (!r?.ok) { this.logger.warn(`reminder ${inv.id}: template "${ch.templateName}" failed: ${r?.error}`); return false; }

    // Record a readable summary of the reminder in the inbox (the bot path logs 'bot', not 'agent').
    const body = this.buildText(inv, rule);
    const conversationId = await this.findOrCreateConversation(inv, 'whatsapp', ch.connectionId, ch.inboxId, String(inv.phone).replace(/\D/g, ''));
    await this.logSentReminder(inv, rule, conversationId, body, r.messageId ?? null);
    this.logger.log(`Invoice reminder "${rule}" → template ${ch.templateName} (invoice ${inv.number})`);
    return true;
  }

  /** WhatsApp Web (Baileys) free text: the original path, used when no official template is set. */
  private async sendViaWeb(inv: any, rule: string, ch: Extract<ReminderChannel, { kind: 'web' }>): Promise<boolean> {
    const jid = this.jidFromPhone(inv.phone, ch.connectionId);
    if (!jid) return false;
    const text = this.buildText(inv, rule);

    const conversationId = await this.findOrCreateConversation(inv, 'whatsapp_web', ch.connectionId, ch.inboxId, jid);
    const ok = await this.waSvc.sendMessage(ch.connectionId, jid, text);
    if (!ok) { this.logger.warn(`reminder ${inv.id}: WA delivery failed to ${jid}`); return false; }

    await this.logSentReminder(inv, rule, conversationId, text, null);
    this.logger.log(`Invoice reminder "${rule}" → ${jid} (invoice ${inv.number})`);
    return true;
  }
}
