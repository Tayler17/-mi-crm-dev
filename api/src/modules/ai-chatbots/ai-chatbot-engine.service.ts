import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data');
import { WhatsappWebService } from '../connections/whatsapp-web.service';
import { NotificationsService } from '../notifications/notifications.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { BillingService } from '../billing/billing.service';
import { IntegrationsService } from '../integrations/integrations.service';

interface MediaResult {
  /** Text to pass to the LLM (transcription for audio, empty for images) */
  text: string;
  /** Base64-encoded image data (for vision models) */
  imageBase64?: string;
  imageMimeType?: string;
  /** True when media couldn't be processed — skip AI and use fallback_message */
  unprocessable?: boolean;
}

/** Return value from every callAi* method */
interface AiResult {
  reply: string;
  transferTo?: string;
  resolveConversation?: boolean;
  setWaiting?: boolean;
  createDeal?: { title: string; value?: number; currency?: string; stageName?: string; notes?: string };
  updateDeal?: { dealId: string; stageName?: string; value?: number; notes?: string; status?: string };
  addTag?: { tagName: string };
  removeTag?: { tagName: string };
  createTask?: { title: string; description?: string; dueDate?: string; priority?: string };
  createPaymentLink?: { amount: number; currency: string; description: string };
  dentallyListPractitioners?: boolean;
  dentallyCheckAvailability?: { date: string; practitionerName?: string; durationMinutes?: number };
  dentallyBook?: { date: string; time: string; practitionerName?: string; durationMinutes?: number; reason?: string; dateOfBirth?: string; gender?: string; title?: string };
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];  // any[] for vision messages
};

@Injectable()
export class AiChatbotEngineService {
  private readonly logger = new Logger(AiChatbotEngineService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly waSvc: WhatsappWebService,
    private readonly notifications: NotificationsService,
    private readonly kbSvc: KnowledgeBaseService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly billing: BillingService,
    private readonly integrations: IntegrationsService,
  ) {}

  // ── Core processing (called by BotQueueProcessor) ────────────────────────────

  async processMessage(tenantId: string, conversationId: string, inboundMsg: any) {
    // 0. Skip if a conversation flow session is active — flow runner has priority
    const [activeFlow] = await this.db.query(
      `SELECT id FROM flow_sessions WHERE conversation_id=$1 AND status='active' LIMIT 1`,
      [conversationId],
    );
    if (activeFlow) {
      this.logger.debug(`[engine] Skipping AI chatbot — active flow session for conv ${conversationId}`);
      return;
    }

    // 1. Load conversation + linked inbox + current queue
    const [conv] = await this.db.query(
      `SELECT c.id, c.inbox_id, c.contact_id, c.connection_id, c.queue_id,
              c.team_id, c.is_group,
              cc.inbox_id AS conn_inbox_id
       FROM conversations c
       LEFT JOIN channel_connections cc ON cc.id = c.connection_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [conversationId, tenantId],
    );
    if (!conv) {
      this.logger.warn(`[engine] Conversation ${conversationId} not found for tenant ${tenantId}`);
      return;
    }

    const effectiveInboxId = conv.inbox_id ?? conv.conn_inbox_id;
    if (!effectiveInboxId) {
      this.logger.warn(`[engine] No inbox for conversation ${conversationId}`);
      return;
    }

    if (!conv.inbox_id && conv.conn_inbox_id) {
      await this.db.query(`UPDATE conversations SET inbox_id = $1 WHERE id = $2`,
        [conv.conn_inbox_id, conversationId]).catch(() => {});
    }

    // 2. Find active bot — prefer a bot that already has an active session for this
    // conversation (post-transfer state where dest bot's session was pre-created),
    // then fall back to inbox/queue matching for the initial message.
    // NOTE: even when matching via session, we still verify the bot is assigned to
    // this inbox/queue/team — if an admin disconnected the bot from the channel,
    // the session should no longer be authoritative.
    let [bot] = await this.db.query(
      `SELECT b.* FROM ai_chatbots b
       INNER JOIN ai_chatbot_sessions s ON s.chatbot_id = b.id
       WHERE s.conversation_id = $1 AND s.status = 'active'
         AND b.tenant_id = $2 AND b.status = 'active'
         AND (
           $3::uuid = ANY(b.inbox_ids)
           OR ($4::uuid IS NOT NULL AND $4::uuid = ANY(b.queue_ids))
           OR ($5::uuid IS NOT NULL AND $5::uuid = ANY(b.team_ids))
         )
       ORDER BY s.created_at DESC LIMIT 1`,
      [conversationId, tenantId, effectiveInboxId, conv.queue_id ?? null, conv.team_id ?? null],
    );
    if (!bot) {
      [bot] = await this.db.query(
        `SELECT * FROM ai_chatbots
         WHERE tenant_id = $1 AND status = 'active'
           AND (
             $2::uuid = ANY(inbox_ids)
             OR ($3::uuid IS NOT NULL AND $3::uuid = ANY(queue_ids))
             OR ($4::uuid IS NOT NULL AND $4::uuid = ANY(team_ids))
           )
         ORDER BY
           ($2::uuid = ANY(inbox_ids)) DESC,
           ($3::uuid IS NOT NULL AND $3::uuid = ANY(queue_ids)) DESC,
           ($4::uuid IS NOT NULL AND $4::uuid = ANY(team_ids)) DESC
         LIMIT 1`,
        [tenantId, effectiveInboxId, conv.queue_id ?? null, conv.team_id ?? null],
      );
    }
    if (!bot) {
      this.logger.debug(`[engine] No active bot found for conversation ${conversationId} (inbox ${effectiveInboxId})`);
      return;
    }

    // Skip group conversations unless the bot explicitly opts in
    if (conv.is_group && !bot.respond_in_groups) {
      this.logger.debug(`[engine] Skipping group conversation ${conversationId} — bot "${bot.name}" has respond_in_groups=false`);
      return;
    }

    // Ensure only this bot has an active session for this conversation
    // (end any orphaned active sessions from a previous bot to prevent dual responses)
    await this.db.query(
      `UPDATE ai_chatbot_sessions SET status='ended', ended_at=NOW()
       WHERE conversation_id = $1 AND status='active' AND chatbot_id != $2`,
      [conversationId, bot.id],
    ).catch(() => {});

    // 3. Get/create session — only consider active/ended sessions for THIS bot
    // (a session marked 'ended' by a queue-transfer allows a fresh session here)
    let [session] = await this.db.query(
      `SELECT * FROM ai_chatbot_sessions
       WHERE chatbot_id = $1 AND conversation_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [bot.id, conversationId],
    );
    // Track whether this is a brand-new session for an existing conversation.
    // Used below to decide how far back to load history (if the session is new
    // but the conversation already had messages, we must not lose that context).
    let sessionIsNew = false;
    let prevSessionCreatedAt: Date | null = session?.created_at ?? null;
    // Create a new session if none exists OR if the last session was ended by a queue-transfer
    if (!session || session.status === 'ended') {
      sessionIsNew = !session; // true only when there was never a session (truly first contact)
      [session] = await this.db.query(
        `INSERT INTO ai_chatbot_sessions (tenant_id, chatbot_id, conversation_id, contact_id, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
        [tenantId, bot.id, conversationId, conv.contact_id],
      );
      // Only send welcome message on the very first session for this conversation.
      // If the session was 'ended' (reconnect / queue-return), skip it — the user
      // already saw it and the bot should continue the conversation silently.
      if (sessionIsNew && bot.welcome_message) {
        await this.saveBotMessage(tenantId, conversationId, bot.welcome_message);
        await this.db.query(
          `UPDATE ai_chatbots SET total_conversations = total_conversations + 1 WHERE id = $1`,
          [bot.id],
        );
      }
    }

    // 4. Skip if handed off to a human (ended = queue-transfer, handled above by new session)
    if (session.status === 'handed_off') return;

    // 5. Handoff keyword
    const userText: string = (inboundMsg.body ?? '').toLowerCase().trim();
    const keyword: string  = (bot.handoff_keyword ?? 'agente').toLowerCase();
    if (keyword && userText.includes(keyword)) {
      await this.saveBotMessage(tenantId, conversationId, bot.handoff_message || 'Enseguida te conecto con un agente humano.');
      await this.db.query(
        `UPDATE ai_chatbot_sessions SET status='handed_off', handed_off_at=NOW() WHERE id=$1`, [session.id]);
      await this.db.query(
        `UPDATE ai_chatbots SET handoff_count=handoff_count+1 WHERE id=$1`, [bot.id]);
      // Clear queue so next message (if human doesn't pick up) routes to inbox-level bot
      await this.db.query(`UPDATE conversations SET queue_id=NULL, updated_at=NOW() WHERE id=$1`, [conversationId]).catch(() => {});
      return;
    }

    // 6. Resolve AI provider, model and API key.
    // If tenant's plan does not allow own API keys → always use platform config.
    // If it does → try tenant key first, fall back to platform key.
    const [tenantRow] = await this.db.query(
      `SELECT t.settings, p.allow_own_api_keys
       FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );
    const allowOwnApiKeys: boolean = tenantRow?.allow_own_api_keys ?? false;
    const platformAI = await this.platformSettings.getAI();

    let apiKey: string;
    if (allowOwnApiKeys) {
      const aiKeys: Record<string, string> = tenantRow?.settings?.aiKeys ?? {};
      apiKey = aiKeys[bot.provider];
      if (!apiKey && platformAI.provider === bot.provider && platformAI.apiKey) {
        apiKey = platformAI.apiKey;
        this.logger.log(`[engine] Using platform AI key for provider "${bot.provider}" (tenant ${tenantId})`);
      }
    } else {
      // Use platform provider + model + key regardless of what is stored on the bot
      bot = { ...bot, provider: platformAI.provider, model: platformAI.model ?? bot.model };
      apiKey = platformAI.apiKey;
      this.logger.log(`[engine] Plan without own API keys — using platform AI (${platformAI.provider}/${bot.model}) for tenant ${tenantId}`);
    }

    if (!apiKey) {
      this.logger.warn(`[engine] No API key for provider "${bot.provider}" in tenant ${tenantId} or platform — bot "${bot.name}" cannot respond.`);
      await this.saveBotMessage(tenantId, conversationId,
        bot.fallback_message || 'Lo siento, no estoy disponible en este momento. Por favor contacta a un agente.');
      return;
    }

    // 6b. Load all queues that have an active bot assigned — these are valid transfer destinations.
    // Any bot can transfer to any queue that has a bot serving it, regardless of the current bot's own queue_ids.
    let queueMap: Record<string, string> = {}; // lowercased name → id
    let systemPromptExtra = '';
    try {
      // Load all active queues for this tenant as transfer destinations.
      // bot_name = the bot serving that queue (if any), otherwise falls back to the queue name itself.
      const parsePgArray = (val: any): string[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val.filter(Boolean);
        if (typeof val === 'string') return val.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
        return [];
      };
      const currentBotQueueIds = parsePgArray(bot.queue_ids);
      // Include both the queue name and the bot name so the AI can match by either
      const transferableQueues: any[] = await this.db.query(
        `SELECT q.id, q.name AS queue_name,
           COALESCE((SELECT b2.name FROM ai_chatbots b2 WHERE b2.tenant_id = q.tenant_id AND b2.status = 'active' AND q.id = ANY(b2.queue_ids) LIMIT 1), q.name) AS bot_name
         FROM queues q
         WHERE q.tenant_id = $1 AND q.is_active = true
         ORDER BY q.name`,
        [tenantId],
      );
      // Exclude queues already served by the current bot (prevent self-transfer loops)
      const filtered = transferableQueues.filter((q: any) => !currentBotQueueIds.includes(q.id));
      if (filtered.length) {
        // Register both queue name and bot name as valid transfer keys
        filtered.forEach((q: any) => {
          queueMap[q.queue_name.toLowerCase()] = q.id;
          queueMap[q.bot_name.toLowerCase()] = q.id;
        });
        this.logger.log(`[engine] Queue transfer enabled via function calling: ${filtered.map((q: any) => q.bot_name).join(', ')}`);
      } else {
        this.logger.log(`[engine] No transfer destinations available for this bot`);
      }
    } catch (e: any) {
      this.logger.error(`[engine] Failed to load transfer queues: ${e.message}`);
    }

    // 6c. Load pipeline stages, existing open deals, tenant tags, and Stripe Connect status
    let stageNames: string[] = [];
    let stageMap: Record<string, string> = {}; // name.lower → id
    let existingDeals: any[] = [];
    let tagNames: string[] = [];
    let tagMap: Record<string, string> = {}; // name.lower → id
    let stripeConnectEnabled = false;
    try {
      const [connectRow] = await this.db.query(
        `SELECT charges_enabled FROM payment_accounts WHERE tenant_id=$1 AND provider='stripe'`,
        [tenantId],
      ).catch(() => []);
      stripeConnectEnabled = !!(connectRow?.charges_enabled);
    } catch {}
    try {
      const stages = await this.db.query(
        `SELECT ps.id, ps.name FROM pipeline_stages ps
         JOIN pipelines p ON p.id = ps.pipeline_id
         WHERE p.tenant_id = $1
         ORDER BY ps.position`,
        [tenantId],
      ).catch(() => []);
      stageNames = stages.map((s: any) => s.name);
      stages.forEach((s: any) => { stageMap[s.name.toLowerCase()] = s.id; });
      if (conv.contact_id) {
        existingDeals = await this.db.query(
          `SELECT d.id, d.title, d.value, d.currency, ps.name AS stage_name
           FROM deals d
           LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
           WHERE d.contact_id = $1 AND d.status = 'open'
           ORDER BY d.created_at DESC LIMIT 5`,
          [conv.contact_id],
        ).catch(() => []);
      }
      const tags = await this.db.query(
        `SELECT id, name FROM tags WHERE tenant_id=$1 ORDER BY name`,
        [tenantId],
      ).catch(() => []);
      tagNames = tags.map((t: any) => t.name);
      tags.forEach((t: any) => { tagMap[t.name.toLowerCase()] = t.id; });
    } catch {}

    // 7. Build message history — only include messages from AFTER this bot's session
    // started so that messages from a previous bot don't bleed into this bot's context.
    const memoryConvs = Math.min(parseInt(bot.memory_conversations ?? '5', 10) || 0, 50);
    const msgPerConv  = 20;

    // When a session was recreated (e.g. after a reconnect or queue-return), use the
    // previous session's start time so the bot retains context from before the break.
    // For truly first-contact sessions there is no prior session, so session.created_at is correct.
    const historyStart = (!sessionIsNew && prevSessionCreatedAt) ? prevSessionCreatedAt : session.created_at;
    const currentHistory = await this.db.query(
      `SELECT body, direction, sender_type, content_type
       FROM messages
       WHERE conversation_id=$1 AND is_private=false
         AND created_at >= $2
       ORDER BY created_at DESC LIMIT ${msgPerConv}`,
      [conversationId, historyStart],
    );
    currentHistory.reverse();

    let priorHistory: any[] = [];
    if (memoryConvs > 0 && conv.contact_id) {
      const priorConvs = await this.db.query(
        `SELECT id FROM conversations
         WHERE contact_id=$1 AND tenant_id=$2 AND id!=$3 AND status='resolved'
         ORDER BY updated_at DESC LIMIT $4`,
        [conv.contact_id, tenantId, conversationId, memoryConvs],
      );
      if (priorConvs.length > 0) {
        const ids = priorConvs.map((c: any) => c.id);
        const rows = await this.db.query(
          `SELECT m.body, m.direction, m.sender_type, m.content_type
           FROM messages m
           WHERE m.conversation_id = ANY($1::uuid[]) AND m.is_private=false
           ORDER BY m.created_at ASC`,
          [ids],
        ).catch(() => []);
        priorHistory = rows;
      }
    }

    const history = [...priorHistory, ...currentHistory];

    // 8. Pre-process inbound media (transcription / vision)
    this.logger.log(`[engine] msg body="${inboundMsg.body?.slice(0,60)}" content_type="${inboundMsg.content_type}"`);
    const media = await this.preprocessMedia(
      apiKey, bot.provider, tenantRow?.settings?.aiKeys ?? {},
      inboundMsg.body ?? '', inboundMsg.content_type ?? 'text',
    );
    this.logger.log(`[engine] preprocessMedia result text="${media.text?.slice(0,80)}" hasImage=${!!media.imageBase64}`);

    // 9. If media couldn't be processed (e.g. audio transcription failed), reply with
    // the bot's fallback_message instead of sending garbage text to the AI.
    if (media.unprocessable) {
      const fallback = bot.fallback_message || 'Lo siento, no pude procesar ese mensaje. ¿Puedes enviarlo como texto?';
      await this.saveBotMessage(tenantId, conversationId, fallback);
      return;
    }

    // 9b. RAG: search knowledge base for relevant context
    const ragContext = await this.kbSvc.searchRelevantContext(bot.id, tenantId, userText).catch(() => '');

    // 9c. Call AI — pass queueMap + stages + deals + tags + stripeConnect so each provider can use function/tool calling
    const dentallyConnected = await this.integrations.isConnected(tenantId, 'dentally').catch(() => false);
    const result = await this.callAi(bot, apiKey, history, media, queueMap, stageNames, stageMap, existingDeals, tagNames, tagMap, ragContext, stripeConnectEnabled, dentallyConnected);
    if (!result) {
      this.logger.warn(`[engine] AI returned null for conv ${conversationId} (bot "${bot.name}", provider "${bot.provider}") — sending fallback`);
      await this.saveBotMessage(tenantId, conversationId,
        bot.fallback_message || 'Lo siento, estoy teniendo dificultades técnicas. Por favor intenta de nuevo en un momento.');
      return;
    }

    let { reply, transferTo, resolveConversation, setWaiting, createDeal, updateDeal, addTag, removeTag, createTask, createPaymentLink } = result;
    this.logger.log(`[engine] AI reply (first 120): "${reply?.slice(0, 120)}" transferTo="${transferTo ?? 'none'}" resolve=${!!resolveConversation} wait=${!!setWaiting} createDeal=${!!createDeal} updateDeal=${!!updateDeal} addTag=${addTag?.tagName ?? 'none'} removeTag=${removeTag?.tagName ?? 'none'} createTask=${createTask?.title ?? 'none'}`);

    // Dentally actions: execute and send the authoritative reply our code composes
    // (real slots / booking result / error), then stop. Scoped to this tenant.
    const { dentallyListPractitioners, dentallyCheckAvailability, dentallyBook } = result;
    if (dentallyListPractitioners || dentallyCheckAvailability || dentallyBook) {
      await this.db.query(`UPDATE ai_chatbot_sessions SET message_count=message_count+1 WHERE id=$1`, [session.id]).catch(() => {});
      let outMsg = '';
      try {
        if (dentallyListPractitioners) {
          outMsg = await this.integrations.botListPractitioners(tenantId, 'dentally');
        } else if (dentallyCheckAvailability) {
          outMsg = await this.integrations.botCheckAvailability(tenantId, 'dentally', dentallyCheckAvailability);
        } else if (dentallyBook) {
          outMsg = await this.integrations.botBook(tenantId, 'dentally', { contactId: conv.contact_id, ...dentallyBook });
        }
      } catch (e: any) {
        outMsg = `No pude completar la acción ahora mismo: ${e?.message || 'error'}.`;
      }
      if (reply && reply.trim()) await this.saveBotMessage(tenantId, conversationId, reply);
      if (outMsg) await this.saveBotMessage(tenantId, conversationId, outMsg);
      await this.saveActivityMessage(tenantId, conversationId, '🤖 Bot usó Dentally').catch(() => {});
      return;
    }

    // If a CRM action was requested but the AI returned no message, use a generic confirmation
    // so the bot doesn't go silent after silently running a tool.
    const hasCrmAction = !!(createDeal || updateDeal || addTag || removeTag || createTask || resolveConversation || setWaiting);
    if (!reply && hasCrmAction && !transferTo) {
      reply = bot.language?.startsWith('es') !== false
        ? '¡Listo, lo he registrado!'
        : 'Done, all set!';
    }

    // Suppress reply when transferring — dest bot's welcome_message handles the greeting
    if (reply && !transferTo) {
      await this.saveBotMessage(tenantId, conversationId, reply);
    }
    await this.db.query(
      `UPDATE ai_chatbot_sessions SET message_count=message_count+1 WHERE id=$1`, [session.id]);

    // 10b. Handle resolve / set_waiting actions
    if (resolveConversation) {
      await this.db.query(
        `UPDATE conversations SET status='resolved', queue_id=NULL, updated_at=NOW() WHERE id=$1`,
        [conversationId],
      ).catch(() => {});
      await this.db.query(`UPDATE ai_chatbot_sessions SET status='ended', ended_at=NOW() WHERE id=$1`, [session.id]).catch(() => {});
      this.logger.log(`[engine] Conversation ${conversationId} resolved by bot`);
      await this.saveActivityMessage(tenantId, conversationId, '🤖 Bot resolvió la conversación');
    } else if (setWaiting) {
      await this.db.query(
        `UPDATE conversations SET assigned_user_id=NULL, queue_id=NULL, updated_at=NOW() WHERE id=$1`,
        [conversationId],
      ).catch(() => {});
      await this.db.query(`UPDATE ai_chatbot_sessions SET status='ended', ended_at=NOW() WHERE id=$1`, [session.id]).catch(() => {});
      this.logger.log(`[engine] Conversation ${conversationId} set to waiting by bot`);
      await this.saveActivityMessage(tenantId, conversationId, '🤖 Bot pasó la conversación a espera');
    }

    // 10c. Handle deal creation / update
    if (createDeal && conv.contact_id) {
      const { title, value, currency, stageName, notes } = createDeal;
      const stageId = stageName ? (stageMap[stageName.toLowerCase()] ?? null) : null;
      await this.db.query(
        `INSERT INTO deals (tenant_id, contact_id, title, value, currency, stage_id, notes, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'open',NOW(),NOW())`,
        [tenantId, conv.contact_id, title, value ?? 0, currency ?? 'USD', stageId, notes ?? null],
      ).catch((e: any) => this.logger.warn(`[engine] create_deal failed: ${e.message}`));
      this.logger.log(`[engine] Deal created: "${title}" stage="${stageName}"`);
      const dealLabel = value ? `${title} · ${value} ${currency ?? 'USD'}` : title;
      await this.saveActivityMessage(tenantId, conversationId, `🤖 Bot creó un deal: ${dealLabel}`);
    }
    if (updateDeal) {
      const { dealId, stageName, value, notes, status } = updateDeal;
      const sets: string[] = [];
      const params: any[] = [];
      if (stageName) {
        const sid = stageMap[stageName.toLowerCase()];
        if (sid) { sets.push(`stage_id=$${params.length+1}`); params.push(sid); }
      }
      if (value !== undefined) { sets.push(`value=$${params.length+1}`); params.push(value); }
      if (notes)  { sets.push(`notes=$${params.length+1}`); params.push(notes); }
      if (status) { sets.push(`status=$${params.length+1}`); params.push(status); }
      if (sets.length) {
        params.push(dealId);
        await this.db.query(
          `UPDATE deals SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length}`,
          params,
        ).catch((e: any) => this.logger.warn(`[engine] update_deal failed: ${e.message}`));
        this.logger.log(`[engine] Deal ${dealId} updated`);
        const parts: string[] = [];
        if (stageName) parts.push(`etapa: ${stageName}`);
        if (value !== undefined) parts.push(`valor: ${value}`);
        if (status) parts.push(`estado: ${status}`);
        await this.saveActivityMessage(tenantId, conversationId, `🤖 Bot actualizó deal${parts.length ? ` (${parts.join(', ')})` : ''}`);
      }
    }

    // 10d. Handle tag add / remove
    if (addTag) {
      const tagId = tagMap[addTag.tagName.toLowerCase()];
      if (tagId) {
        if (conv.contact_id) {
          await this.db.query(
            `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [conv.contact_id, tagId],
          ).catch(() => {});
        }
        await this.db.query(
          `INSERT INTO conversation_tags (conversation_id, tag_id, tenant_id, created_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT DO NOTHING`,
          [conversationId, tagId, tenantId],
        ).catch(() => {});
        this.logger.log(`[engine] Tag "${addTag.tagName}" added to contact ${conv.contact_id} and conv ${conversationId}`);
        await this.saveActivityMessage(tenantId, conversationId, `🤖 Bot añadió etiqueta: ${addTag.tagName}`);
      } else {
        this.logger.warn(`[engine] add_tag: unknown tag "${addTag.tagName}"`);
      }
    }
    if (removeTag) {
      const tagId = tagMap[removeTag.tagName.toLowerCase()];
      if (tagId) {
        if (conv.contact_id) {
          await this.db.query(
            `DELETE FROM contact_tags WHERE contact_id=$1 AND tag_id=$2`,
            [conv.contact_id, tagId],
          ).catch(() => {});
        }
        await this.db.query(
          `DELETE FROM conversation_tags WHERE conversation_id=$1 AND tag_id=$2`,
          [conversationId, tagId],
        ).catch(() => {});
        this.logger.log(`[engine] Tag "${removeTag.tagName}" removed from contact ${conv.contact_id} and conv ${conversationId}`);
        await this.saveActivityMessage(tenantId, conversationId, `🤖 Bot eliminó etiqueta: ${removeTag.tagName}`);
      } else {
        this.logger.warn(`[engine] remove_tag: unknown tag "${removeTag.tagName}"`);
      }
    }

    // 10e. Handle task creation
    if (createTask) {
      await this.db.query(
        `INSERT INTO tasks (tenant_id, contact_id, title, description, due_date, priority, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::timestamptz,$6,'pending',NOW(),NOW())`,
        [tenantId, conv.contact_id ?? null, createTask.title, createTask.description ?? null, createTask.dueDate ?? null, createTask.priority ?? 'medium'],
      ).catch((e: any) => this.logger.warn(`[engine] create_task failed: ${e.message}`));
      this.logger.log(`[engine] Task created: "${createTask.title}" due=${createTask.dueDate ?? 'none'}`);
      const taskLabel = createTask.dueDate
        ? `${createTask.title} · vence ${new Date(createTask.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`
        : createTask.title;
      await this.saveActivityMessage(tenantId, conversationId, `🤖 Bot creó tarea: ${taskLabel}`);
    }

    // 10f. Handle payment link creation
    if (createPaymentLink && stripeConnectEnabled) {
      const { amount, currency, description } = createPaymentLink;
      const clampedAmount = Math.max(1, Math.min(10000, amount ?? 0));
      if (clampedAmount < 1) {
        await this.saveBotMessage(tenantId, conversationId, 'El monto mínimo para generar un link de pago es $1.');
      } else {
        try {
          const { url } = await this.billing.createConnectPaymentLink(tenantId, {
            amount: clampedAmount,
            currency: (currency || 'USD').toUpperCase(),
            description: description || 'Pago',
          });
          await this.saveBotMessage(tenantId, conversationId, `💳 ${url}`);
          await this.saveActivityMessage(tenantId, conversationId,
            `🤖 Bot generó link de pago: ${clampedAmount} ${currency || 'USD'}`);
          this.logger.log(`[engine] Payment link generated for conv ${conversationId}: ${clampedAmount} ${currency}`);
        } catch (e: any) {
          this.logger.warn(`[engine] create_payment_link failed: ${e.message}`);
          await this.saveBotMessage(tenantId, conversationId,
            'Lo siento, no pude generar el link de pago en este momento. Por favor contacta a un agente.');
        }
      }
    }

    // 11. Execute transfer if the AI requested one via function call
    if (transferTo) {
      const targetQueueId = queueMap[transferTo.toLowerCase().trim()];
      if (targetQueueId) {
        await this.db.query(
          `UPDATE conversations SET queue_id = $1, updated_at = NOW() WHERE id = $2`,
          [targetQueueId, conversationId],
        );
        await this.db.query(
          `UPDATE ai_chatbot_sessions SET status='ended', ended_at=NOW() WHERE id=$1`,
          [session.id],
        );
        this.logger.log(`[engine] Transferred conv ${conversationId} to "${transferTo}" (${targetQueueId})`);
        await this.saveActivityMessage(tenantId, conversationId, `🤖 Bot transfirió a: ${transferTo}`);

        const [destBot] = await this.db.query(
          `SELECT * FROM ai_chatbots WHERE tenant_id=$1 AND status='active' AND $2::uuid = ANY(queue_ids) LIMIT 1`,
          [tenantId, targetQueueId],
        ).catch(() => []);

        if (destBot) {
          const [newSession] = await this.db.query(
            `INSERT INTO ai_chatbot_sessions (tenant_id, chatbot_id, conversation_id, contact_id, status)
             VALUES ($1,$2,$3,$4,'active') RETURNING *`,
            [tenantId, destBot.id, conversationId, conv.contact_id],
          );
          await this.db.query(`UPDATE ai_chatbots SET total_conversations=total_conversations+1 WHERE id=$1`, [destBot.id]);

          if (destBot.welcome_message) {
            // Static welcome message configured — send it
            await this.saveBotMessage(tenantId, conversationId, destBot.welcome_message);
            await this.db.query(`UPDATE ai_chatbot_sessions SET message_count=message_count+1 WHERE id=$1`, [newSession.id]);
            this.logger.log(`[engine] Dest bot "${destBot.name}" sent welcome_message`);
          } else {
            // No welcome message — trigger destBot's AI immediately with full conversation history
            // so it generates a contextual opening (e.g. "Vi que quieres hacer una reserva, ¿para qué fecha?")
            this.logger.log(`[engine] Dest bot "${destBot.name}" has no welcome_message — triggering AI for contextual opener`);
            try {
              const destApiKey = tenantRow?.settings?.aiKeys?.[destBot.provider];
              if (destApiKey) {
                // Load full updated history (includes the transfer message just saved)
                const updatedHistory = await this.db.query(
                  `SELECT body, direction, sender_type, content_type
                   FROM messages WHERE conversation_id=$1 AND is_private=false
                   ORDER BY created_at DESC LIMIT 20`,
                  [conversationId],
                );
                updatedHistory.reverse();
                // Use the last inbound message as the trigger so the destBot responds to what the user actually said
              const inboundOnly = updatedHistory.filter((m: any) => m.direction === 'inbound');
              const lastUserMsg = inboundOnly[inboundOnly.length - 1];
              const triggerText = lastUserMsg?.body ?? '';
              // pass only inbound messages so bot B doesn't inherit bot A's persona
              const destResult = await this.callAi(destBot, destApiKey, inboundOnly, { text: triggerText });
                if (destResult?.reply) {
                  await this.saveBotMessage(tenantId, conversationId, destResult.reply);
                  await this.db.query(`UPDATE ai_chatbot_sessions SET message_count=message_count+1 WHERE id=$1`, [newSession.id]);
                }
              }
            } catch (e: any) {
              this.logger.warn(`[engine] Dest bot AI opener failed: ${e.message}`);
            }
          }
          this.logger.log(`[engine] Destination bot "${destBot.name}" active for conv ${conversationId}`);
        }
      } else {
        this.logger.warn(`[engine] Unknown transfer destination: "${transferTo}"`);
      }
    }
  }

  // ── Media pre-processing ──────────────────────────────────────────────────────

  /**
   * Pre-processes an inbound message:
   * - audio  → transcribe with Whisper (OpenAI) if key available, else description
   * - image  → read file as base64 for vision models
   * - others → pass body as-is
   */
  private async preprocessMedia(
    apiKey: string,
    provider: string,
    allApiKeys: Record<string, string>,
    body: string,
    contentType: string,
  ): Promise<MediaResult> {
    // Extract file path from body like "/uploads/file.ogg|originalname"
    const fileUrlPart = body.includes('|') ? body.split('|')[0] : body;
    const isUpload = fileUrlPart.startsWith('/uploads/');
    const filePath = isUpload ? join(process.cwd(), fileUrlPart) : null;

    // ── Audio: transcribe with Whisper ────────────────────────────────────────
    if (contentType === 'audio') {
      const openAiKey = allApiKeys['openai'] ?? (provider === 'openai' ? apiKey : null);
      const fileExists = filePath ? existsSync(filePath) : false;
      this.logger.log(`[audio] openAiKey=${!!openAiKey} filePath=${filePath} exists=${fileExists}`);
      if (!openAiKey) this.logger.warn(`[audio] No OpenAI key available for transcription`);
      if (filePath && !fileExists) this.logger.warn(`[audio] File not found: ${filePath}`);
      if (openAiKey && filePath && fileExists) {
        try {
          const transcription = await this.transcribeAudio(openAiKey, filePath);
          this.logger.log(`[audio] transcription="${transcription}"`);
          if (transcription) {
            // Pass the transcription as the user's plain message. A "[Nota de voz]:"
            // prefix made the model treat it as an unprocessable audio tag and reply
            // "I can't hear voice notes" even with the transcription present.
            return { text: transcription };
          }
        } catch (e: any) {
          this.logger.warn(`[audio] Transcription API failed: ${e.message}`);
        }
      }
      // Gemini can process audio natively
      if (provider === 'gemini' && filePath && fileExists) {
        try {
          const buffer = readFileSync(filePath);
          const base64 = buffer.toString('base64');
          // Detect mime from extension
          const ext = fileUrlPart.split('.').pop()?.toLowerCase() ?? 'ogg';
          const mimeMap: Record<string, string> = {
            ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4',
            wav: 'audio/wav', opus: 'audio/ogg',
          };
          const mimeType = mimeMap[ext] ?? 'audio/ogg';
          return { text: '', imageBase64: base64, imageMimeType: mimeType };
        } catch {}
      }
      return { text: '', unprocessable: true };
    }

    // ── Image: read as base64 ─────────────────────────────────────────────────
    if (contentType === 'image') {
      if (filePath && existsSync(filePath)) {
        try {
          const buffer = readFileSync(filePath);
          const base64 = buffer.toString('base64');
          const ext = fileUrlPart.split('.').pop()?.toLowerCase() ?? 'jpg';
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp',
          };
          const mimeType = mimeMap[ext] ?? 'image/jpeg';
          return { text: '', imageBase64: base64, imageMimeType: mimeType };
        } catch (e: any) {
          this.logger.warn(`Image read failed: ${e.message}`);
        }
      }
      return { text: '[El usuario envió una imagen]' };
    }

    // ── Video / file ──────────────────────────────────────────────────────────
    if (contentType === 'video') return { text: '[El usuario envió un video]' };
    if (contentType === 'file') {
      const origName = body.includes('|') ? body.split('|')[1] : 'archivo';
      return { text: `[El usuario envió un archivo: ${origName}]` };
    }

    // ── Plain text ────────────────────────────────────────────────────────────
    return { text: body };
  }

  /** Transcribe audio file using OpenAI Whisper */
  private async transcribeAudio(apiKey: string, filePath: string): Promise<string> {
    // Use the REAL file extension/mimetype — Whisper detects format by filename,
    // so a hardcoded .ogg breaks now that incoming audio is transcoded to mp3.
    const ext = (filePath.split('.').pop() ?? 'ogg').toLowerCase();
    const mimeMap: Record<string, string> = {
      ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
      wav: 'audio/wav', webm: 'audio/webm', aac: 'audio/aac',
    };
    const mime = mimeMap[ext] ?? 'audio/mpeg';
    const form = new FormData();
    form.append('file', readFileSync(filePath), { filename: `audio.${ext}`, contentType: mime });
    form.append('model', 'whisper-1');
    const res = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        timeout: 60000,
      },
    );
    return res.data.text?.trim() ?? '';
  }

  // ── AI provider calls ─────────────────────────────────────────────────────────

  private async callAi(
    bot: any,
    apiKey: string,
    history: Array<{ body: string; direction: string; sender_type: string; content_type?: string }>,
    media: MediaResult,
    queueMap: Record<string, string> = {},
    stageNames: string[] = [],
    stageMap: Record<string, string> = {},
    existingDeals: any[] = [],
    tagNames: string[] = [],
    tagMap: Record<string, string> = {},
    ragContext: string = '',
    stripeConnectEnabled = false,
    dentallyConnected = false,
  ): Promise<AiResult | null> {
    try {
      const maxTokens   = parseInt(bot.max_tokens,  10) || 300;
      const temperature = parseFloat(bot.temperature)   || 0.7;
      const transferTargets = [...new Set(Object.keys(queueMap))];

      // Build CRM-tool instructions dynamically based on what tools are available
      const crmLines: string[] = ['HERRAMIENTAS CRM (úsalas de forma silenciosa, sin mencionarlas al usuario):'];
      if (stageNames.length > 0) {
        crmLines.push(`- create_deal: cuando el usuario solicite un servicio, producto o trato NUEVO y distinto a los que ya tiene abiertos. Etapas disponibles: ${stageNames.join(', ')}.`);
      }
      if (existingDeals.length > 0) {
        const dealSummary = existingDeals.map((d: any) => `"${d.title}" (etapa: ${d.stage_name ?? 'sin etapa'})`).join(', ');
        crmLines.push(`- update_deal: para actualizar un trato existente. Tratos abiertos actuales de este contacto: ${dealSummary}. Usa update_deal si el usuario hace seguimiento a uno de estos, y create_deal solo si pide algo completamente nuevo y diferente.`);
      }
      if (tagNames.length > 0)   crmLines.push(`- add_tag: OBLIGATORIO — en cuanto identifiques la intención principal del usuario, aplica la etiqueta más apropiada de esta lista: ${tagNames.join(', ')}. Úsala en la misma respuesta en que queda clara la intención, no esperes al final de la conversación. Si el tema cambia, usa remove_tag para la anterior y add_tag para la nueva.`);
      crmLines.push('- create_task: cuando el usuario pida callback, cotización, recordatorio o cualquier acción de seguimiento.');
      if (stripeConnectEnabled) crmLines.push('- create_payment_link: SOLO cuando el cliente confirme EXPLÍCITAMENTE que quiere pagar y hayas acordado el monto exacto. Siempre pregunta primero "¿Confirmas el pago de $X [moneda]?" antes de llamar esta herramienta. Monto mínimo $1, máximo $10,000.');
      if (transferTargets.length > 0) crmLines.push(`- transfer_conversation: solo cuando el usuario pida explícitamente hablar con otro departamento o cuando claramente necesitas un servicio que no puedes ofrecer. Destinos: ${transferTargets.join(', ')}.`);
      crmLines.push('- resolve_conversation: cuando el caso del usuario haya quedado completamente resuelto.');
      if (dentallyConnected) {
        crmLines.push('- dentally_list_practitioners: para listar los profesionales/doctores disponibles para citas.');
        crmLines.push('- dentally_check_availability: para ver los horarios libres de un día (parámetro date en formato YYYY-MM-DD; opcionalmente practitioner_name). Úsala cuando el cliente quiera saber disponibilidad u horarios.');
        crmLines.push('- dentally_book_appointment: para AGENDAR una cita cuando el cliente ya eligió día y hora (date YYYY-MM-DD, time HH:MM). Si el cliente NO está registrado como paciente, pídele su fecha de nacimiento (date_of_birth, YYYY-MM-DD) y género (gender: male/female) ANTES de agendar.');
      }
      crmLines.push('Siempre incluye un mensaje de confirmación breve y amigable para el usuario al usar cualquier herramienta.');
      const crmInstructions = crmLines.join('\n');

      // If the conversation already has turns, forbid re-greeting (weaker models
      // like gpt-4o-mini otherwise re-introduce themselves every reply).
      const ongoing = (history?.length ?? 0) > 0;
      const noGreet = ongoing
        ? 'CONVERSACIÓN EN CURSO: NO vuelvas a saludar ni a presentarte. No empieces con "Hola"/"Hello" ni repitas tu introducción; responde directamente al mensaje del usuario.'
        : '';

      const systemPrompt = [
        `IDENTIDAD: Tu nombre es "${bot.name}". Cuando alguien pregunte de qué equipo eres o quién eres, responde siempre que eres "${bot.name}".`,
        noGreet,
        bot.system_prompt ?? '',
        crmInstructions,
        ragContext,
      ].filter(Boolean).join('\n\n').trim();

      switch (bot.provider) {
        case 'openai':    return await this.callOpenAi(apiKey, bot.model, systemPrompt, history, media, maxTokens, temperature, transferTargets, stageNames, stageMap, existingDeals, tagNames, stripeConnectEnabled, dentallyConnected);
        case 'anthropic': return await this.callAnthropic(apiKey, bot.model, systemPrompt, history, media, maxTokens, temperature, transferTargets, stageNames, stageMap, existingDeals, tagNames, stripeConnectEnabled, dentallyConnected);
        case 'gemini':    return await this.callGemini(apiKey, bot.model, systemPrompt, history, media, maxTokens, temperature, transferTargets, stageNames, stageMap, existingDeals, tagNames, stripeConnectEnabled, dentallyConnected);
        default:
          this.logger.warn(`Unknown AI provider: ${bot.provider}`);
          return null;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.error?.message ?? err?.message ?? String(err);
      this.logger.error(`AI call failed (${bot.provider} ${status ?? ''}): ${detail}`);
      return bot.fallback_message ? { reply: bot.fallback_message } : null;
    }
  }

  /** Convert history messages to simple { role, content } objects */
  private historyToMsgs(history: Array<{ body: string; direction: string; content_type?: string }>) {
    const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const h of history.slice(0, -1)) {
      // Summarize non-text history items
      let text = h.body ?? '';
      if (['audio', 'image', 'video', 'file'].includes(h.content_type ?? '') || text.startsWith('/uploads/')) {
        const labels: Record<string, string> = { audio: '[Audio]', image: '[Imagen]', video: '[Video]', file: '[Archivo]' };
        text = labels[h.content_type ?? ''] ?? '[Media]';
      }
      if (!text.trim()) continue;
      msgs.push({ role: h.direction === 'inbound' ? 'user' : 'assistant', content: text });
    }
    return msgs;
  }

  private async callOpenAi(
    apiKey: string, model: string, systemPrompt: string | null,
    history: any[], media: MediaResult, maxTokens: number, temperature: number,
    transferTargets: string[] = [], stageNames: string[] = [], _stageMap: Record<string, string> = {}, existingDeals: any[] = [], tagNames: string[] = [], stripeConnectEnabled = false, dentallyConnected = false,
  ): Promise<AiResult> {
    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push(...this.historyToMsgs(history));
    if (media.imageBase64 && media.imageMimeType) {
      messages.push({ role: 'user', content: [...(media.text ? [{ type: 'text', text: media.text }] : []), { type: 'image_url', image_url: { url: `data:${media.imageMimeType};base64,${media.imageBase64}` } }] });
    } else {
      messages.push({ role: 'user', content: media.text });
    }

    const body: any = { model, messages, max_tokens: maxTokens, temperature };
    const tools: any[] = [];

    if (transferTargets.length > 0) {
      tools.push({ type: 'function', function: { name: 'transfer_conversation', description: 'Transfer this conversation to another specialized team or bot. Call this ONLY when the user explicitly requests transfer or clearly needs a service you cannot handle. The "message" field is a short friendly message sent DIRECTLY TO THE CUSTOMER (e.g. "Un momento, te conecto con el equipo de reservas ✓"). NEVER write internal phrases like "el cliente ha pedido ser transferido" — always address the customer directly in second person.', parameters: { type: 'object', properties: { destination: { type: 'string', enum: transferTargets, description: 'The destination team/bot name' }, message: { type: 'string', description: 'Short friendly message TO THE CUSTOMER confirming the transfer (e.g. "Un momento, te conecto con el equipo de reservas ✓"). Write directly to the customer, never use internal language.' } }, required: ['destination', 'message'] } } });
    }
    tools.push({ type: 'function', function: { name: 'resolve_conversation', description: "Mark this conversation as resolved when the customer's request has been fully addressed.", parameters: { type: 'object', properties: { message: { type: 'string', description: 'Final message to the customer before closing' } }, required: ['message'] } } });
    tools.push({ type: 'function', function: { name: 'set_waiting', description: 'Put conversation on hold when more information is needed or you cannot proceed right now.', parameters: { type: 'object', properties: { message: { type: 'string', description: 'Message explaining the wait' } }, required: ['message'] } } });
    if (stageNames.length > 0) {
      tools.push({ type: 'function', function: { name: 'create_deal', description: 'Create a new deal/booking in the CRM for this customer. Use only when the customer requests a NEW service or product distinct from existing open deals.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Deal title (e.g. "Envío LDN→SDQ - Taylor Cabrera")' }, value: { type: 'number', description: 'Deal value' }, currency: { type: 'string', description: 'Currency (USD/GBP/EUR)', default: 'USD' }, stage_name: { type: 'string', enum: stageNames, description: 'Pipeline stage' }, notes: { type: 'string', description: 'Additional notes' }, message: { type: 'string', description: 'Confirmation message to customer' } }, required: ['title', 'stage_name', 'message'] } } });
      if (existingDeals.length > 0) {
        const dealIds = existingDeals.map((d: any) => d.id);
        tools.push({ type: 'function', function: { name: 'update_deal', description: `Update an existing open deal. Use this when the customer is following up on an existing deal. Open deals: ${existingDeals.map((d: any) => `"${d.title}"(id:${d.id},stage:${d.stage_name ?? 'none'})`).join(', ')}`, parameters: { type: 'object', properties: { deal_id: { type: 'string', enum: dealIds, description: 'Deal ID to update' }, stage_name: { type: 'string', enum: stageNames, description: 'New stage' }, value: { type: 'number', description: 'New value' }, notes: { type: 'string', description: 'Updated notes' }, status: { type: 'string', enum: ['open', 'won', 'lost'], description: 'Deal status' }, message: { type: 'string', description: 'Message to customer' } }, required: ['deal_id', 'message'] } } });
      }
    }
    if (tagNames.length > 0) {
      tools.push({ type: 'function', function: { name: 'add_tag', description: 'Add a tag/label to this contact and conversation. Use when the conversation reveals information that should classify this contact (e.g. "Interesado", "VIP", "Reclamación").', parameters: { type: 'object', properties: { tag_name: { type: 'string', enum: tagNames, description: 'Tag to add' }, message: { type: 'string', description: 'Optional short message to the customer (leave empty string if no message needed)' } }, required: ['tag_name', 'message'] } } });
      tools.push({ type: 'function', function: { name: 'remove_tag', description: 'Remove a tag/label from this contact and conversation.', parameters: { type: 'object', properties: { tag_name: { type: 'string', enum: tagNames, description: 'Tag to remove' }, message: { type: 'string', description: 'Optional short message to the customer (leave empty string if no message needed)' } }, required: ['tag_name', 'message'] } } });
    }
    tools.push({ type: 'function', function: { name: 'create_task', description: 'Create a follow-up task linked to this contact. Use when the customer requests a callback, a quote, or any pending action that must be tracked.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Short task title (e.g. "Llamar a María el lunes", "Enviar cotización")' }, description: { type: 'string', description: 'Additional details (optional)' }, due_date: { type: 'string', description: 'ISO 8601 date string for the deadline (optional, e.g. "2026-05-01")' }, priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority (default: medium)' }, message: { type: 'string', description: 'Confirmation message to the customer' } }, required: ['title', 'message'] } } });
    if (stripeConnectEnabled) {
      tools.push({ type: 'function', function: { name: 'create_payment_link', description: 'Generate a Stripe payment link to send to the customer. RULES: 1) ONLY call after the customer explicitly confirms they want to pay AND you have confirmed the exact amount. 2) Always ask "¿Confirmas el pago de $X [currency]?" BEFORE calling this. 3) Amount: min $1, max $10,000. 4) The link will be sent automatically after generation.', parameters: { type: 'object', properties: { amount: { type: 'number', description: 'Amount to charge (e.g. 150.00). Must be between 1 and 10000.' }, currency: { type: 'string', description: 'Currency code: USD, EUR, GBP, MXN, etc.', default: 'USD' }, description: { type: 'string', description: 'Description visible to the customer on the payment page (e.g. "Consulta médica - 1 hora")' }, message: { type: 'string', description: 'Message to send to the customer confirming the payment link is being sent' } }, required: ['amount', 'currency', 'description', 'message'] } } });
    }
    if (dentallyConnected) {
      tools.push({ type: 'function', function: { name: 'dentally_list_practitioners', description: 'List the clinic professionals/doctors available for appointments.', parameters: { type: 'object', properties: { message: { type: 'string', description: 'Optional short message to the customer' } } } } });
      tools.push({ type: 'function', function: { name: 'dentally_check_availability', description: 'Check open appointment slots for a given day. Use when the customer asks about availability or times.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'Day to check, format YYYY-MM-DD' }, practitioner_name: { type: 'string', description: 'Optional professional name' }, duration: { type: 'number', description: 'Minutes (default 30)' } }, required: ['date'] } } });
      tools.push({ type: 'function', function: { name: 'dentally_book_appointment', description: 'Book an appointment once the customer has chosen a day and time. If the customer is NOT a registered patient, first ask for date_of_birth (YYYY-MM-DD) and gender (male/female), then call this.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM (24h), must be one of the available slots' }, practitioner_name: { type: 'string' }, duration: { type: 'number' }, reason: { type: 'string' }, date_of_birth: { type: 'string', description: 'Patient DOB YYYY-MM-DD (only if a new patient)' }, gender: { type: 'string', enum: ['male', 'female'] }, title: { type: 'string', description: 'Mr/Mrs/Ms/Dr (only if a new patient)' } }, required: ['date', 'time'] } } });
    }
    body.tools = tools;
    body.tool_choice = 'auto';

    const res = await axios.post('https://api.openai.com/v1/chat/completions', body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
    const choice = res.data.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (toolCall) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        switch (toolCall.function.name) {
          case 'transfer_conversation': return { reply: args.message ?? '', transferTo: args.destination };
          case 'resolve_conversation':  return { reply: args.message ?? '', resolveConversation: true };
          case 'set_waiting':           return { reply: args.message ?? '', setWaiting: true };
          case 'create_deal':           return { reply: args.message ?? '', createDeal: { title: args.title, value: args.value, currency: args.currency, stageName: args.stage_name, notes: args.notes } };
          case 'update_deal':           return { reply: args.message ?? '', updateDeal: { dealId: args.deal_id, stageName: args.stage_name, value: args.value, notes: args.notes, status: args.status } };
          case 'add_tag':               return { reply: args.message ?? '', addTag: { tagName: args.tag_name } };
          case 'remove_tag':            return { reply: args.message ?? '', removeTag: { tagName: args.tag_name } };
          case 'create_task':           return { reply: args.message ?? '', createTask: { title: args.title, description: args.description, dueDate: args.due_date, priority: args.priority } };
          case 'create_payment_link':   return { reply: args.message ?? '', createPaymentLink: { amount: args.amount, currency: args.currency ?? 'USD', description: args.description } };
          case 'dentally_list_practitioners': return { reply: args.message ?? '', dentallyListPractitioners: true };
          case 'dentally_check_availability': return { reply: args.message ?? '', dentallyCheckAvailability: { date: args.date, practitionerName: args.practitioner_name, durationMinutes: args.duration } };
          case 'dentally_book_appointment':   return { reply: args.message ?? '', dentallyBook: { date: args.date, time: args.time, practitionerName: args.practitioner_name, durationMinutes: args.duration, reason: args.reason, dateOfBirth: args.date_of_birth, gender: args.gender, title: args.title } };
        }
      } catch { /* fall through */ }
    }
    return { reply: choice?.message?.content?.trim() ?? '' };
  }

  private async callAnthropic(
    apiKey: string, model: string, systemPrompt: string | null,
    history: any[], media: MediaResult, maxTokens: number, temperature: number,
    transferTargets: string[] = [], stageNames: string[] = [], _stageMap: Record<string, string> = {}, existingDeals: any[] = [], tagNames: string[] = [], stripeConnectEnabled = false, dentallyConnected = false,
  ): Promise<AiResult> {
    const chatMsgs: any[] = [...this.historyToMsgs(history)];
    if (media.imageBase64 && media.imageMimeType) {
      chatMsgs.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media.imageMimeType, data: media.imageBase64 } }, ...(media.text ? [{ type: 'text', text: media.text }] : [{ type: 'text', text: 'Describe esta imagen.' }])] });
    } else {
      chatMsgs.push({ role: 'user', content: media.text });
    }
    const body: any = { model, messages: chatMsgs, max_tokens: maxTokens, temperature };
    if (systemPrompt) body.system = systemPrompt;

    const tools: any[] = [];
    if (transferTargets.length > 0) tools.push({ name: 'transfer_conversation', description: 'Transfer this conversation to another specialized team or bot. Call this ONLY when the user explicitly requests transfer or clearly needs a service you cannot handle. The "message" field is a short friendly message sent DIRECTLY TO THE CUSTOMER (e.g. "Un momento, te conecto con el equipo de reservas ✓"). NEVER write internal phrases like "el cliente ha pedido ser transferido" — always address the customer directly.', input_schema: { type: 'object', properties: { destination: { type: 'string', enum: transferTargets }, message: { type: 'string', description: 'Short friendly message TO THE CUSTOMER confirming the transfer. Write directly to the customer, never use internal language.' } }, required: ['destination', 'message'] } });
    tools.push({ name: 'resolve_conversation', description: "Mark conversation as resolved.", input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } });
    tools.push({ name: 'set_waiting', description: 'Put conversation on hold.', input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } });
    if (stageNames.length > 0) {
      tools.push({ name: 'create_deal', description: 'Create a new deal in the CRM. Use only when the customer requests a NEW service or product distinct from existing open deals.', input_schema: { type: 'object', properties: { title: { type: 'string' }, value: { type: 'number' }, currency: { type: 'string' }, stage_name: { type: 'string', enum: stageNames }, notes: { type: 'string' }, message: { type: 'string' } }, required: ['title', 'stage_name', 'message'] } });
      if (existingDeals.length > 0) {
        tools.push({ name: 'update_deal', description: `Update an existing open deal. Use when the customer follows up on an existing deal. Open deals: ${existingDeals.map((d: any) => `"${d.title}"(id:${d.id})`).join(', ')}`, input_schema: { type: 'object', properties: { deal_id: { type: 'string', enum: existingDeals.map((d: any) => d.id) }, stage_name: { type: 'string', enum: stageNames }, value: { type: 'number' }, notes: { type: 'string' }, status: { type: 'string', enum: ['open','won','lost'] }, message: { type: 'string' } }, required: ['deal_id', 'message'] } });
      }
    }
    if (tagNames.length > 0) {
      tools.push({ name: 'add_tag', description: 'Add a tag/label to this contact and conversation. Use when the conversation reveals information that should classify this contact (e.g. "Interesado", "VIP", "Reclamación").', input_schema: { type: 'object', properties: { tag_name: { type: 'string', enum: tagNames }, message: { type: 'string', description: 'Optional message to the customer (empty string if not needed)' } }, required: ['tag_name', 'message'] } });
      tools.push({ name: 'remove_tag', description: 'Remove a tag/label from this contact and conversation.', input_schema: { type: 'object', properties: { tag_name: { type: 'string', enum: tagNames }, message: { type: 'string', description: 'Optional message to the customer (empty string if not needed)' } }, required: ['tag_name', 'message'] } });
    }
    tools.push({ name: 'create_task', description: 'Create a follow-up task linked to this contact. Use when the customer requests a callback, a quote, or any pending action that must be tracked.', input_schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, due_date: { type: 'string', description: 'ISO 8601 date (optional)' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, message: { type: 'string' } }, required: ['title', 'message'] } });
    if (stripeConnectEnabled) {
      tools.push({ name: 'create_payment_link', description: 'Generate a Stripe payment link to send to the customer. RULES: 1) ONLY call after the customer explicitly confirms they want to pay AND you confirmed the exact amount. 2) Always ask "¿Confirmas el pago de $X [currency]?" BEFORE calling. 3) Amount: min $1, max $10,000.', input_schema: { type: 'object', properties: { amount: { type: 'number', description: 'Amount to charge. Must be between 1 and 10000.' }, currency: { type: 'string', description: 'Currency code: USD, EUR, GBP, MXN, etc.' }, description: { type: 'string', description: 'Description visible to the customer on the payment page' }, message: { type: 'string', description: 'Message to send to the customer' } }, required: ['amount', 'currency', 'description', 'message'] } });
    if (dentallyConnected) {
      tools.push({ name: 'dentally_list_practitioners', description: 'List the clinic professionals/doctors available for appointments.', input_schema: { type: 'object', properties: { message: { type: 'string' } } } });
      tools.push({ name: 'dentally_check_availability', description: 'Check open appointment slots for a given day. Use when the customer asks about availability or times.', input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, practitioner_name: { type: 'string' }, duration: { type: 'number' } }, required: ['date'] } });
      tools.push({ name: 'dentally_book_appointment', description: 'Book an appointment once the customer chose a day and time. If the customer is NOT a registered patient, first ask for date_of_birth (YYYY-MM-DD) and gender (male/female), then call this.', input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM (24h)' }, practitioner_name: { type: 'string' }, duration: { type: 'number' }, reason: { type: 'string' }, date_of_birth: { type: 'string' }, gender: { type: 'string', enum: ['male', 'female'] }, title: { type: 'string' } }, required: ['date', 'time'] } });
    }
    }
    body.tools = tools;

    const res = await axios.post('https://api.anthropic.com/v1/messages', body, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 30000 });
    for (const block of res.data.content ?? []) {
      if (block.type === 'tool_use') {
        const i = block.input ?? {};
        switch (block.name) {
          case 'transfer_conversation': return { reply: i.message ?? '', transferTo: i.destination };
          case 'resolve_conversation':  return { reply: i.message ?? '', resolveConversation: true };
          case 'set_waiting':           return { reply: i.message ?? '', setWaiting: true };
          case 'create_deal':           return { reply: i.message ?? '', createDeal: { title: i.title, value: i.value, currency: i.currency, stageName: i.stage_name, notes: i.notes } };
          case 'update_deal':           return { reply: i.message ?? '', updateDeal: { dealId: i.deal_id, stageName: i.stage_name, value: i.value, notes: i.notes, status: i.status } };
          case 'add_tag':               return { reply: i.message ?? '', addTag: { tagName: i.tag_name } };
          case 'remove_tag':            return { reply: i.message ?? '', removeTag: { tagName: i.tag_name } };
          case 'create_task':           return { reply: i.message ?? '', createTask: { title: i.title, description: i.description, dueDate: i.due_date, priority: i.priority } };
          case 'create_payment_link':   return { reply: i.message ?? '', createPaymentLink: { amount: i.amount, currency: i.currency ?? 'USD', description: i.description } };
          case 'dentally_list_practitioners': return { reply: i.message ?? '', dentallyListPractitioners: true };
          case 'dentally_check_availability': return { reply: i.message ?? '', dentallyCheckAvailability: { date: i.date, practitionerName: i.practitioner_name, durationMinutes: i.duration } };
          case 'dentally_book_appointment':   return { reply: i.message ?? '', dentallyBook: { date: i.date, time: i.time, practitionerName: i.practitioner_name, durationMinutes: i.duration, reason: i.reason, dateOfBirth: i.date_of_birth, gender: i.gender, title: i.title } };
        }
      }
    }
    return { reply: res.data.content?.find((b: any) => b.type === 'text')?.text?.trim() ?? '' };
  }

  private async callGemini(
    apiKey: string, model: string, systemPrompt: string | null,
    history: any[], media: MediaResult, maxTokens: number, temperature: number,
    transferTargets: string[] = [], stageNames: string[] = [], _stageMap: Record<string, string> = {}, existingDeals: any[] = [], tagNames: string[] = [], stripeConnectEnabled = false, dentallyConnected = false,
  ): Promise<AiResult> {
    const histMsgs = this.historyToMsgs(history);
    const contents = histMsgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    if (media.imageBase64 && media.imageMimeType) {
      const parts: any[] = [{ inline_data: { mime_type: media.imageMimeType, data: media.imageBase64 } }];
      if (media.text) parts.push({ text: media.text });
      contents.push({ role: 'user', parts });
    } else {
      contents.push({ role: 'user', parts: [{ text: media.text }] });
    }
    const body: any = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature } };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const fnDeclarations: any[] = [];
    if (transferTargets.length > 0) fnDeclarations.push({ name: 'transfer_conversation', description: 'Transfer this conversation to another specialized team or bot. Call this ONLY when the user explicitly requests transfer or clearly needs a service you cannot handle. The "message" field is a short friendly message sent DIRECTLY TO THE CUSTOMER (e.g. "Un momento, te conecto con el equipo de reservas ✓"). NEVER write internal phrases like "el cliente ha pedido ser transferido" — always address the customer directly.', parameters: { type: 'OBJECT', properties: { destination: { type: 'STRING', enum: transferTargets }, message: { type: 'STRING', description: 'Short friendly message TO THE CUSTOMER confirming the transfer. Write directly to the customer, never use internal language.' } }, required: ['destination', 'message'] } });
    fnDeclarations.push({ name: 'resolve_conversation', description: 'Mark conversation as resolved.', parameters: { type: 'OBJECT', properties: { message: { type: 'STRING' } }, required: ['message'] } });
    fnDeclarations.push({ name: 'set_waiting', description: 'Put conversation on hold.', parameters: { type: 'OBJECT', properties: { message: { type: 'STRING' } }, required: ['message'] } });
    if (stageNames.length > 0) {
      fnDeclarations.push({ name: 'create_deal', description: 'Create a new deal/booking. Use only when the customer requests a NEW service or product distinct from existing open deals.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, value: { type: 'NUMBER' }, currency: { type: 'STRING' }, stage_name: { type: 'STRING', enum: stageNames }, notes: { type: 'STRING' }, message: { type: 'STRING' } }, required: ['title', 'stage_name', 'message'] } });
      if (existingDeals.length > 0) {
        fnDeclarations.push({ name: 'update_deal', description: `Update existing deal. Use when the customer follows up on an existing deal. Open deals: ${existingDeals.map((d: any) => `"${d.title}"(id:${d.id})`).join(', ')}`, parameters: { type: 'OBJECT', properties: { deal_id: { type: 'STRING', enum: existingDeals.map((d: any) => d.id) }, stage_name: { type: 'STRING', enum: stageNames }, value: { type: 'NUMBER' }, notes: { type: 'STRING' }, status: { type: 'STRING', enum: ['open','won','lost'] }, message: { type: 'STRING' } }, required: ['deal_id', 'message'] } });
      }
    }
    if (tagNames.length > 0) {
      fnDeclarations.push({ name: 'add_tag', description: 'Add a tag/label to this contact and conversation. Use when the conversation reveals information that should classify this contact (e.g. "Interesado", "VIP", "Reclamación").', parameters: { type: 'OBJECT', properties: { tag_name: { type: 'STRING', enum: tagNames }, message: { type: 'STRING', description: 'Optional message to the customer (empty string if not needed)' } }, required: ['tag_name', 'message'] } });
      fnDeclarations.push({ name: 'remove_tag', description: 'Remove a tag/label from this contact and conversation.', parameters: { type: 'OBJECT', properties: { tag_name: { type: 'STRING', enum: tagNames }, message: { type: 'STRING', description: 'Optional message to the customer (empty string if not needed)' } }, required: ['tag_name', 'message'] } });
    }
    fnDeclarations.push({ name: 'create_task', description: 'Create a follow-up task linked to this contact. Use when the customer requests a callback, a quote, or any pending action that must be tracked.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, description: { type: 'STRING' }, due_date: { type: 'STRING', description: 'ISO 8601 date (optional)' }, priority: { type: 'STRING', enum: ['low', 'medium', 'high'] }, message: { type: 'STRING' } }, required: ['title', 'message'] } });
    if (stripeConnectEnabled) {
      fnDeclarations.push({ name: 'create_payment_link', description: 'Generate a Stripe payment link to send to the customer. RULES: 1) ONLY call after the customer explicitly confirms they want to pay AND you confirmed the exact amount. 2) Always ask "¿Confirmas el pago de $X [currency]?" BEFORE calling. 3) Amount: min $1, max $10,000.', parameters: { type: 'OBJECT', properties: { amount: { type: 'NUMBER', description: 'Amount to charge. Must be between 1 and 10000.' }, currency: { type: 'STRING', description: 'Currency code: USD, EUR, GBP, MXN, etc.' }, description: { type: 'STRING', description: 'Description visible to the customer on the payment page' }, message: { type: 'STRING', description: 'Message to send to the customer' } }, required: ['amount', 'currency', 'description', 'message'] } });
    if (dentallyConnected) {
      fnDeclarations.push({ name: 'dentally_list_practitioners', description: 'List the clinic professionals/doctors available for appointments.', parameters: { type: 'OBJECT', properties: { message: { type: 'STRING' } } } });
      fnDeclarations.push({ name: 'dentally_check_availability', description: 'Check open appointment slots for a given day. Use when the customer asks about availability or times.', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'YYYY-MM-DD' }, practitioner_name: { type: 'STRING' }, duration: { type: 'NUMBER' } }, required: ['date'] } });
      fnDeclarations.push({ name: 'dentally_book_appointment', description: 'Book an appointment once the customer chose a day and time. If the customer is NOT a registered patient, first ask for date_of_birth (YYYY-MM-DD) and gender (male/female), then call this.', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'YYYY-MM-DD' }, time: { type: 'STRING', description: 'HH:MM (24h)' }, practitioner_name: { type: 'STRING' }, duration: { type: 'NUMBER' }, reason: { type: 'STRING' }, date_of_birth: { type: 'STRING' }, gender: { type: 'STRING', enum: ['male', 'female'] }, title: { type: 'STRING' } }, required: ['date', 'time'] } });
    }
    }
    body.tools = [{ functionDeclarations: fnDeclarations }];

    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, body, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    const part = res.data.candidates?.[0]?.content?.parts?.[0];
    if (part?.functionCall) {
      const { name, args } = part.functionCall;
      switch (name) {
        case 'transfer_conversation': return { reply: args?.message ?? '', transferTo: args?.destination };
        case 'resolve_conversation':  return { reply: args?.message ?? '', resolveConversation: true };
        case 'set_waiting':           return { reply: args?.message ?? '', setWaiting: true };
        case 'create_deal':           return { reply: args?.message ?? '', createDeal: { title: args.title, value: args.value, currency: args.currency, stageName: args.stage_name, notes: args.notes } };
        case 'update_deal':           return { reply: args?.message ?? '', updateDeal: { dealId: args.deal_id, stageName: args.stage_name, value: args.value, notes: args.notes, status: args.status } };
        case 'add_tag':               return { reply: args?.message ?? '', addTag: { tagName: args.tag_name } };
        case 'remove_tag':            return { reply: args?.message ?? '', removeTag: { tagName: args.tag_name } };
        case 'create_task':           return { reply: args?.message ?? '', createTask: { title: args.title, description: args.description, dueDate: args.due_date, priority: args.priority } };
        case 'create_payment_link':   return { reply: args?.message ?? '', createPaymentLink: { amount: args?.amount, currency: args?.currency ?? 'USD', description: args?.description } };
        case 'dentally_list_practitioners': return { reply: args?.message ?? '', dentallyListPractitioners: true };
        case 'dentally_check_availability': return { reply: args?.message ?? '', dentallyCheckAvailability: { date: args?.date, practitionerName: args?.practitioner_name, durationMinutes: args?.duration } };
        case 'dentally_book_appointment':   return { reply: args?.message ?? '', dentallyBook: { date: args?.date, time: args?.time, practitionerName: args?.practitioner_name, durationMinutes: args?.duration, reason: args?.reason, dateOfBirth: args?.date_of_birth, gender: args?.gender, title: args?.title } };
      }
    }
    return { reply: part?.text?.trim() ?? '' };
  }

  // ── Test endpoint ─────────────────────────────────────────────────────────────

  async testBotMessage(botId: string, tenantId: string, message: string, history: { role: string; content: string }[] = []): Promise<{ reply: string | null; error?: string }> {
    const [rawBot] = await this.db.query(`SELECT * FROM ai_chatbots WHERE id=$1 AND tenant_id=$2`, [botId, tenantId]);
    if (!rawBot) return { reply: null, error: 'Bot no encontrado' };
    let bot = rawBot;

    const [tenant] = await this.db.query(`SELECT settings FROM tenants WHERE id=$1`, [tenantId]);
    let apiKey = tenant?.settings?.aiKeys?.[bot.provider];
    let effectiveProvider = bot.provider;
    if (!apiKey) {
      const platformAI = await this.platformSettings.getAI();
      if (platformAI.apiKey) {
        apiKey = platformAI.apiKey;
        effectiveProvider = platformAI.provider;
        bot = { ...bot, provider: platformAI.provider as any, model: platformAI.model ?? bot.model };
      }
    }
    if (!apiKey) {
      return { reply: null, error: `No hay API key configurada para "${effectiveProvider}". Configúrala en Configuración → Integraciones de IA o pide al administrador que configure la key de plataforma.` };
    }
    try {
      const mapped = (history ?? [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
        .map((m) => m.role === 'assistant'
          ? { body: m.content, direction: 'outbound', sender_type: 'bot' }
          : { body: m.content, direction: 'inbound', sender_type: 'contact' });
      // Inject knowledge-base context + Dentally tools so the test mirrors production.
      const ragContext = await this.kbSvc.searchRelevantContext(botId, tenantId, message).catch(() => '');
      const dentallyConnected = await this.integrations.isConnected(tenantId, 'dentally').catch(() => false);
      const result = await this.callAi(bot, apiKey, mapped, { text: message }, {}, [], {}, [], [], {}, ragContext, false, dentallyConnected);
      return { reply: result?.reply ?? null };
    } catch (err: any) {
      return { reply: null, error: err?.message ?? 'Error al llamar a la IA' };
    }
  }

  // ── Webchat (synchronous, no queue) ──────────────────────────────────────────

  /**
   * Called by WebchatService to get an AI reply for a webchat message.
   * Does NOT save anything — the caller handles message persistence.
   */
  async generateWebchatReply(
    botId: string,
    tenantId: string,
    conversationId: string,
    userMessage: string,
  ): Promise<string | null> {
    const [rawBot2] = await this.db.query(
      `SELECT * FROM ai_chatbots WHERE id=$1 AND tenant_id=$2 AND status='active'`,
      [botId, tenantId],
    );
    if (!rawBot2) return null;
    let bot = rawBot2;

    const [tenant] = await this.db.query(`SELECT settings FROM tenants WHERE id=$1`, [tenantId]);
    let apiKey = tenant?.settings?.aiKeys?.[bot.provider];
    if (!apiKey) {
      const platformAI = await this.platformSettings.getAI();
      if (platformAI.apiKey) {
        apiKey = platformAI.apiKey;
        bot = { ...bot, provider: platformAI.provider as any, model: platformAI.model ?? bot.model };
      }
    }
    if (!apiKey) return bot.fallback_message ?? null;

    const history = await this.db.query(
      `SELECT body, direction, sender_type, content_type
       FROM messages
       WHERE conversation_id=$1 AND is_private=false
       ORDER BY created_at DESC LIMIT 20`,
      [conversationId],
    );
    history.reverse();

    const ragContext = await this.kbSvc
      .searchRelevantContext(botId, tenantId, userMessage)
      .catch(() => '');

    const result = await this.callAi(
      bot, apiKey, history, { text: userMessage }, {}, [], {}, [], [], {}, ragContext,
    ).catch(() => null);

    return result?.reply ?? bot.fallback_message ?? null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async saveActivityMessage(tenantId: string, conversationId: string, body: string) {
    const [msg] = await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
       VALUES ($1,$2,$3,'activity','outbound','system',false,NOW(),NOW()) RETURNING *`,
      [tenantId, conversationId, body],
    ).catch(() => [null]);
    if (msg) {
      this.notifications.emit({
        tenantId, type: 'message_created',
        payload: { conversationId, message: msg },
      });
    }
  }

  private async saveBotMessage(tenantId: string, conversationId: string, body: string) {
    const [msg] = await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
       VALUES ($1,$2,$3,'text','outbound','bot',false,NOW(),NOW()) RETURNING *`,
      [tenantId, conversationId, body],
    );
    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`, [conversationId]);
    this.notifications.emit({
      tenantId, type: 'message_created',
      payload: { conversationId, message: msg },
    });
    await this.deliverOutbound(conversationId, tenantId, body, msg.id).catch((e) =>
      this.logger.error(`[bot deliverOutbound] ${e.message}`));
  }

  private async deliverOutbound(conversationId: string, tenantId: string, text: string, messageId?: string) {
    if (!text) return;
    const [conv] = await this.db.query(
      `SELECT c.channel_type, c.connection_id, c.external_id, c.subject,
              cc.channel_type AS conn_channel_type, cc.credentials,
              (SELECT email FROM contacts ct WHERE ct.id = c.contact_id) AS contact_email
       FROM conversations c
       LEFT JOIN channel_connections cc ON cc.id = c.connection_id
       WHERE c.id=$1 AND c.tenant_id=$2 LIMIT 1`,
      [conversationId, tenantId],
    );
    if (!conv) return;
    // Prefer the actual connection's channel type — conversation.channel_type may be stale/default
    const channelType = conv.conn_channel_type ?? conv.channel_type;
    switch (channelType) {
      case 'whatsapp_web': {
        if (!conv.external_id || !conv.connection_id) return;
        // Safety: never send an uploaded-file path as text (deliver as media instead).
        if (/^\/uploads\/\S+/.test(text)) {
          const [fileUrl, , cap] = text.split('|');
          const ext = (fileUrl.split('.').pop() ?? '').toLowerCase();
          const ct = /^(jpe?g|png|gif|webp|bmp|heic)$/.test(ext) ? 'image'
            : /^(mp3|ogg|oga|m4a|wav|opus|aac)$/.test(ext) ? 'audio'
            : /^(mp4|mov|avi|webm|3gp)$/.test(ext) ? 'video' : 'file';
          const fid = await this.waSvc.sendFile(conv.connection_id, conv.external_id, fileUrl, ct, cap || undefined);
          if (fid && messageId && typeof fid === 'string') {
            await this.db.query(`UPDATE messages SET external_id=$1 WHERE id=$2`, [fid, messageId]).catch(() => {});
          }
          break;
        }
        const waId = await this.waSvc.sendMessage(conv.connection_id, conv.external_id, text);
        if (!waId) this.logger.warn(`[bot] WA session not connected for ${conversationId}`);
        else if (messageId && typeof waId === 'string') {
          await this.db.query(`UPDATE messages SET external_id=$1 WHERE id=$2`, [waId, messageId]).catch(() => {});
        }
        break;
      }
      case 'telegram': {
        const creds = conv.credentials ?? {};
        if (!conv.external_id || !creds.botToken) return;
        await (globalThis as any).fetch(
          `https://api.telegram.org/bot${creds.botToken}/sendMessage`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: conv.external_id, text }),
            signal: AbortSignal.timeout(8000) },
        ).catch(() => {});
        break;
      }
      case 'whatsapp': {
        const creds = conv.credentials ?? {};
        if (!creds.phoneNumberId || !creds.accessToken || !conv.external_id) return;
        await (globalThis as any).fetch(
          `https://graph.facebook.com/v19.0/${creds.phoneNumberId}/messages`,
          { method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}` },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.external_id, type: 'text', text: { body: text } }),
            signal: AbortSignal.timeout(8000) },
        ).catch(() => {});
        break;
      }
      case 'facebook':
      case 'instagram': {
        const creds = conv.credentials ?? {};
        const recipientId = conv.external_id;
        const token = creds.accessToken;
        if (!recipientId || !token) return;
        await (globalThis as any).fetch(
          `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
          { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
            signal: AbortSignal.timeout(8000) },
        ).catch(() => {});
        break;
      }
      case 'email': {
        const toEmail = conv.external_id || conv.contact_email;
        let creds = conv.credentials ?? {};
        if (!creds.host) {
          const [ec] = await this.db.query(
            `SELECT id, credentials FROM channel_connections
              WHERE tenant_id=$1 AND channel_type='email' AND is_active=true
                AND (credentials->>'host') IS NOT NULL AND (credentials->>'host') != ''
              ORDER BY updated_at DESC LIMIT 1`,
            [tenantId],
          );
          if (ec?.credentials) {
            creds = ec.credentials;
            await this.db.query(`UPDATE conversations SET connection_id=$1 WHERE id=$2 AND connection_id IS NULL`, [ec.id, conversationId]).catch(() => {});
          }
        }
        if (!toEmail || !creds.host) {
          this.logger.warn(`[bot email] cannot send: to=${toEmail ?? 'null'} host=${creds.host ?? 'null'} conv=${conversationId}`);
          return;
        }
        const nodemailer = await import('nodemailer');
        const secure = String(creds.encryption ?? '').toUpperCase() === 'SSL' || Number(creds.port) === 465;
        const transport = nodemailer.createTransport({
          host: String(creds.host).trim(),
          port: Number(creds.port) || 587,
          secure,
          auth: creds.user ? { user: String(creds.user).trim(), pass: String(creds.password ?? '') } : undefined,
          tls: { rejectUnauthorized: false },
          connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 15000,
        });
        const fromName = creds.fromName || 'Soporte';
        const fromAddr = String(creds.user || '').trim();
        const baseSubject = conv.subject && conv.subject !== '(sin asunto)' ? conv.subject : 'Mensaje';
        const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;
        const [lastIn] = await this.db.query(
          `SELECT external_id FROM messages WHERE conversation_id=$1 AND direction='inbound' AND external_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
          [conversationId],
        );
        const threadRefs = lastIn?.external_id ? { inReplyTo: lastIn.external_id, references: lastIn.external_id } : {};
        try {
          const info = await transport.sendMail({
            from: fromAddr ? `${fromName} <${fromAddr}>` : fromName,
            to: toEmail,
            subject,
            text,
            html: text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
            ...threadRefs,
          });
          if (messageId && info?.messageId) {
            await this.db.query(`UPDATE messages SET external_id=$1 WHERE id=$2`, [info.messageId, messageId]).catch(() => {});
          }
        } finally {
          transport.close();
        }
        break;
      }
    }
  }

  // ── Improve system prompt using platform AI ────────────────────────────────

  async improveSystemPrompt(systemPrompt: string): Promise<string> {
    if (!systemPrompt?.trim()) return systemPrompt;
    const platformAI = await this.platformSettings.getAI();
    if (!platformAI?.apiKey) return systemPrompt;

    const instruction = `Mejora el siguiente System Prompt para un chatbot de atención al cliente empresarial.
Hazlo más claro, específico y efectivo. Mantén el idioma y el propósito original.
Añade estructura con numeración o viñetas si no la tiene.
No cambies la personalidad ni el objetivo del bot.
Responde SOLO con el prompt mejorado, sin explicaciones adicionales.

System Prompt original:
${systemPrompt}`;

    try {
      if (platformAI.provider === 'openai') {
        const res = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          { model: platformAI.model ?? 'gpt-4o-mini', messages: [{ role: 'user', content: instruction }], temperature: 0.3, max_tokens: 1000 },
          { headers: { Authorization: `Bearer ${platformAI.apiKey}` }, timeout: 20000 },
        );
        return res.data.choices?.[0]?.message?.content ?? systemPrompt;
      }
      if (platformAI.provider === 'anthropic') {
        const res = await axios.post(
          'https://api.anthropic.com/v1/messages',
          { model: platformAI.model ?? 'claude-haiku-4-5-20251001', messages: [{ role: 'user', content: instruction }], max_tokens: 1000 },
          { headers: { 'x-api-key': platformAI.apiKey, 'anthropic-version': '2023-06-01' }, timeout: 20000 },
        );
        return res.data.content?.[0]?.text ?? systemPrompt;
      }
      if (platformAI.provider === 'gemini') {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${platformAI.model ?? 'gemini-1.5-flash'}:generateContent?key=${platformAI.apiKey}`,
          { contents: [{ parts: [{ text: instruction }] }] },
          { timeout: 20000 },
        );
        return res.data.candidates?.[0]?.content?.parts?.[0]?.text ?? systemPrompt;
      }
    } catch (e: any) {
      this.logger.warn(`[improveSystemPrompt] AI call failed: ${e.message}`);
    }
    return systemPrompt;
  }
}
