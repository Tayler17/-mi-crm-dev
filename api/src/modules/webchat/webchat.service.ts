import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiChatbotEngineService } from '../ai-chatbots/ai-chatbot-engine.service';

@Injectable()
export class WebchatService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly engine: AiChatbotEngineService,
  ) {}

  // ── Public config ─────────────────────────────────────────────────────────────

  async getConfig(botId: string) {
    const [bot] = await this.db.query(
      `SELECT id, name, welcome_message,
              webchat_enabled, webchat_color, webchat_title, webchat_subtitle, webchat_placeholder
       FROM ai_chatbots WHERE id=$1 AND status='active'`,
      [botId],
    );
    if (!bot || !bot.webchat_enabled) throw new NotFoundException('Webchat no disponible');
    return {
      botId:       bot.id,
      name:        bot.name,
      welcome:     bot.welcome_message ?? null,
      color:       bot.webchat_color   ?? '#6366f1',
      title:       bot.webchat_title   ?? bot.name,
      subtitle:    bot.webchat_subtitle ?? '¿En qué puedo ayudarte?',
      placeholder: bot.webchat_placeholder ?? 'Escribe un mensaje...',
    };
  }

  // ── Session init ──────────────────────────────────────────────────────────────

  async initSession(
    botId: string,
    visitorId: string,
    visitorName?: string,
    visitorEmail?: string,
  ) {
    // Load bot + tenant
    const [bot] = await this.db.query(
      `SELECT id, tenant_id, name, welcome_message, webchat_enabled
       FROM ai_chatbots WHERE id=$1 AND status='active'`,
      [botId],
    );
    if (!bot || !bot.webchat_enabled) throw new NotFoundException('Webchat no disponible');

    const tenantId: string = bot.tenant_id;

    // Reuse existing open session for this visitor
    const existing = await this.db.query(
      `SELECT ws.*, c.status AS conv_status
       FROM webchat_sessions ws
       LEFT JOIN conversations c ON c.id = ws.conversation_id
       WHERE ws.bot_id=$1 AND ws.visitor_id=$2
       ORDER BY ws.created_at DESC LIMIT 1`,
      [botId, visitorId],
    );

    if (existing.length && existing[0].conversation_id && existing[0].conv_status !== 'resolved') {
      const s = existing[0];
      await this.db.query(
        `UPDATE webchat_sessions SET last_active_at=NOW() WHERE id=$1`, [s.id],
      );
      const messages = await this.getMessages(s.id);
      return { sessionId: s.id, conversationId: s.conversation_id, messages, isNew: false };
    }

    // Find or create contact
    let contactId: string | null = null;
    if (visitorEmail) {
      const [contact] = await this.db.query(
        `SELECT id FROM contacts WHERE tenant_id=$1 AND email=$2 LIMIT 1`,
        [tenantId, visitorEmail],
      );
      if (contact) {
        contactId = contact.id;
        if (visitorName) {
          await this.db.query(
            `UPDATE contacts SET full_name=$1 WHERE id=$2`,
            [visitorName, contactId],
          ).catch(() => {});
        }
      } else {
        const [newContact] = await this.db.query(
          `INSERT INTO contacts (tenant_id, full_name, email, created_at, updated_at)
           VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id`,
          [tenantId, visitorName ?? visitorEmail, visitorEmail],
        );
        contactId = newContact.id;
      }
    }

    // Find or create webchat inbox
    let [inbox] = await this.db.query(
      `SELECT id FROM inboxes WHERE tenant_id=$1 AND channel_type='webchat' LIMIT 1`,
      [tenantId],
    );
    if (!inbox) {
      [inbox] = await this.db.query(
        `INSERT INTO inboxes (tenant_id, name, channel_type, is_enabled, created_at, updated_at)
         VALUES ($1,'Webchat','webchat',true,NOW(),NOW()) RETURNING id`,
        [tenantId],
      );
    }

    // Create conversation
    const [conv] = await this.db.query(
      `INSERT INTO conversations
         (tenant_id, inbox_id, contact_id, channel_type, status, subject, created_at, updated_at)
       VALUES ($1,$2,$3,'webchat','open',$4,NOW(),NOW()) RETURNING id`,
      [tenantId, inbox.id, contactId, `Webchat: ${visitorName ?? visitorId}`],
    );

    // Create webchat session
    const [session] = await this.db.query(
      `INSERT INTO webchat_sessions
         (bot_id, tenant_id, conversation_id, contact_id, visitor_id, visitor_name, visitor_email, created_at, last_active_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING id`,
      [botId, tenantId, conv.id, contactId, visitorId, visitorName ?? null, visitorEmail ?? null],
    );

    // Send welcome message if bot has one
    let welcomeMsg: string | null = null;
    if (bot.welcome_message) {
      await this.saveMessage(tenantId, conv.id, bot.welcome_message, 'outbound', 'bot');
      welcomeMsg = bot.welcome_message;
    }

    const messages = welcomeMsg
      ? [{ id: 'welcome', body: welcomeMsg, direction: 'outbound', sender_type: 'bot', created_at: new Date().toISOString() }]
      : [];

    return { sessionId: session.id, conversationId: conv.id, messages, isNew: true };
  }

  // ── Send message ──────────────────────────────────────────────────────────────

  async sendMessage(sessionId: string, userMessage: string) {
    if (!userMessage?.trim()) throw new BadRequestException('Mensaje vacío');

    const [session] = await this.db.query(
      `SELECT ws.*, b.tenant_id
       FROM webchat_sessions ws
       JOIN ai_chatbots b ON b.id = ws.bot_id
       WHERE ws.id=$1`,
      [sessionId],
    );
    if (!session) throw new NotFoundException('Sesión no encontrada');

    const { bot_id: botId, tenant_id: tenantId, conversation_id: conversationId } = session;

    // Save inbound message
    await this.saveMessage(tenantId, conversationId, userMessage.trim(), 'inbound', 'contact');
    await this.db.query(
      `UPDATE webchat_sessions SET last_active_at=NOW() WHERE id=$1`, [sessionId],
    );

    // Get AI reply
    const reply = await this.engine.generateWebchatReply(
      botId, tenantId, conversationId, userMessage.trim(),
    );

    if (reply) {
      await this.saveMessage(tenantId, conversationId, reply, 'outbound', 'bot');
    }

    return { reply: reply ?? 'Lo siento, ocurrió un error. Inténtalo de nuevo.' };
  }

  // ── Message history ───────────────────────────────────────────────────────────

  async getMessages(sessionId: string) {
    const [session] = await this.db.query(
      `SELECT conversation_id FROM webchat_sessions WHERE id=$1`, [sessionId],
    );
    if (!session?.conversation_id) return [];
    return this.db.query(
      `SELECT id, body, direction, sender_type, created_at
       FROM messages
       WHERE conversation_id=$1 AND is_private=false
       ORDER BY created_at ASC`,
      [session.conversation_id],
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async saveMessage(
    tenantId: string,
    conversationId: string,
    body: string,
    direction: 'inbound' | 'outbound',
    senderType: 'contact' | 'bot',
  ) {
    await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
       VALUES ($1,$2,$3,'text',$4,$5,false,NOW(),NOW())`,
      [tenantId, conversationId, body, direction, senderType],
    );
    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [conversationId],
    ).catch(() => {});
  }
}
