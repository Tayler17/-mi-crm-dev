import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data');
import { WhatsappWebService } from '../connections/whatsapp-web.service';
import { NotificationsService } from '../notifications/notifications.service';

interface MediaResult {
  /** Text to pass to the LLM (transcription for audio, empty for images) */
  text: string;
  /** Base64-encoded image data (for vision models) */
  imageBase64?: string;
  imageMimeType?: string;
}

/** Return value from every callAi* method */
interface AiResult {
  reply: string;
  transferTo?: string;
  resolveConversation?: boolean;
  setWaiting?: boolean;
  createDeal?: { title: string; value?: number; currency?: string; stageName?: string; notes?: string };
  updateDeal?: { dealId: string; stageName?: string; value?: number; notes?: string; status?: string };
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
  ) {}

  // ── Event listener ────────────────────────────────────────────────────────────

  @OnEvent('conversation.message_received')
  async onMessageReceived(payload: { tenantId: string; conversationId: string; message: any }) {
    const { tenantId, conversationId, message } = payload;
    if (message?.direction !== 'inbound') return;
    if (message?.is_private) return;
    try {
      await this.processMessage(tenantId, conversationId, message);
    } catch (err) {
      this.logger.error(`AI chatbot error (conv ${conversationId}): ${err}`);
    }
  }

  // ── Core processing ───────────────────────────────────────────────────────────

  private async processMessage(tenantId: string, conversationId: string, inboundMsg: any) {
    // 1. Load conversation + linked inbox + current queue
    const [conv] = await this.db.query(
      `SELECT c.id, c.inbox_id, c.contact_id, c.connection_id, c.queue_id,
              cc.inbox_id AS conn_inbox_id
       FROM conversations c
       LEFT JOIN channel_connections cc ON cc.id = c.connection_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [conversationId, tenantId],
    );
    if (!conv) return;

    const effectiveInboxId = conv.inbox_id ?? conv.conn_inbox_id;
    if (!effectiveInboxId) return;

    if (!conv.inbox_id && conv.conn_inbox_id) {
      await this.db.query(`UPDATE conversations SET inbox_id = $1 WHERE id = $2`,
        [conv.conn_inbox_id, conversationId]).catch(() => {});
    }

    // 2. Find active bot — prefer a bot that already has an active session for this
    // conversation (post-transfer state where dest bot's session was pre-created),
    // then fall back to inbox/queue matching for the initial message.
    let [bot] = await this.db.query(
      `SELECT b.* FROM ai_chatbots b
       INNER JOIN ai_chatbot_sessions s ON s.chatbot_id = b.id
       WHERE s.conversation_id = $1 AND s.status = 'active'
         AND b.tenant_id = $2 AND b.status = 'active'
       ORDER BY s.created_at DESC LIMIT 1`,
      [conversationId, tenantId],
    );
    if (!bot) {
      [bot] = await this.db.query(
        `SELECT * FROM ai_chatbots
         WHERE tenant_id = $1 AND status = 'active'
           AND (
             $2::uuid = ANY(inbox_ids)
             OR ($3::uuid IS NOT NULL AND $3::uuid = ANY(queue_ids))
           )
         ORDER BY ($2::uuid = ANY(inbox_ids)) DESC
         LIMIT 1`,
        [tenantId, effectiveInboxId, conv.queue_id ?? null],
      );
    }
    if (!bot) return;

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
    // Create a new session if none exists OR if the last session was ended by a queue-transfer
    if (!session || session.status === 'ended') {
      [session] = await this.db.query(
        `INSERT INTO ai_chatbot_sessions (tenant_id, chatbot_id, conversation_id, contact_id, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
        [tenantId, bot.id, conversationId, conv.contact_id],
      );
      if (bot.welcome_message) {
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

    // 6. Get tenant AI keys
    const [tenant] = await this.db.query(`SELECT settings FROM tenants WHERE id=$1`, [tenantId]);
    const aiKeys: Record<string, string> = tenant?.settings?.aiKeys ?? {};
    const apiKey = aiKeys[bot.provider];
    if (!apiKey) {
      this.logger.warn(`No API key for provider "${bot.provider}" in tenant ${tenantId}.`);
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

    // 6c. Load pipeline stages and existing open deals for deal management tools
    let stageNames: string[] = [];
    let stageMap: Record<string, string> = {}; // name.lower → id
    let existingDeals: any[] = [];
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
    } catch {}

    // 7. Build message history — only include messages from AFTER this bot's session
    // started so that messages from a previous bot don't bleed into this bot's context.
    const memoryConvs = Math.min(parseInt(bot.memory_conversations ?? '5', 10) || 0, 50);
    const msgPerConv  = 20;

    const currentHistory = await this.db.query(
      `SELECT body, direction, sender_type, content_type
       FROM messages
       WHERE conversation_id=$1 AND is_private=false
         AND created_at >= $2
       ORDER BY created_at DESC LIMIT ${msgPerConv}`,
      [conversationId, session.created_at],
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
      apiKey, bot.provider, aiKeys,
      inboundMsg.body ?? '', inboundMsg.content_type ?? 'text',
    );
    this.logger.log(`[engine] preprocessMedia result text="${media.text?.slice(0,80)}" hasImage=${!!media.imageBase64}`);

    // 9. Call AI — pass queueMap + stages + deals so each provider can use function/tool calling
    const result = await this.callAi(bot, apiKey, history, media, queueMap, stageNames, stageMap, existingDeals);
    if (!result) return;

    const { reply, transferTo, resolveConversation, setWaiting, createDeal, updateDeal } = result;
    this.logger.log(`[engine] AI reply (first 120): "${reply?.slice(0, 120)}" transferTo="${transferTo ?? 'none'}" resolve=${!!resolveConversation} wait=${!!setWaiting} createDeal=${!!createDeal} updateDeal=${!!updateDeal}`);

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
    } else if (setWaiting) {
      await this.db.query(
        `UPDATE conversations SET assigned_user_id=NULL, queue_id=NULL, updated_at=NOW() WHERE id=$1`,
        [conversationId],
      ).catch(() => {});
      await this.db.query(`UPDATE ai_chatbot_sessions SET status='ended', ended_at=NOW() WHERE id=$1`, [session.id]).catch(() => {});
      this.logger.log(`[engine] Conversation ${conversationId} set to waiting by bot`);
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
              const destTenant = tenant; // reuse already-loaded tenant settings
              const destApiKey = destTenant?.settings?.aiKeys?.[destBot.provider];
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
      this.logger.log(`[audio] openAiKey=${!!openAiKey} filePath=${filePath} exists=${filePath ? existsSync(filePath) : 'n/a'}`);
      if (openAiKey && filePath && existsSync(filePath)) {
        try {
          const transcription = await this.transcribeAudio(openAiKey, filePath);
          this.logger.log(`[audio] transcription="${transcription}"`);
          if (transcription) {
            return { text: `[Nota de voz]: ${transcription}` };
          }
        } catch (e: any) {
          this.logger.warn(`Audio transcription failed: ${e.message}`);
        }
      }
      // Gemini can process audio natively
      if (provider === 'gemini' && filePath && existsSync(filePath)) {
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
      return { text: '[El usuario envió una nota de voz que no se pudo transcribir]' };
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
    const form = new FormData();
    form.append('file', readFileSync(filePath), { filename: 'audio.ogg', contentType: 'audio/ogg' });
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
  ): Promise<AiResult | null> {
    try {
      const maxTokens   = parseInt(bot.max_tokens,  10) || 300;
      const temperature = parseFloat(bot.temperature)   || 0.7;
      const transferTargets = [...new Set(Object.keys(queueMap))];
      const systemPrompt = `IDENTIDAD: Tu nombre es "${bot.name}". Cuando alguien pregunte de qué equipo eres o quién eres, responde siempre que eres "${bot.name}".\n\n${bot.system_prompt ?? ''}`.trim();

      switch (bot.provider) {
        case 'openai':    return await this.callOpenAi(apiKey, bot.model, systemPrompt, history, media, maxTokens, temperature, transferTargets, stageNames, stageMap, existingDeals);
        case 'anthropic': return await this.callAnthropic(apiKey, bot.model, systemPrompt, history, media, maxTokens, temperature, transferTargets, stageNames, stageMap, existingDeals);
        case 'gemini':    return await this.callGemini(apiKey, bot.model, systemPrompt, history, media, maxTokens, temperature, transferTargets, stageNames, stageMap, existingDeals);
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
    transferTargets: string[] = [], stageNames: string[] = [], _stageMap: Record<string, string> = {}, existingDeals: any[] = [],
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
      tools.push({ type: 'function', function: { name: 'create_deal', description: 'Create a new deal/booking in the CRM for this customer.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Deal title (e.g. "Envío LDN→SDQ - Taylor Cabrera")' }, value: { type: 'number', description: 'Deal value' }, currency: { type: 'string', description: 'Currency (USD/GBP/EUR)', default: 'USD' }, stage_name: { type: 'string', enum: stageNames, description: 'Pipeline stage' }, notes: { type: 'string', description: 'Additional notes' }, message: { type: 'string', description: 'Confirmation message to customer' } }, required: ['title', 'stage_name', 'message'] } } });
      if (existingDeals.length > 0) {
        const dealIds = existingDeals.map((d: any) => d.id);
        tools.push({ type: 'function', function: { name: 'update_deal', description: `Update an existing deal. Open deals: ${existingDeals.map((d: any) => `"${d.title}"(id:${d.id},stage:${d.stage_name ?? 'none'})`).join(', ')}`, parameters: { type: 'object', properties: { deal_id: { type: 'string', enum: dealIds, description: 'Deal ID to update' }, stage_name: { type: 'string', enum: stageNames, description: 'New stage' }, value: { type: 'number', description: 'New value' }, notes: { type: 'string', description: 'Updated notes' }, status: { type: 'string', enum: ['open', 'won', 'lost'], description: 'Deal status' }, message: { type: 'string', description: 'Message to customer' } }, required: ['deal_id', 'message'] } } });
      }
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
        }
      } catch { /* fall through */ }
    }
    return { reply: choice?.message?.content?.trim() ?? '' };
  }

  private async callAnthropic(
    apiKey: string, model: string, systemPrompt: string | null,
    history: any[], media: MediaResult, maxTokens: number, temperature: number,
    transferTargets: string[] = [], stageNames: string[] = [], _stageMap: Record<string, string> = {}, existingDeals: any[] = [],
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
      tools.push({ name: 'create_deal', description: 'Create a new deal in the CRM.', input_schema: { type: 'object', properties: { title: { type: 'string' }, value: { type: 'number' }, currency: { type: 'string' }, stage_name: { type: 'string', enum: stageNames }, notes: { type: 'string' }, message: { type: 'string' } }, required: ['title', 'stage_name', 'message'] } });
      if (existingDeals.length > 0) {
        tools.push({ name: 'update_deal', description: 'Update an existing deal.', input_schema: { type: 'object', properties: { deal_id: { type: 'string', enum: existingDeals.map((d: any) => d.id) }, stage_name: { type: 'string', enum: stageNames }, value: { type: 'number' }, notes: { type: 'string' }, status: { type: 'string', enum: ['open','won','lost'] }, message: { type: 'string' } }, required: ['deal_id', 'message'] } });
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
        }
      }
    }
    return { reply: res.data.content?.find((b: any) => b.type === 'text')?.text?.trim() ?? '' };
  }

  private async callGemini(
    apiKey: string, model: string, systemPrompt: string | null,
    history: any[], media: MediaResult, maxTokens: number, temperature: number,
    transferTargets: string[] = [], stageNames: string[] = [], _stageMap: Record<string, string> = {}, existingDeals: any[] = [],
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
      fnDeclarations.push({ name: 'create_deal', description: 'Create a new deal/booking.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, value: { type: 'NUMBER' }, currency: { type: 'STRING' }, stage_name: { type: 'STRING', enum: stageNames }, notes: { type: 'STRING' }, message: { type: 'STRING' } }, required: ['title', 'stage_name', 'message'] } });
      if (existingDeals.length > 0) fnDeclarations.push({ name: 'update_deal', description: 'Update existing deal.', parameters: { type: 'OBJECT', properties: { deal_id: { type: 'STRING', enum: existingDeals.map((d: any) => d.id) }, stage_name: { type: 'STRING', enum: stageNames }, value: { type: 'NUMBER' }, notes: { type: 'STRING' }, status: { type: 'STRING', enum: ['open','won','lost'] }, message: { type: 'STRING' } }, required: ['deal_id', 'message'] } });
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
      }
    }
    return { reply: part?.text?.trim() ?? '' };
  }

  // ── Test endpoint ─────────────────────────────────────────────────────────────

  async testBotMessage(botId: string, tenantId: string, message: string): Promise<{ reply: string | null; error?: string }> {
    const [bot] = await this.db.query(`SELECT * FROM ai_chatbots WHERE id=$1 AND tenant_id=$2`, [botId, tenantId]);
    if (!bot) return { reply: null, error: 'Bot no encontrado' };

    const [tenant] = await this.db.query(`SELECT settings FROM tenants WHERE id=$1`, [tenantId]);
    const apiKey = tenant?.settings?.aiKeys?.[bot.provider];
    if (!apiKey) {
      return { reply: null, error: `No hay API key configurada para "${bot.provider}".` };
    }
    try {
      const result = await this.callAi(bot, apiKey, [], { text: message });
      return { reply: result?.reply ?? null };
    } catch (err: any) {
      return { reply: null, error: err?.message ?? 'Error al llamar a la IA' };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

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
    await this.deliverOutbound(conversationId, tenantId, body).catch((e) =>
      this.logger.error(`[bot deliverOutbound] ${e.message}`));
  }

  private async deliverOutbound(conversationId: string, tenantId: string, text: string) {
    if (!text) return;
    const [conv] = await this.db.query(
      `SELECT c.channel_type, c.connection_id, c.external_id,
              cc.channel_type AS conn_channel_type, cc.credentials
       FROM conversations c
       LEFT JOIN channel_connections cc ON cc.id = c.connection_id
       WHERE c.id=$1 AND c.tenant_id=$2 LIMIT 1`,
      [conversationId, tenantId],
    );
    if (!conv) return;
    const channelType = conv.channel_type ?? conv.conn_channel_type;
    switch (channelType) {
      case 'whatsapp_web': {
        if (!conv.external_id || !conv.connection_id) return;
        const sent = await this.waSvc.sendMessage(conv.connection_id, conv.external_id, text);
        if (!sent) this.logger.warn(`[bot] WA session not connected for ${conversationId}`);
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
    }
  }
}
