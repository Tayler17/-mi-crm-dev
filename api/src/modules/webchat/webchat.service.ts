import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiChatbotEngineService } from '../ai-chatbots/ai-chatbot-engine.service';

@Injectable()
export class WebchatService implements OnModuleInit {
  private readonly logger = new Logger('Webchat');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly engine: AiChatbotEngineService,
  ) {}

  async onModuleInit() {
    // Conversations are now created lazily (on the visitor's first message), so a
    // session may exist without a conversation. Make sure the column allows NULL.
    await this.db
      .query(`ALTER TABLE webchat_sessions ALTER COLUMN conversation_id DROP NOT NULL`)
      .catch(() => {});
  }

  // ── Public config ─────────────────────────────────────────────────────────────

  async getConfig(botId: string) {
    const [bot] = await this.db.query(
      `SELECT id, name, welcome_message, visual_config,
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
      avatar:      bot.visual_config?.emoji ?? null,
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

    // Reuse existing session for this visitor. A session may not have a
    // conversation yet (it's created lazily on the first real message), so we
    // also reuse sessions whose conversation_id is still null.
    const existing = await this.db.query(
      `SELECT ws.*, c.status AS conv_status
       FROM webchat_sessions ws
       LEFT JOIN conversations c ON c.id = ws.conversation_id
       WHERE ws.bot_id=$1 AND ws.visitor_id=$2
       ORDER BY ws.created_at DESC LIMIT 1`,
      [botId, visitorId],
    );

    if (existing.length && (!existing[0].conversation_id || existing[0].conv_status !== 'resolved')) {
      const s = existing[0];
      await this.db.query(
        `UPDATE webchat_sessions SET last_active_at=NOW() WHERE id=$1`, [s.id],
      );
      // If a conversation already exists, return its history; otherwise show
      // just the welcome (nothing has been persisted yet).
      const messages = s.conversation_id
        ? await this.getMessages(s.id)
        : this.welcomeMessages(bot.welcome_message);
      return { sessionId: s.id, conversationId: s.conversation_id ?? null, messages, isNew: false };
    }

    // Create the session WITHOUT a conversation. The conversation (and contact)
    // are created lazily on the visitor's first real message — so the inbox is
    // never polluted with empty "No messages" webchat conversations from page
    // loads, bots, or uptime monitors.
    const [session] = await this.db.query(
      `INSERT INTO webchat_sessions
         (bot_id, tenant_id, conversation_id, contact_id, visitor_id, visitor_name, visitor_email, created_at, last_active_at)
       VALUES ($1,$2,NULL,NULL,$3,$4,$5,NOW(),NOW()) RETURNING id`,
      [botId, tenantId, visitorId, visitorName ?? null, visitorEmail ?? null],
    );

    return {
      sessionId: session.id,
      conversationId: null,
      messages: this.welcomeMessages(bot.welcome_message),
      isNew: true,
    };
  }

  /** Welcome message rendered for display only (not persisted until a conversation exists). */
  private welcomeMessages(welcome?: string | null) {
    return welcome
      ? [{ id: 'welcome', body: welcome, direction: 'outbound', sender_type: 'bot', created_at: new Date().toISOString() }]
      : [];
  }

  /**
   * Lazily creates the conversation (and contact/inbox) for a session the first
   * time the visitor actually sends a message. Idempotent: returns the existing
   * conversation id if one was already created.
   */
  private async ensureConversation(session: any): Promise<string> {
    if (session.conversation_id) return session.conversation_id;

    const tenantId: string = session.tenant_id;
    const visitorName: string | null = session.visitor_name;
    const visitorEmail: string | null = session.visitor_email;
    const visitorId: string = session.visitor_id;

    // Find or create contact (only if the visitor identified themselves by email)
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
            `UPDATE contacts SET full_name=$1 WHERE id=$2`, [visitorName, contactId],
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

    await this.db.query(
      `UPDATE webchat_sessions SET conversation_id=$1, contact_id=$2 WHERE id=$3`,
      [conv.id, contactId, session.id],
    );

    // Persist the welcome message as the first turn so the agent has context.
    const [bot] = await this.db.query(
      `SELECT welcome_message FROM ai_chatbots WHERE id=$1`, [session.bot_id],
    );
    if (bot?.welcome_message) {
      await this.saveMessage(tenantId, conv.id, bot.welcome_message, 'outbound', 'bot');
    }

    session.conversation_id = conv.id;
    return conv.id;
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

    const { bot_id: botId, tenant_id: tenantId } = session;

    // Create the conversation lazily on the first real message.
    const conversationId = await this.ensureConversation(session);

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
