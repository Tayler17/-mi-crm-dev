import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappWebService } from '../connections/whatsapp-web.service';
import { ConnectionsService } from '../connections/connections.service';

/**
 * Polls every 60 seconds for pending scheduled_messages whose scheduled_at <= NOW()
 * and delivers them as real outbound messages in the conversation thread.
 */
@Injectable()
export class ScheduledMessagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledMessagesService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
    private readonly waSvc: WhatsappWebService,
    private readonly connections: ConnectionsService,
  ) {}

  async onModuleInit() {
    // Defensive schema evolution: let a scheduled message carry an approved WhatsApp template
    // (Cloud API) instead of free text, so it can be scheduled outside the 24h window.
    for (const col of [
      `kind text NOT NULL DEFAULT 'text'`, 'template_name text', 'template_lang text', 'template_params jsonb',
    ]) {
      await this.db.query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }
    // Run immediately on startup, then every 60 s
    this.dispatch();
    this.timer = setInterval(() => this.dispatch(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch() {
    try {
      // Fetch all pending messages whose time has come
      const due = await this.db.query(
        `SELECT id, tenant_id, conversation_id, author_id, body, content_type,
                kind, template_name, template_lang, template_params
         FROM scheduled_messages
         WHERE status = 'pending' AND scheduled_at <= NOW()
         LIMIT 50`,
      );

      if (!due.length) return;

      this.logger.log(`Dispatching ${due.length} scheduled message(s)`);

      for (const sm of due) {
        // WhatsApp official template (Cloud API) — sent + recorded by ConnectionsService.
        if (sm.kind === 'template') { await this.dispatchTemplate(sm); continue; }
        try {
          // Insert as a real outbound message
          await this.db.query(
            `INSERT INTO messages
               (tenant_id, conversation_id, sender_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'outbound', 'agent', false, NOW(), NOW())`,
            [sm.tenant_id, sm.conversation_id, sm.author_id, sm.body, sm.content_type || 'text'],
          );

          // Update conversation last_message_at
          await this.db.query(
            `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [sm.conversation_id],
          );

          // Deliver through the conversation's actual channel
          await this.deliverOutbound(sm.conversation_id, sm.tenant_id, sm.body);

          // Mark as sent
          await this.db.query(
            `UPDATE scheduled_messages SET status = 'sent', sent_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [sm.id],
          );

          this.notifications.emit({
            tenantId: sm.tenant_id,
            type: 'message_created',
            payload: { conversationId: sm.conversation_id, scheduledMessageId: sm.id },
          });
          this.logger.log(`Scheduled message ${sm.id} sent to conversation ${sm.conversation_id}`);
        } catch (err) {
          this.logger.error(`Failed to dispatch scheduled message ${sm.id}: ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Scheduled messages dispatch error: ${err}`);
    }
  }

  /** Deliver a scheduled WhatsApp template via the Cloud API. ConnectionsService both sends it
   *  and records it in the conversation (recordTemplateMessage), so no manual insert here. */
  private async dispatchTemplate(sm: any): Promise<void> {
    try {
      const [conv] = await this.db.query(
        `SELECT COALESCE(ct.phone, c.external_id) AS phone
           FROM conversations c LEFT JOIN contacts ct ON ct.id = c.contact_id
          WHERE c.id = $1 AND c.tenant_id = $2 LIMIT 1`,
        [sm.conversation_id, sm.tenant_id],
      );
      const to = conv?.phone ? String(conv.phone) : '';
      if (!to) { await this.markScheduled(sm.id, 'failed'); this.logger.warn(`scheduled template ${sm.id}: no recipient phone`); return; }

      const params = Array.isArray(sm.template_params) ? sm.template_params : [];
      const r = await this.connections.sendWhatsappTemplate(sm.tenant_id, {
        to, name: sm.template_name, language: sm.template_lang || 'es',
        bodyParams: params, conversationId: sm.conversation_id, renderedBody: sm.body,
      });
      // Meta rejected it (bad params / not approved) → stop retrying. Network errors throw and stay pending.
      if (!r?.ok) { await this.markScheduled(sm.id, 'failed'); this.logger.warn(`scheduled template ${sm.id} failed: ${r?.error}`); return; }

      await this.markScheduled(sm.id, 'sent');
      this.logger.log(`Scheduled template ${sm.id} sent (${sm.template_name}) to conversation ${sm.conversation_id}`);
    } catch (err) {
      // Transient (network/timeout): leave it pending so the next cycle retries.
      this.logger.error(`Failed to dispatch scheduled template ${sm.id}: ${err}`);
    }
  }

  private async markScheduled(id: string, status: string): Promise<void> {
    await this.db.query(
      `UPDATE scheduled_messages
          SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END, updated_at = NOW()
        WHERE id = $1`,
      [id, status],
    ).catch(() => {});
  }

  // ── Channel delivery (mirrors MessagesController.deliverOutbound) ────────────

  private async deliverOutbound(conversationId: string, tenantId: string, text: string) {
    if (!text) return;
    try {
      const [conv] = await this.db.query(
        `SELECT c.channel_type, c.connection_id, c.external_id,
                cc.channel_type AS conn_channel_type, cc.credentials
         FROM conversations c
         LEFT JOIN channel_connections cc ON cc.id = c.connection_id
         WHERE c.id = $1 AND c.tenant_id = $2 LIMIT 1`,
        [conversationId, tenantId],
      );
      if (!conv) return;

      const channelType = conv.channel_type ?? conv.conn_channel_type;

      switch (channelType) {
        case 'whatsapp_web': {
          const remoteJid    = conv.external_id;
          const connectionId = conv.connection_id;
          if (!remoteJid || !connectionId) return;
          await this.waSvc.sendMessage(connectionId, remoteJid, text);
          break;
        }
        case 'telegram': {
          const creds  = conv.credentials ?? {};
          const chatId = conv.external_id;
          const token  = creds.botToken;
          if (!chatId || !token) return;
          await (globalThis as any).fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text }),
              signal: AbortSignal.timeout(8000) },
          ).catch(() => {});
          break;
        }
        case 'whatsapp': {
          const creds   = conv.credentials ?? {};
          const phoneId = creds.phoneNumberId;
          const token   = creds.accessToken;
          const toPhone = conv.external_id;
          if (!phoneId || !token || !toPhone) return;
          await (globalThis as any).fetch(
            `https://graph.facebook.com/v19.0/${phoneId}/messages`,
            { method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ messaging_product: 'whatsapp', to: toPhone, type: 'text', text: { body: text } }),
              signal: AbortSignal.timeout(8000) },
          ).catch(() => {});
          break;
        }
        default: break;
      }
    } catch (e: any) {
      this.logger.error(`deliverOutbound for scheduled msg: ${e.message}`);
    }
  }
}
