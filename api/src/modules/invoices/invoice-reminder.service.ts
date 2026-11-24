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
const RULES: Array<{ rule: string; offset: number }> = [
  { rule: 'due_soon_3', offset: 3 },
  { rule: 'due_today', offset: 0 },
  { rule: 'overdue_3', offset: -3 },
  { rule: 'overdue_7', offset: -7 },
];

const SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', DOP: 'RD$' };

type ReminderChannel =
  | { kind: 'template'; connectionId: string; inboxId: string | null; templateName: string; templateLang: string; vars: string[] }
  | { kind: 'web'; connectionId: string; inboxId: string | null }
  | null;
type ReminderChannelCache = Map<string, ReminderChannel>;

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

    const job = new CronJob('0 14 * * *', () => { void this.runDailyCheck(); }); // 14:00 UTC daily
    try { this.schedulerRegistry.addCronJob('invoice-reminders', job as any); job.start(); } catch {}
    this.logger.log('Invoice reminder scheduler registered (14:00 UTC daily)');
  }

  /** Public so it can be triggered manually (owner "run now" endpoint). Optionally scoped to one tenant. */
  async runDailyCheck(onlyTenantId?: string): Promise<{ sent: number; skipped: number }> {
    let sent = 0, skipped = 0;
    const connCache: ReminderChannelCache = new Map();

    for (const r of RULES) {
      let rows: any[] = [];
      try {
        const params: any[] = [r.offset, r.rule];
        let tenantFilter = '';
        if (onlyTenantId) { params.push(onlyTenantId); tenantFilter = ` AND i.tenant_id = $${params.length}`; }
        rows = await this.db.query(
          `SELECT i.id, i.tenant_id, i.number, i.total_minor, i.currency, i.due_date,
                  i.external_url, i.pdf_url, i.contact_id,
                  ct.full_name, ct.phone,
                  COALESCE(t.lang, 'es') AS lang, s.business_name
             FROM invoices i
             JOIN tenant_invoice_settings s ON s.tenant_id = i.tenant_id AND s.reminders_enabled = true
             JOIN contacts ct ON ct.id = i.contact_id
             JOIN tenants  t  ON t.id  = i.tenant_id
            WHERE i.financial_status IN ('issued', 'partially_paid')
              AND i.due_date IS NOT NULL
              AND ct.phone IS NOT NULL AND ct.phone <> ''
              AND i.due_date = (CURRENT_DATE + $1::int)${tenantFilter}
              AND NOT EXISTS (SELECT 1 FROM invoice_reminders rr WHERE rr.invoice_id = i.id AND rr.rule = $2)
            LIMIT 500`,
          params,
        );
      } catch (e: any) {
        this.logger.error(`reminder query (${r.rule}) failed: ${e?.message}`);
        continue;
      }

      for (const inv of rows) {
        try {
          const ok = await this.sendReminder(inv, r.rule, connCache);
          if (ok) sent++; else skipped++;
        } catch (e: any) {
          skipped++;
          this.logger.error(`reminder ${inv.id} (${r.rule}) failed: ${e?.message}`);
        }
      }
    }
    if (sent || skipped) this.logger.log(`Invoice reminders: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped };
  }

  /** Resolve how this tenant sends reminders: prefer an approved official template (Cloud API)
   *  when configured AND a connected Cloud API number exists, otherwise fall back to WhatsApp Web
   *  free text. Returns null when the tenant can't send yet (so it retries on a later rule date). */
  private async getTenantReminderChannel(tenantId: string, cache: ReminderChannelCache): Promise<ReminderChannel> {
    if (cache.has(tenantId)) return cache.get(tenantId)!;
    let resolved: ReminderChannel = null;

    const [s] = await this.db.query(
      `SELECT reminder_template_name, reminder_template_lang, reminder_template_vars
         FROM tenant_invoice_settings WHERE tenant_id=$1 LIMIT 1`,
      [tenantId],
    );
    const tplName = String(s?.reminder_template_name ?? '').trim();

    // Official template path (only if a template is configured AND a Cloud API number is connected).
    if (tplName) {
      const [cloud] = await this.db.query(
        `SELECT id, inbox_id FROM channel_connections
          WHERE tenant_id=$1 AND channel_type='whatsapp' AND status='connected'
          ORDER BY created_at ASC LIMIT 1`,
        [tenantId],
      );
      if (cloud) {
        const vars = Array.isArray(s?.reminder_template_vars) ? (s.reminder_template_vars as string[]) : [];
        resolved = {
          kind: 'template', connectionId: cloud.id as string, inboxId: (cloud.inbox_id ?? null) as string | null,
          templateName: tplName, templateLang: String(s?.reminder_template_lang || 'es'), vars,
        };
      }
    }

    // Fallback: WhatsApp Web free text (current behaviour).
    if (!resolved) {
      const [web] = await this.db.query(
        `SELECT id, inbox_id FROM channel_connections
          WHERE tenant_id=$1 AND channel_type='whatsapp_web' AND status='connected'
          ORDER BY created_at ASC LIMIT 1`,
        [tenantId],
      );
      if (web) resolved = { kind: 'web', connectionId: web.id as string, inboxId: (web.inbox_id ?? null) as string | null };
    }

    cache.set(tenantId, resolved);
    return resolved;
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
      case 'state':
        if (lang === 'en') return rule === 'due_soon_3' ? 'due in 3 days' : rule === 'due_today' ? 'due today' : 'overdue';
        return rule === 'due_soon_3' ? 'vence en 3 días' : rule === 'due_today' ? 'vence hoy' : 'está vencida';
      default:
        return key.startsWith('fixed:') ? key.slice(6) : '';
    }
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

  private buildText(inv: any, rule: string): string {
    const lang = String(inv.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
    const first = String(inv.full_name || '').split(' ')[0] || (lang === 'en' ? 'there' : '');
    const company = inv.business_name || 'AutoMarkIQ';
    const amount = this.money(inv.total_minor, inv.currency);
    const due = new Date(inv.due_date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const link = (inv.external_url || inv.pdf_url || '').trim();

    if (lang === 'en') {
      const state = rule === 'due_soon_3' ? 'It is due in 3 days.'
        : rule === 'due_today' ? 'It is due today.'
        : 'It is overdue — please settle it when you can.';
      const linkLine = link ? `\nView it here: ${link}\n` : '';
      return `Hi ${first} 👋\n\nThis is ${company} about your invoice:\n\n📄 No: ${inv.number}\n💰 Amount: ${amount}\n📅 Due: ${due}\n\n${state}${linkLine}\nIf you have already paid, please ignore this message. Thank you!`;
    }
    const state = rule === 'due_soon_3' ? 'Vence en 3 días.'
      : rule === 'due_today' ? 'Vence hoy.'
      : 'Está vencida — por favor regulariza el pago cuando puedas.';
    const linkLine = link ? `\nPuedes verla aquí: ${link}\n` : '';
    return `Hola ${first} 👋\n\nTe escribimos de ${company} sobre tu factura:\n\n📄 N.º: ${inv.number}\n💰 Importe: ${amount}\n📅 Vencimiento: ${due}\n\n${state}${linkLine}\nSi ya realizaste el pago, ignora este mensaje. ¡Gracias!`;
  }

  private async sendReminder(inv: any, rule: string, cache: ReminderChannelCache): Promise<boolean> {
    const ch = await this.getTenantReminderChannel(inv.tenant_id, cache);
    // No usable channel yet → skip WITHOUT logging, so it can still fire on a later rule date.
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
