import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Token verification ────────────────────────────────────────────────────────

  async verifyWebhookToken(connectionId: string, token: string): Promise<boolean> {
    const conn = await this.getConnection(connectionId);
    if (!conn) return false;
    const stored = conn.credentials?.webhookVerifyToken;
    // If no token configured, allow any (dev mode); otherwise must match
    return !stored || stored === token;
  }

  // ── WhatsApp Business API (Meta) ─────────────────────────────────────────────

  async processWhatsApp(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value;
          if (!value?.messages) continue;
          for (const msg of value.messages) {
            const waId  = msg.from;
            const text  = msg.text?.body ?? msg.type ?? '(media)';
            const name  = value.contacts?.find((c: any) => c.wa_id === waId)?.profile?.name ?? waId;
            await this.upsertMessage({
              tenantId: conn.tenant_id, connectionId,
              inboxId: conn.inbox_id, channel: 'whatsapp',
              externalId: waId, contactName: name, contactPhone: waId,
              messageExtId: msg.id, body: text,
            });
          }
        }
      }
    } catch (err) {
      this.logger.error(`WhatsApp webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Facebook Messenger ────────────────────────────────────────────────────────

  async processFacebook(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      for (const entry of body?.entry ?? []) {
        for (const event of entry?.messaging ?? []) {
          if (!event?.message) continue;           // ignore delivery/read receipts
          if (event.message.is_echo) continue;     // ignore echoes of our own messages

          const senderId = String(event.sender?.id ?? '');
          const text = event.message.text ?? '(media)';
          await this.upsertMessage({
            tenantId: conn.tenant_id, connectionId,
            inboxId: conn.inbox_id, channel: 'facebook',
            externalId: senderId, contactName: senderId, contactPhone: senderId,
            messageExtId: event.message.mid ?? String(event.timestamp),
            body: text,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Facebook webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Instagram DM ──────────────────────────────────────────────────────────────

  async processInstagram(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      for (const entry of body?.entry ?? []) {
        for (const event of entry?.messaging ?? []) {
          if (!event?.message) continue;
          if (event.message.is_echo) continue;

          const senderId = String(event.sender?.id ?? '');
          const text = event.message.text ?? '(media)';
          await this.upsertMessage({
            tenantId: conn.tenant_id, connectionId,
            inboxId: conn.inbox_id, channel: 'instagram',
            externalId: senderId, contactName: senderId, contactPhone: senderId,
            messageExtId: event.message.mid ?? String(event.timestamp),
            body: text,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Instagram webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Telegram ─────────────────────────────────────────────────────────────────

  async processTelegram(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      const msg = body?.message ?? body?.edited_message;
      if (!msg) return;

      const chatId = String(msg.chat?.id ?? '');
      const text   = msg.text ?? msg.caption ?? '(media)';
      const from   = msg.from;
      const name   = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username || chatId;

      await this.upsertMessage({
        tenantId: conn.tenant_id, connectionId,
        inboxId: conn.inbox_id, channel: 'telegram',
        externalId: chatId, contactName: name,
        contactPhone: from?.username ? `@${from.username}` : chatId,
        messageExtId: String(msg.message_id), body: text,
      });
    } catch (err) {
      this.logger.error(`Telegram webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Core: upsert contact + conversation + message ─────────────────────────────

  private async upsertMessage(opts: {
    tenantId: string; connectionId: string; inboxId: string | null;
    channel: string; externalId: string; contactName: string; contactPhone: string;
    messageExtId: string; body: string;
  }) {
    const { tenantId, connectionId, inboxId, channel, externalId, contactName, contactPhone, messageExtId, body } = opts;

    // 1. Find or create contact
    const [existing] = await this.db.query(
      `SELECT id FROM contacts WHERE tenant_id=$1 AND phone=$2 LIMIT 1`,
      [tenantId, contactPhone],
    );
    let contactId: string;
    if (existing) {
      contactId = existing.id;
    } else {
      const [newContact] = await this.db.query(
        `INSERT INTO contacts (tenant_id, full_name, phone, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id`,
        [tenantId, contactName, contactPhone],
      );
      contactId = newContact.id;
    }

    // 2. Find or create open conversation — keyed by connectionId + externalId (sender)
    const [existingConv] = await this.db.query(
      `SELECT id FROM conversations
       WHERE tenant_id=$1 AND contact_id=$2 AND connection_id=$3 AND status != 'resolved'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, contactId, connectionId],
    );
    let conversationId: string;
    let isNew = false;
    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const [newConv] = await this.db.query(
        `INSERT INTO conversations
           (tenant_id, contact_id, inbox_id, connection_id, external_id, channel_type, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NOW()) RETURNING id`,
        [tenantId, contactId, inboxId ?? null, connectionId, externalId, channel],
      );
      conversationId = newConv.id;
      isNew = true;
    }

    // 3. Dedup by external message ID
    const [dup] = await this.db.query(
      `SELECT id FROM messages WHERE external_id=$1 AND conversation_id=$2 LIMIT 1`,
      [messageExtId, conversationId],
    );
    if (dup) return;

    // 4. Insert message
    await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, external_id, created_at, updated_at)
       VALUES ($1,$2,$3,'text','inbound','contact',false,$4,NOW(),NOW())`,
      [tenantId, conversationId, body, messageExtId],
    );
    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [conversationId],
    );

    // 5a. SSE push so inbox updates in real-time
    this.notifications.emit({
      tenantId,
      type: 'message_created',
      payload: {
        conversationId,
        message: { conversationId, body, direction: 'inbound', senderType: 'contact', contentType: 'text', isPrivate: false, createdAt: new Date().toISOString() },
      },
    });

    // 5b. Internal events for AI chatbots / automations
    const convPayload = { tenantId, conversationId, conversation: { id: conversationId, contact_id: contactId, inbox_id: inboxId, channel } };
    if (isNew) this.events.emit('conversation.created', convPayload);
    this.events.emit('conversation.message_received', {
      ...convPayload,
      message: { body, direction: 'inbound', is_private: false },
    });

    this.logger.log(`[${channel}] msg from ${contactName} → conv ${conversationId}`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async getConnection(connectionId: string) {
    const [conn] = await this.db.query(
      `SELECT id, tenant_id, inbox_id, channel_type, credentials, status
       FROM channel_connections WHERE id=$1 LIMIT 1`,
      [connectionId],
    );
    return conn ?? null;
  }
}
