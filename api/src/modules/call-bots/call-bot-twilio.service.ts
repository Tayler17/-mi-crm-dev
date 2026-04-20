import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { BotActionsService } from './bot-actions.service';
import * as https from 'https';
import * as http from 'http';

/**
 * Handles Twilio voice webhooks:
 *  1. /call-bots/twilio/:botId/voice  — initial call → TwiML greeting + Gather
 *  2. /call-bots/twilio/:botId/gather — user spoke → AI response or handoff
 *  3. /call-bots/twilio/:botId/status — call ended → save CallLog + update counters
 */

const VOICE_MAP: Record<string, { name: string; language: string }> = {
  'neutral_es-MX': { name: 'Polly.Mia',      language: 'es-MX' },
  'female_es-MX':  { name: 'Polly.Mia',      language: 'es-MX' },
  'male_es-MX':    { name: 'Polly.Miguel',   language: 'es-MX' },
  'neutral_es-ES': { name: 'Polly.Conchita', language: 'es-ES' },
  'female_es-ES':  { name: 'Polly.Lucia',    language: 'es-ES' },
  'male_es-ES':    { name: 'Polly.Enrique',  language: 'es-ES' },
  'neutral_es-AR': { name: 'Polly.Conchita', language: 'es-ES' },
  'female_es-AR':  { name: 'Polly.Conchita', language: 'es-ES' },
  'neutral_es-CO': { name: 'Polly.Conchita', language: 'es-ES' },
  'neutral_en-US': { name: 'Polly.Joanna',   language: 'en-US' },
  'female_en-US':  { name: 'Polly.Joanna',   language: 'en-US' },
  'male_en-US':    { name: 'Polly.Matthew',  language: 'en-US' },
  'neutral_en-GB': { name: 'Polly.Emma',     language: 'en-GB' },
  'female_en-GB':  { name: 'Polly.Emma',     language: 'en-GB' },
  'male_en-GB':    { name: 'Polly.Brian',    language: 'en-GB' },
  'neutral_pt-BR': { name: 'Polly.Vitoria',  language: 'pt-BR' },
  'female_pt-BR':  { name: 'Polly.Vitoria',  language: 'pt-BR' },
  'male_pt-BR':    { name: 'Polly.Ricardo',  language: 'pt-BR' },
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type CallMeta = { contactId: string | null; tenantId: string; contactName?: string | null };

// ─── Tool definitions ─────────────────────────────────────────────────────────

function buildTools(stageNames: string[]): Array<{ name: string; description: string; parameters: any }> {
  const stagesDesc = stageNames.length ? `Available stages: ${stageNames.join(', ')}.` : '';
  return [
    {
      name: 'create_deal',
      description: 'Create a deal or opportunity in the CRM for the caller. Use when the caller expresses interest, books a service, or a sale is identified.',
      parameters: {
        type: 'object',
        properties: {
          title:      { type: 'string',  description: 'Short deal title, e.g. "Envío Londres - María García"' },
          value:      { type: 'number',  description: 'Monetary value of the deal (optional)' },
          stage_name: { type: 'string',  description: `Pipeline stage to assign. ${stagesDesc}` },
          notes:      { type: 'string',  description: 'Additional notes gathered during the call' },
          priority:   { type: 'string',  enum: ['low', 'medium', 'high'], description: 'Deal priority' },
        },
        required: ['title'],
      },
    },
    {
      name: 'create_task',
      description: 'Create a follow-up task in the CRM. Use for callbacks, follow-ups, or reminders about this caller.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string', description: 'Task title, e.g. "Llamar para confirmar entrega"' },
          description: { type: 'string', description: 'Task details (optional)' },
          due_date:    { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
          priority:    { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['title'],
      },
    },
    {
      name: 'add_tag',
      description: 'Add a tag/label to this contact. Use to categorize or mark the contact based on conversation.',
      parameters: {
        type: 'object',
        properties: {
          tag_name: { type: 'string', description: 'Tag name to add to the contact' },
        },
        required: ['tag_name'],
      },
    },
    {
      name: 'update_deal',
      description: 'Update the status or notes of an existing deal.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: { type: 'string', description: 'The deal ID to update' },
          status:  { type: 'string', enum: ['open', 'won', 'lost'], description: 'New deal status' },
          notes:   { type: 'string', description: 'Updated notes' },
          value:   { type: 'number', description: 'Updated monetary value' },
        },
        required: ['deal_id'],
      },
    },
  ];
}

function toOpenAITools(tools: ReturnType<typeof buildTools>) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

function toAnthropicTools(tools: ReturnType<typeof buildTools>) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function toGeminiTools(tools: ReturnType<typeof buildTools>) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];
}

function resolveVoice(voiceType: string, language: string): { name: string; language: string } {
  return (
    VOICE_MAP[`${voiceType}_${language}`] ??
    VOICE_MAP[`neutral_${language}`] ??
    { name: 'Polly.Joanna', language: 'en-US' }
  );
}

function xe(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function twiml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner.trim()}</Response>`;
}

function httpPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

@Injectable()
export class CallBotTwilioService {
  private readonly logger = new Logger(CallBotTwilioService.name);
  private readonly callHistories  = new Map<string, ChatMessage[]>();
  private readonly callTranscripts = new Map<string, string>();   // callSid → transcript text
  private readonly callMeta        = new Map<string, CallMeta>(); // callSid → contact + tenant

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
    private readonly botActions: BotActionsService,
  ) {}

  /**
   * Called when Twilio receives an inbound call on the bot's phone number.
   * Returns TwiML: play welcome message + open a Gather for speech input.
   */
  async handleIncomingCall(
    botId: string,
    callSid: string,
    from: string,
    to: string,
    baseUrl: string,
  ): Promise<string> {
    const [bot] = await this.db.query(
      `SELECT * FROM call_bots WHERE id = $1 AND status = 'active'`,
      [botId],
    );

    if (!bot) {
      this.logger.warn(`Incoming call to inactive/missing bot ${botId}`);
      return twiml(`<Say>This service is not available. Goodbye.</Say><Hangup/>`);
    }

    // Check if this is a transferred call (same callSid re-entering from <Redirect>)
    const isTransferredCall = this.callHistories.has(callSid);

    // Identify caller contact in CRM (reuse meta from transferred call if available)
    let contact: { id: string; name: string; email: string | null } | null = null;
    if (isTransferredCall && this.callMeta.has(callSid)) {
      const existingMeta = this.callMeta.get(callSid)!;
      contact = existingMeta.contactId ? { id: existingMeta.contactId, name: existingMeta.contactName ?? '', email: null } : null;
    } else {
      contact = await this.botActions.lookupContactByPhone(bot.tenant_id, from);
      this.callMeta.set(callSid, { contactId: contact?.id ?? null, tenantId: bot.tenant_id, contactName: contact?.name });
    }

    if (contact) {
      this.logger.log(`[callbot] Call ${callSid} identified contact "${contact.name}" (${contact.id}) transferred=${isTransferredCall}`);
    } else {
      this.logger.log(`[callbot] Call ${callSid} from ${from} — no CRM contact found (transferred=${isTransferredCall})`);
    }

    // Initialize conversation history with enriched system prompt
    if (bot.system_prompt) {
      const pc = bot.provider_config ?? {};
      const hasTransfer = !!(pc.transferToNumber ?? pc.transfer_to_number);

      // Load CRM context for function calling
      const crmCtx = await this.botActions.getContext(bot.tenant_id);
      const contactLine = contact ? `CONTACTO IDENTIFICADO: ${contact.name}${contact.email ? ` (${contact.email})` : ''}.` : '';

      // Load previous call transcript for this number (persistent memory)
      let memoryNote = '';
      if (!isTransferredCall && from) {
        const prevLogs = await this.db.query(
          `SELECT transcript FROM call_logs
           WHERE from_number = $1 AND transcript IS NOT NULL AND LENGTH(transcript) > 20
           ORDER BY started_at DESC LIMIT 2`,
          [from],
        ).catch(() => []);
        if (prevLogs.length > 0) {
          const summaries = prevLogs.map((l: any, i: number) => `[Llamada anterior ${i + 1}]:\n${l.transcript}`).join('\n\n');
          memoryNote = `MEMORIA DE LLAMADAS ANTERIORES (mismo contacto):\n${summaries}`;
        }
      }

      // Load available queues with call bots for queue-transfer instructions
      const transferableQueues = await this.db.query(
        `SELECT DISTINCT q.name AS queue_name, cb.name AS bot_name
         FROM queues q
         INNER JOIN call_bots cb ON q.tenant_id::text = cb.tenant_id AND q.id = ANY(cb.queue_ids::uuid[])
         WHERE q.tenant_id::text = $1 AND q.is_active = true AND cb.status = 'active' AND cb.id != $2
         ORDER BY q.name`,
        [bot.tenant_id, botId],
      ).catch((e: any) => { this.logger.error(`[callbot] transferableQueues query error: ${e.message}`); return []; });

      // Use bot names as transfer keys — more natural for AI than queue names
      const queueLines = transferableQueues.map((q: any) => {
        const key = q.bot_name.toLowerCase().replace(/\s+/g, '-');
        return `  - ${q.bot_name}: escribe [QUEUE:${key}]`;
      }).join('\n');

      const crmInstructions = crmCtx.stages.length
        ? `HERRAMIENTAS CRM DISPONIBLES: Puedes registrar tratos, tareas y etiquetas en el CRM durante la llamada usando las funciones disponibles. Úsalas de forma silenciosa y continúa la conversación sin mencionar el CRM al cliente.${crmCtx.stages.length ? ` Etapas de pipeline disponibles: ${crmCtx.stages.map((s: any) => s.name).join(', ')}.` : ''}`
        : '';

      const instructions = [
        bot.system_prompt,
        contactLine,
        memoryNote,
        crmInstructions,
        'REGLA: Responde siempre en máximo 2 frases cortas (es una llamada de voz).',
        transferableQueues.length > 0
          ? `PARA TRANSFERIR A OTRO DEPARTAMENTO, usa estos códigos exactos al FINAL de tu respuesta:\n${queueLines}\nEjemplo: "Te paso ahora. [QUEUE:bot-de-ventas]"\nIMPORTANTE: Escribe el código EXACTAMENTE como aparece arriba. NO uses [TRANSFER] para transferencias de departamento.`
          : '',
        hasTransfer
          ? 'PARA TRANSFERIR A UN AGENTE HUMANO (persona real): escribe [TRANSFER] al final.'
          : '',
        'PARA COLGAR: cuando el usuario se despida escribe [HANGUP] al final.',
      ].filter(Boolean).join('\n\n');

      if (isTransferredCall) {
        // Transfer case: keep previous conversation turns but replace the system prompt with this bot's instructions
        const prevHistory = this.callHistories.get(callSid)!;
        const prevTurns = prevHistory.filter((m) => m.role !== 'system');
        const prevSummaryLine = prevTurns.length > 0
          ? `\n\nCONTEXTO DE TRANSFERENCIA: La llamada fue transferida desde otro bot. Conversación previa:\n${prevTurns.map((m) => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`).join('\n')}`
          : '';
        this.callHistories.set(callSid, [
          { role: 'system', content: instructions + prevSummaryLine },
          ...prevTurns,
        ]);
        this.logger.log(`[callbot] Transferred call ${callSid}: kept ${prevTurns.length} turn(s), updated system prompt`);
      } else {
        this.callHistories.set(callSid, [{ role: 'system', content: instructions }]);
      }
    }

    const voice  = resolveVoice(bot.voice_type, bot.language);
    const gather = `${baseUrl}/call-bots/twilio/${botId}/gather`;

    const welcome = xe(
      bot.welcome_message ||
        (bot.language.startsWith('es') ? 'Hola, bienvenido. ¿En qué puedo ayudarte?' : 'Hello, how can I help you today?'),
    );

    return twiml(`
      <Gather input="speech" action="${gather}" timeout="5" speechTimeout="auto" language="${voice.language}">
        <Say voice="${voice.name}" language="${voice.language}">${welcome}</Say>
      </Gather>
      <Redirect method="POST">${gather}</Redirect>
    `);
  }

  /**
   * Called after the user speaks (Gather result).
   * Uses AI if configured, otherwise falls back to keyword detection.
   */
  async handleGather(
    botId: string,
    callSid: string,
    speechResult: string,
    baseUrl: string,
  ): Promise<string> {
    const [bot] = await this.db.query(
      `SELECT * FROM call_bots WHERE id = $1`,
      [botId],
    );

    if (!bot) return twiml(`<Hangup/>`);

    const voice   = resolveVoice(bot.voice_type, bot.language);
    const gather  = `${baseUrl}/call-bots/twilio/${botId}/gather`;
    const keyword = (bot.handoff_keyword || 'agent').toLowerCase();
    const speech  = (speechResult || '').trim();

    // Append user speech to transcript
    const prevTranscript = this.callTranscripts.get(callSid) ?? '';

    // No speech captured → re-gather silently
    if (!speech) {
      return twiml(`
        <Gather input="speech" action="${gather}" timeout="5" speechTimeout="auto" language="${voice.language}">
          <Say voice="${voice.name}" language="${voice.language}">${xe(bot.language.startsWith('es') ? '¿Sigues ahí?' : 'Are you still there?')}</Say>
        </Gather>
        <Hangup/>
      `);
    }

    // Append user turn to transcript
    this.callTranscripts.set(callSid, prevTranscript + `[Usuario]: ${speech}\n`);

    const pc = bot.provider_config ?? {};
    const { apiKey: aiApiKey, provider: aiProvider, model: aiPlatformModel } = await this.platformSettings.getAI();
    const transferToNum  = pc.transferToNumber ?? pc.transfer_to_number ?? '';

    // Load queues that have an active call bot (for two-step transfer classification)
    const transferableQueues: Array<{ queue_name: string; bot_name: string }> = aiApiKey
      ? await this.db.query(
          `SELECT DISTINCT q.name AS queue_name, cb.name AS bot_name
           FROM queues q
           INNER JOIN call_bots cb ON q.tenant_id::text = cb.tenant_id AND q.id = ANY(cb.queue_ids::uuid[])
           WHERE q.tenant_id::text = $1 AND q.is_active = true AND cb.status = 'active' AND cb.id != $2
           ORDER BY q.name`,
          [bot.tenant_id, botId],
        ).catch((e: any) => { this.logger.error(`[callbot] handleGather queues query error: ${e.message}`); return []; })
      : [];

    // Keyword fallback (only when no AI configured)
    const hasAi = !!aiApiKey;
    if (!hasAi && speech.toLowerCase().includes(keyword)) {
      this.callHistories.delete(callSid);
      await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
      const msg = xe(bot.language.startsWith('es') ? 'Un momento, te transfiero con un agente.' : 'One moment, transferring you.');
      if (transferToNum) {
        return twiml(`<Say voice="${voice.name}" language="${voice.language}">${msg}</Say><Dial timeout="30" callerId="${bot.phone_number ?? ''}">${xe(transferToNum)}</Dial>`);
      }
      return twiml(`<Say voice="${voice.name}" language="${voice.language}">${msg}</Say><Hangup/>`);
    }

    if (aiApiKey && bot.system_prompt) {
      // Play a brief filler to mask AI latency
      const rawReply = await this.callAi(bot, callSid, speech, aiProvider, aiApiKey, aiPlatformModel);
      if (rawReply) {
        const wantsTransfer  = rawReply.includes('[TRANSFER]');
        const wantsHangup    = rawReply.includes('[HANGUP]');
        const transferQueue  = this.extractQueueTag(rawReply);  // [QUEUE:nombre]
        const cleanReply     = rawReply
          .replace(/\[TRANSFER\]/g, '').replace(/\[HANGUP\]/g, '').replace(/\[QUEUE:[^\]]+\]/g, '').trim();

        // Append bot turn to transcript
        this.callTranscripts.set(callSid, (this.callTranscripts.get(callSid) ?? '') + `[Bot]: ${cleanReply}\n`);

        // Transfer to another queue's bot — same call, no extra phone number needed
        if (transferQueue) {
          const destBotId = await this.resolveQueueBotId(bot.tenant_id, transferQueue, botId);
          this.logger.log(`[callbot] Queue transfer "${transferQueue}" → destBotId=${destBotId ?? 'NOT FOUND'}`);
          if (destBotId) {
            await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
            // Keep callHistories alive — dest bot's handleIncomingCall will reuse them with its own system prompt
            const destVoiceUrl = `${baseUrl}/call-bots/twilio/${destBotId}/voice`;
            return twiml(`
              <Say voice="${voice.name}" language="${voice.language}">${xe(cleanReply)}</Say>
              <Redirect method="POST">${destVoiceUrl}</Redirect>
            `);
          }
          this.logger.warn(`[callbot] No bot found for queue "${transferQueue}", falling through`);
        }

        // Transfer: AI said [TRANSFER] — classify whether it's a queue or a human agent
        if (wantsTransfer) {
          // Two-step: if there are other bots available, ask AI to classify destination
          if (transferableQueues.length > 0) {
            const destBotName = await this.classifyQueueTransfer(bot, callSid, aiProvider, aiApiKey, aiPlatformModel, transferableQueues);
            this.logger.log(`[callbot] Two-step classification result: "${destBotName}"`);

            if (destBotName && destBotName !== 'human') {
              const slug = destBotName.toLowerCase().replace(/\s+/g, '-');
              const destBotId = await this.resolveQueueBotId(bot.tenant_id, slug, botId);
              this.logger.log(`[callbot] Classified queue "${destBotName}" slug="${slug}" → destBotId=${destBotId ?? 'NOT FOUND'}`);
              if (destBotId) {
                await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
                // Keep callHistories alive — dest bot will reuse them with its own system prompt
                const destVoiceUrl = `${baseUrl}/call-bots/twilio/${destBotId}/voice`;
                return twiml(`
                  <Say voice="${voice.name}" language="${voice.language}">${xe(cleanReply)}</Say>
                  <Redirect method="POST">${destVoiceUrl}</Redirect>
                `);
              }
            }
          }

          // Fall back to human agent dial
          if (transferToNum) {
            await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
            // Keep transcript in map — handleStatus will save and clean it
            this.callHistories.delete(callSid);
            return twiml(`
              <Say voice="${voice.name}" language="${voice.language}">${xe(cleanReply)}</Say>
              <Dial timeout="30" callerId="${bot.phone_number ?? ''}">${xe(transferToNum)}</Dial>
            `);
          }

          // No human number configured either — just continue conversation
          this.logger.warn(`[callbot] [TRANSFER] detected but no destination available, continuing`);
        }

        if (wantsHangup) {
          this.callHistories.delete(callSid);
          this.callTranscripts.delete(callSid);
          return twiml(`
            <Say voice="${voice.name}" language="${voice.language}">${xe(cleanReply)}</Say>
            <Hangup/>
          `);
        }

        return twiml(`
          <Gather input="speech" action="${gather}" timeout="8" speechTimeout="auto" language="${voice.language}">
            <Say voice="${voice.name}" language="${voice.language}">${xe(cleanReply)}</Say>
          </Gather>
          <Redirect method="POST">${gather}</Redirect>
        `);
      }
    }

    // Fallback
    const fallback = xe(bot.fallback_message || (bot.language.startsWith('es') ? 'Lo siento, no entendí. ¿Puedes repetirlo?' : 'I did not understand. Could you repeat that?'));
    return twiml(`
      <Gather input="speech" action="${gather}" timeout="5" speechTimeout="auto" language="${voice.language}">
        <Say voice="${voice.name}" language="${voice.language}">${fallback}</Say>
      </Gather>
      <Hangup/>
    `);
  }

  private extractQueueTag(text: string): string | null {
    const m = text.match(/\[QUEUE:([^\]]+)\]/i);
    return m ? m[1].trim() : null;
  }

  private async resolveQueueBotId(tenantId: string, queueKey: string, excludeBotId: string): Promise<string | null> {
    // queueKey is slugified bot name e.g. "bot-de-ventas"
    // Convert slug back to fuzzy search: "bot-de-ventas" → "bot de ventas"
    const fuzzy = '%' + queueKey.replace(/-/g, '%') + '%';
    const [row] = await this.db.query(
      `SELECT cb.id
       FROM call_bots cb
       INNER JOIN queues q ON q.tenant_id::text = cb.tenant_id AND q.id = ANY(cb.queue_ids::uuid[])
       WHERE cb.tenant_id = $1
         AND cb.status = 'active'
         AND cb.id != $3
         AND (LOWER(cb.name) LIKE LOWER($2) OR LOWER(q.name) LIKE LOWER($2))
       LIMIT 1`,
      [tenantId, fuzzy, excludeBotId],
    ).catch((e: any) => { this.logger.error(`[callbot] resolveQueueBotId error: ${e.message}`); return []; });
    return row?.id ?? null;
  }

  /**
   * Second AI call: given the conversation history, classify which bot/queue the caller wants.
   * Returns the matched bot name from the queues list, or "human" if none match.
   */
  private async classifyQueueTransfer(
    bot: any,
    callSid: string,
    provider: string,
    apiKey: string,
    platformModel: string,
    queues: Array<{ queue_name: string; bot_name: string }>,
  ): Promise<string | null> {
    const history = this.callHistories.get(callSid) ?? [];
    const conversationText = history
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? 'CALLER' : 'BOT'}: ${m.content}`)
      .join('\n');

    const botNames = queues.map((q) => q.bot_name);
    const optionsList = [...botNames, 'human'].join(', ');
    const classifyPrompt = `Based on this phone conversation, determine which department or person the caller wants to reach.\n\nConversation:\n${conversationText}\n\nAvailable options: ${optionsList}\n\nReply with ONLY one option from the list above. Do not add any explanation.`;

    try {
      let reply: string | null = null;

      if (provider === 'openai') {
        const model = platformModel || 'gpt-4o-mini';
        const messages = [{ role: 'user', content: classifyPrompt }];
        const body = JSON.stringify({ model, messages, max_tokens: 30, temperature: 0 });
        const raw = await httpPost(
          'https://api.openai.com/v1/chat/completions',
          body,
          { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body).toString() },
        );
        reply = JSON.parse(raw).choices?.[0]?.message?.content?.trim() ?? null;

      } else if (provider === 'anthropic') {
        const model = platformModel || 'claude-haiku-4-5-20251001';
        const body = JSON.stringify({ model, messages: [{ role: 'user', content: classifyPrompt }], max_tokens: 30 });
        const raw = await httpPost(
          'https://api.anthropic.com/v1/messages',
          body,
          { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body).toString() },
        );
        reply = JSON.parse(raw).content?.[0]?.text?.trim() ?? null;

      } else if (provider === 'gemini') {
        const model = platformModel || 'gemini-1.5-flash';
        const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: classifyPrompt }] }], generationConfig: { maxOutputTokens: 30, temperature: 0 } });
        const raw = await httpPost(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          body,
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body).toString() },
        );
        reply = JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
      }

      if (!reply) return 'human';

      // Match reply to a known bot name (case-insensitive, partial)
      const replyLower = reply.toLowerCase();
      const matched = botNames.find((name) => replyLower.includes(name.toLowerCase()) || name.toLowerCase().includes(replyLower));
      this.logger.log(`[callbot classify] reply="${reply}" matched="${matched ?? 'none'}" options="${optionsList}"`);
      return matched ?? 'human';

    } catch (err) {
      this.logger.error(`[callbot classify] error: ${err}`);
      return 'human';
    }
  }

  /**
   * Calls the configured AI provider with the conversation history.
   * Supports function calling (one tool-use loop) for create_deal, create_task, add_tag, update_deal.
   * Returns the AI text response (may contain [TRANSFER] or [HANGUP] signals), or null on failure.
   */
  private async callAi(
    bot: any,
    callSid: string,
    userMessage: string,
    provider: string,
    apiKey: string,
    platformModel: string,
  ): Promise<string | null> {
    const history: ChatMessage[] = this.callHistories.get(callSid) ?? [
      { role: 'system', content: bot.system_prompt ?? '' },
    ];

    history.push({ role: 'user', content: userMessage });

    const meta = this.callMeta.get(callSid);
    const crmCtx = meta ? await this.botActions.getContext(meta.tenantId).catch(() => ({ stages: [], tags: [] })) : { stages: [], tags: [] };
    const tools = buildTools(crmCtx.stages.map((s: any) => s.name));

    try {
      let reply: string | null = null;

      // ── OpenAI ──────────────────────────────────────────────────────────────
      if (provider === 'openai') {
        const model = platformModel || 'gpt-4o-mini';
        const oaiTools = toOpenAITools(tools);

        const body1 = JSON.stringify({ model, messages: history, tools: oaiTools, tool_choice: 'auto', max_tokens: 200, temperature: 0.7 });
        const raw1 = await httpPost(
          'https://api.openai.com/v1/chat/completions',
          body1,
          { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body1).toString() },
        );
        const json1 = JSON.parse(raw1);
        const msg1 = json1.choices?.[0]?.message;

        if (msg1?.tool_calls?.length) {
          // Execute tool calls (one loop)
          const toolMessages: any[] = [msg1];
          for (const tc of msg1.tool_calls) {
            const args = JSON.parse(tc.function?.arguments ?? '{}');
            const result = await this.botActions.executeTool(meta?.tenantId ?? bot.tenant_id, meta?.contactId ?? null, tc.function.name, args);
            this.logger.log(`[bot-action] OpenAI tool call: ${tc.function.name}(${tc.function.arguments}) → ${result}`);
            toolMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
          }
          // Second call for final text response
          const msgs2 = [...history, ...toolMessages];
          const body2 = JSON.stringify({ model, messages: msgs2, max_tokens: 150, temperature: 0.7 });
          const raw2 = await httpPost(
            'https://api.openai.com/v1/chat/completions',
            body2,
            { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body2).toString() },
          );
          reply = JSON.parse(raw2).choices?.[0]?.message?.content?.trim() ?? null;
        } else {
          reply = msg1?.content?.trim() ?? null;
        }

      // ── Anthropic ────────────────────────────────────────────────────────────
      } else if (provider === 'anthropic') {
        const model = platformModel || 'claude-haiku-4-5-20251001';
        const systemMsg = history.find((m) => m.role === 'system')?.content ?? '';
        const msgs = history.filter((m) => m.role !== 'system');
        const anthTools = toAnthropicTools(tools);

        const body1 = JSON.stringify({ model, system: systemMsg, messages: msgs, tools: anthTools, max_tokens: 200 });
        const raw1 = await httpPost(
          'https://api.anthropic.com/v1/messages',
          body1,
          { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body1).toString() },
        );
        const json1 = JSON.parse(raw1);
        const toolUseBlocks = (json1.content ?? []).filter((b: any) => b.type === 'tool_use');

        if (toolUseBlocks.length) {
          const toolResults: any[] = [];
          for (const block of toolUseBlocks) {
            const result = await this.botActions.executeTool(meta?.tenantId ?? bot.tenant_id, meta?.contactId ?? null, block.name, block.input ?? {});
            this.logger.log(`[bot-action] Anthropic tool call: ${block.name} → ${result}`);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }
          // Second call with tool results
          const msgs2 = [
            ...msgs,
            { role: 'assistant', content: json1.content },
            { role: 'user', content: toolResults },
          ];
          const body2 = JSON.stringify({ model, system: systemMsg, messages: msgs2, max_tokens: 150 });
          const raw2 = await httpPost(
            'https://api.anthropic.com/v1/messages',
            body2,
            { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body2).toString() },
          );
          reply = JSON.parse(raw2).content?.[0]?.text?.trim() ?? null;
        } else {
          reply = json1.content?.[0]?.text?.trim() ?? null;
        }

      // ── Gemini ───────────────────────────────────────────────────────────────
      } else if (provider === 'gemini') {
        const model = platformModel || 'gemini-1.5-flash';
        const systemInstruction = bot.system_prompt ? { parts: [{ text: bot.system_prompt }] } : undefined;
        const contents = history
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const geminiTools = toGeminiTools(tools);

        const body1 = JSON.stringify({ systemInstruction, contents, tools: geminiTools, generationConfig: { maxOutputTokens: 200 } });
        const raw1 = await httpPost(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          body1,
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body1).toString() },
        );
        const json1 = JSON.parse(raw1);
        const parts1 = json1.candidates?.[0]?.content?.parts ?? [];
        const fnCall = parts1.find((p: any) => p.functionCall);

        if (fnCall) {
          const result = await this.botActions.executeTool(
            meta?.tenantId ?? bot.tenant_id,
            meta?.contactId ?? null,
            fnCall.functionCall.name,
            fnCall.functionCall.args ?? {},
          );
          this.logger.log(`[bot-action] Gemini function call: ${fnCall.functionCall.name} → ${result}`);

          const contents2 = [
            ...contents,
            { role: 'model', parts: parts1 },
            { role: 'user', parts: [{ functionResponse: { name: fnCall.functionCall.name, response: JSON.parse(result) } }] },
          ];
          const body2 = JSON.stringify({ systemInstruction, contents: contents2, generationConfig: { maxOutputTokens: 150 } });
          const raw2 = await httpPost(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            body2,
            { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body2).toString() },
          );
          reply = JSON.parse(raw2).candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
        } else {
          reply = parts1.find((p: any) => p.text)?.text?.trim() ?? null;
        }
      }

      if (reply) {
        history.push({ role: 'assistant', content: reply });
        this.callHistories.set(callSid, history);
        this.logger.log(`[callbot AI] callSid=${callSid} turns=${history.length} reply="${reply.slice(0, 60)}..."`);
      }

      return reply;
    } catch (err) {
      this.logger.error(`[callbot AI] callSid=${callSid} error: ${err}`);
      return null;
    }
  }

  /**
   * Called by Twilio when a call ends (StatusCallback).
   * Saves a CallLog row and increments bot counters.
   */
  async handleStatus(botId: string, body: Record<string, string>): Promise<void> {
    // Grab transcript + contact info before cleaning up
    const transcript  = body.CallSid ? (this.callTranscripts.get(body.CallSid) ?? null) : null;
    const meta        = body.CallSid ? (this.callMeta.get(body.CallSid) ?? null) : null;
    const contactId   = meta?.contactId ?? null;

    if (body.CallSid) {
      this.callHistories.delete(body.CallSid);
      this.callTranscripts.delete(body.CallSid);
      this.callMeta.delete(body.CallSid);
    }

    const terminalStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
    if (!terminalStatuses.includes(body.CallStatus)) return;

    const duration     = parseInt(body.CallDuration ?? '0', 10);
    const direction    = body.Direction === 'inbound' ? 'inbound' : 'outbound';
    const outcome      = body.CallStatus === 'completed' ? 'handled' : body.CallStatus === 'busy' ? 'abandoned' : 'failed';
    const recordingUrl = body.RecordingUrl ?? null;

    try {
      await this.db.query(
        `INSERT INTO call_logs
           (tenant_id, bot_id, direction, from_number, to_number, duration, status, outcome, recording_url, transcript,
            contact_id, started_at, ended_at, created_at)
         SELECT
           cb.tenant_id, cb.id, $2, $3, $4, $5, $6, $7, $8, $9,
           $10,
           NOW() - ($5::int * INTERVAL '1 second'),
           NOW(),
           NOW()
         FROM call_bots cb WHERE cb.id = $1`,
        [botId, direction, body.From ?? '', body.To ?? '', duration, body.CallStatus, outcome, recordingUrl, transcript, contactId],
      );

      await this.db.query(
        `UPDATE call_bots
         SET total_calls       = total_calls + 1,
             handled_calls     = handled_calls + CASE WHEN $2 = 'handled' THEN 1 ELSE 0 END,
             updated_at        = NOW()
         WHERE id = $1`,
        [botId, outcome],
      );

      this.logger.log(`Call ${body.CallSid} → bot ${botId}, outcome=${outcome}, duration=${duration}s`);
    } catch (err) {
      this.logger.error(`Failed to save call log for bot ${botId}: ${err}`);
    }
  }
}
