import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappWebService } from '../connections/whatsapp-web.service';

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
  ) {}

  onModuleInit() {
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
        `SELECT id, tenant_id, conversation_id, author_id, body, content_type
         FROM scheduled_messages
         WHERE status = 'pending' AND scheduled_at <= NOW()
         LIMIT 50`,
      );

      if (!due.length) return;

      this.logger.log(`Dispatching ${due.length} scheduled message(s)`);

      for (const sm of due) {
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
