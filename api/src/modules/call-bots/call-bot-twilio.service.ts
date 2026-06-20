import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { BotActionsService } from './bot-actions.service';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { IntegrationsService } from '../integrations/integrations.service';
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

// Instant acknowledgment templates when AI triggers a CRM tool.
// Avoids a second AI round-trip — tools run in background while bot speaks.
const TOOL_ACK: Record<string, Record<string, string>> = {
  es: {
    create_deal:  'Perfecto, he registrado el trato. ¿En qué más puedo ayudarte?',
    create_task:  'Listo, he creado la tarea. ¿Hay algo más?',
    add_tag:      'De acuerdo, he etiquetado el contacto. ¿Algo más?',
    update_deal:  'Hecho, he actualizado el trato. ¿En qué más te puedo ayudar?',
    default:      'Listo, lo he registrado. ¿En qué más puedo ayudarte?',
  },
  en: {
    create_deal:  "Done, I've registered the deal. Anything else?",
    create_task:  "Done, I've created the task. Anything else?",
    add_tag:      "Done, I've tagged the contact. Anything else?",
    update_deal:  "Done, I've updated the deal. Anything else?",
    default:      "Done, I've recorded that. Anything else?",
  },
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type CallMeta = { contactId: string | null; tenantId: string; contactName?: string | null; botId?: string };

// ─── Tool definitions ─────────────────────────────────────────────────────────

function buildTools(stageNames: string[], tagNames: string[] = [], dentallyConnected = false): Array<{ name: string; description: string; parameters: any }> {
  const stagesDesc = stageNames.length ? `Available stages: ${stageNames.join(', ')}.` : '';
  const tagsDesc = tagNames.length
    ? `MANDATORY — as soon as you identify the caller's main intent, call add_tag with the most appropriate tag from this list: ${tagNames.join(', ')}. Call it in the same turn you identify the intent, do not wait until the end of the call. If the topic changes, use add_tag for the new one.`
    : 'Add a categorization tag to the contact based on the conversation topic.';
  const tools: Array<{ name: string; description: string; parameters: any }> = [
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
      description: 'Create a follow-up task, callback reminder, or leave an internal note in the CRM. Use when: the caller asks you to "leave a note", "call them back", "remind someone", or requests a follow-up of any kind.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string', description: 'Task title, e.g. "Llamar de vuelta a cliente" or "Nota: cliente interesado en plan premium"' },
          description: { type: 'string', description: 'Full details of the note or task' },
          due_date:    { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
          priority:    { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['title'],
      },
    },
    {
      name: 'add_tag',
      description: tagsDesc,
      parameters: {
        type: 'object',
        properties: {
          tag_name: { type: 'string', description: tagNames.length ? `Tag to assign. Choose from: ${tagNames.join(', ')}` : 'Tag name to add to the contact' },
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
  if (dentallyConnected) {
    tools.push(
      { name: 'dentally_list_practitioners', description: 'List the clinic professionals/doctors available for appointments.', parameters: { type: 'object', properties: {} } },
      { name: 'dentally_check_availability', description: 'Check open appointment slots for a given day. Use when the caller asks about availability or times. The result you receive is the real list of times — read it to the caller.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, practitioner_name: { type: 'string' }, duration: { type: 'number' } }, required: ['date'] } },
      { name: 'dentally_book_appointment', description: 'Book an appointment once the caller has chosen a day and time. If the caller is NOT a registered patient, first ask for date_of_birth (YYYY-MM-DD) and gender (male/female), then call this.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM 24h' }, practitioner_name: { type: 'string' }, duration: { type: 'number' }, reason: { type: 'string' }, date_of_birth: { type: 'string' }, gender: { type: 'string', enum: ['male', 'female'] }, title: { type: 'string' } }, required: ['date', 'time'] } },
    );
  }
  return tools;
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

function httpPost(url: string, body: string, headers: Record<string, string>, timeoutMs = 12_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST', headers, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`httpPost timeout after ${timeoutMs}ms`)); });
    req.write(body);
    req.end();
  });
}

@Injectable()
export class CallBotTwilioService {
  private readonly logger = new Logger(CallBotTwilioService.name);
  private readonly callHistories   = new Map<string, ChatMessage[]>();
  private readonly callTranscripts = new Map<string, string>();
  private readonly callMeta        = new Map<string, CallMeta>();
  private readonly ttsFiles        = new Map<string, string[]>();

  // ── TTL caches — avoid repeated DB queries on every voice turn ────────────────
  private readonly botCache    = new Map<string, { v: any;   exp: number }>();
  private readonly queuesCache = new Map<string, { v: any[]; exp: number }>();
  private readonly ctxCache    = new Map<string, { v: any;   exp: number }>();

  /** callSid → timestamp of last activity, for TTL eviction */
  private readonly callLastSeen = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
    private readonly botActions: BotActionsService,
    private readonly elevenLabs: ElevenLabsTtsService,
    private readonly kbSvc: KnowledgeBaseService,
    private readonly integrations: IntegrationsService,
  ) {
    // Evict stale call state every 10 min (handles calls where status callback never fires)
    setInterval(() => this.evictStaleCalls(), 10 * 60 * 1_000);
  }

  private evictStaleCalls(): void {
    const TTL = 60 * 60 * 1_000; // 1 hour
    const now = Date.now();
    for (const [sid, ts] of this.callLastSeen) {
      if (now - ts > TTL) {
        const files = this.ttsFiles.get(sid) ?? [];
        files.forEach((f) => this.elevenLabs.cleanup(f));
        this.callHistories.delete(sid);
        this.callTranscripts.delete(sid);
        this.callMeta.delete(sid);
        this.ttsFiles.delete(sid);
        this.callLastSeen.delete(sid);
        this.logger.warn(`[callbot] Evicted stale call state for ${sid} (no status callback in 1h)`);
      }
    }
  }

  // ── Cached getters ────────────────────────────────────────────────────────────

  async getBot(botId: string): Promise<any> {
    const c = this.botCache.get(botId);
    if (c && c.exp > Date.now()) return c.v;
    const [bot] = await this.db.query(
      `SELECT cb.*,
              v.tts_provider  AS catalog_tts_provider,
              v.tts_voice_id  AS catalog_tts_voice_id,
              v.gender        AS catalog_gender
       FROM call_bots cb
       LEFT JOIN voices v ON v.id = cb.voice_catalog_id AND v.is_active = true
       WHERE cb.id = $1`,
      [botId],
    ).catch(() => this.db.query(`SELECT * FROM call_bots WHERE id = $1`, [botId]));
    if (bot) {
      if (bot.catalog_tts_provider) {
        bot.tts_provider = bot.catalog_tts_provider;
        bot.tts_voice_id = bot.catalog_tts_voice_id ?? '';
        if (bot.catalog_gender && bot.catalog_gender !== 'neutral') bot.voice_type = bot.catalog_gender;
      }
      this.botCache.set(botId, { v: bot, exp: Date.now() + 30_000 });
    }
    return bot ?? null;
  }

  async getBotByPhone(toNumber: string): Promise<any | null> {
    const normalized = toNumber.replace(/[^0-9+]/g, '');
    const [bot] = await this.db.query(
      `SELECT cb.*,
              v.tts_provider  AS catalog_tts_provider,
              v.tts_voice_id  AS catalog_tts_voice_id,
              v.gender        AS catalog_gender
       FROM call_bots cb
       LEFT JOIN voices v ON v.id = cb.voice_catalog_id AND v.is_active = true
       WHERE cb.status = 'active'
         AND (cb.phone_number = $1 OR REGEXP_REPLACE(cb.phone_number, '[^0-9+]', '', 'g') = $2)
       LIMIT 1`,
      [toNumber, normalized],
    ).catch(() => [null]);
    if (!bot) return null;
    if (bot.catalog_tts_provider) {
      bot.tts_provider = bot.catalog_tts_provider;
      bot.tts_voice_id = bot.catalog_tts_voice_id ?? '';
      if (bot.catalog_gender && bot.catalog_gender !== 'neutral') bot.voice_type = bot.catalog_gender;
    }
    return bot;
  }

  getBotIdByCallSid(callSid: string): string | null {
    return this.callMeta.get(callSid)?.botId ?? null;
  }

  private async getQueues(botId: string, tenantId: string): Promise<any[]> {
    const c = this.queuesCache.get(botId);
    if (c && c.exp > Date.now()) return c.v;
    const rows = await this.db.query(
      `SELECT DISTINCT q.name AS queue_name, cb.name AS bot_name
       FROM queues q
       INNER JOIN call_bots cb ON q.tenant_id::text = cb.tenant_id AND q.id = ANY(cb.queue_ids::uuid[])
       WHERE q.tenant_id::text = $1 AND q.is_active = true AND cb.status = 'active' AND cb.id != $2
       ORDER BY q.name`,
      [tenantId, botId],
    ).catch(() => []);
    this.queuesCache.set(botId, { v: rows, exp: Date.now() + 30_000 }); // 30s
    return rows;
  }

  private async getCrmCtx(tenantId: string): Promise<{ stages: any[]; tags: any[] }> {
    const c = this.ctxCache.get(tenantId);
    if (c && c.exp > Date.now()) return c.v;
    const ctx = await this.botActions.getContext(tenantId).catch(() => ({ stages: [], tags: [] }));
    this.ctxCache.set(tenantId, { v: ctx, exp: Date.now() + 300_000 }); // 5 min
    return ctx;
  }

  // ── TTS element builder ───────────────────────────────────────────────────────

  /** Build a <Say> or <Play> element depending on the bot's TTS provider. */
  private async ttsElement(
    text: string,
    bot: any,
    callSid: string,
    baseUrl: string,
  ): Promise<string> {
    if (bot.tts_provider === 'elevenlabs') {
      const apiKey = (await this.platformSettings.get('elevenlabs.api_key').catch(() => '')) as string;
      if (apiKey) {
        try {
          const filename = await this.elevenLabs.generateAudio(text, apiKey, bot.tts_voice_id ?? '');
          const prev = this.ttsFiles.get(callSid) ?? [];
          this.ttsFiles.set(callSid, [...prev, filename]);
          return `<Play>${baseUrl}/call-bots/twilio/tts/${filename}</Play>`;
        } catch (err) {
          this.logger.warn(`[ElevenLabs] TTS failed, falling back to Twilio Say: ${err}`);
        }
      }
    } else if (bot.tts_provider === 'openai_tts') {
      const { apiKey: oaiKey } = await this.platformSettings.getAI().catch(() => ({ apiKey: '' }));
      if (oaiKey) {
        try {
          const filename = await this.generateOpenAiTts(text, oaiKey);
          const prev = this.ttsFiles.get(callSid) ?? [];
          this.ttsFiles.set(callSid, [...prev, filename]);
          return `<Play>${baseUrl}/call-bots/twilio/tts/${filename}</Play>`;
        } catch (err) {
          this.logger.warn(`[OpenAI TTS] failed, falling back: ${err}`);
        }
      }
    }
    // Default: Twilio Polly <Say> — fastest option, no extra API call
    const voice = resolveVoice(bot.voice_type, bot.language);
    return `<Say voice="${voice.name}" language="${voice.language}">${xe(text)}</Say>`;
  }

  private async generateOpenAiTts(text: string, apiKey: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    const TTS_DIR = '/app/uploads/tts';
    fs.mkdirSync(TTS_DIR, { recursive: true });
    const body = JSON.stringify({ model: 'tts-1', input: text.slice(0, 4096), voice: 'nova', response_format: 'mp3' });
    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.openai.com', path: '/v1/audio/speech', method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            (res.statusCode ?? 0) >= 400 ? reject(new Error(`OpenAI TTS ${res.statusCode}`)) : resolve(buf);
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    fs.writeFileSync(path.join(TTS_DIR, filename), audioBuffer);
    return filename;
  }

  // ── Incoming call ─────────────────────────────────────────────────────────────

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
    const bot = await this.getBot(botId);

    if (!bot || bot.status !== 'active') {
      this.logger.warn(`Incoming call to inactive/missing bot ${botId}`);
      return twiml(`<Say>This service is not available. Goodbye.</Say><Hangup/>`);
    }

    this.callLastSeen.set(callSid, Date.now());

    // Check if this is a transferred call (same callSid re-entering from <Redirect>)
    const isTransferredCall = this.callHistories.has(callSid);

    // Identify caller contact in CRM (reuse meta from transferred call if available)
    let contact: { id: string; name: string; email: string | null } | null = null;
    if (isTransferredCall && this.callMeta.has(callSid)) {
      const existingMeta = this.callMeta.get(callSid)!;
      contact = existingMeta.contactId ? { id: existingMeta.contactId, name: existingMeta.contactName ?? '', email: null } : null;
    } else {
      contact = await this.botActions.lookupContactByPhone(bot.tenant_id, from);
      this.callMeta.set(callSid, { contactId: contact?.id ?? null, tenantId: bot.tenant_id, contactName: contact?.name, botId });
    }

    // Auto-create contact for unknown callers so CRM actions work
    if (!contact && !isTransferredCall && from) {
      // Try insert first; if phone already exists fall back to SELECT
      const [created] = await this.db.query(
        `INSERT INTO contacts (tenant_id, full_name, phone, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT DO NOTHING
         RETURNING id, full_name AS name, email`,
        [bot.tenant_id, `Llamada entrante ${from}`, from],
      ).catch(() => [null]);

      if (created) {
        contact = created;
        this.logger.log(`[callbot] Auto-created contact for ${from}: ${contact!.id}`);
      } else {
        // Contact already existed — look it up by phone
        const digits = from.replace(/\D/g, '');
        const last9  = digits.slice(-9);
        const [existing] = await this.db.query(
          `SELECT id, full_name AS name, email FROM contacts
           WHERE tenant_id = $1
             AND phone IS NOT NULL
             AND (phone = $2
               OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE $4)
           LIMIT 1`,
          [bot.tenant_id, from, digits, `%${last9}`],
        ).catch(() => [null]);
        if (existing) contact = existing;
      }

      if (contact) {
        this.callMeta.set(callSid, { contactId: contact.id, tenantId: bot.tenant_id, contactName: contact.name, botId });
        this.logger.log(`[callbot] Contact resolved for ${from}: ${contact.id}`);
      }
    }

    if (contact) {
      this.logger.log(`[callbot] Call ${callSid} identified contact "${contact.name}" (${contact.id}) transferred=${isTransferredCall}`);
    } else {
      this.logger.log(`[callbot] Call ${callSid} from ${from} — no CRM contact found (transferred=${isTransferredCall})`);
    }

    // Real-time mode (Media Streams): hand the call audio to our WebSocket.
    // Done AFTER contact resolution so callMeta carries the contact → the
    // conversation/call-log link to the right CRM contact, not "No contact".
    if (bot.streaming_mode) {
      const wssUrl = baseUrl.replace(/^http/i, 'ws') + '/call-bots/twilio/media-stream';
      return twiml(`
        <Connect>
          <Stream url="${wssUrl}">
            <Parameter name="botId" value="${botId}"/>
          </Stream>
        </Connect>
      `);
    }

    // Initialize conversation history with enriched system prompt
    if (bot.system_prompt) {
      const pc = bot.provider_config ?? {};
      const hasTransfer = !!(pc.transferToNumber ?? pc.transfer_to_number);

      // Load all context in parallel
      const [crmCtx, transferableQueues, prevLogs] = await Promise.all([
        this.getCrmCtx(bot.tenant_id),
        this.getQueues(botId, bot.tenant_id),
        (!isTransferredCall && from)
          ? this.db.query(
              `SELECT transcript FROM call_logs
               WHERE from_number = $1 AND transcript IS NOT NULL AND LENGTH(transcript) > 20
               ORDER BY started_at DESC LIMIT 2`,
              [from],
            ).catch(() => [])
          : Promise.resolve([]),
      ]);

      const contactLine = contact ? `CONTACTO IDENTIFICADO: ${contact.name}${contact.email ? ` (${contact.email})` : ''}.` : '';

      let memoryNote = '';
      if (prevLogs.length > 0) {
        const summaries = prevLogs.map((l: any, i: number) => `[Llamada anterior ${i + 1}]:\n${l.transcript}`).join('\n\n');
        memoryNote = `MEMORIA DE LLAMADAS ANTERIORES (mismo contacto):\n${summaries}`;
      }

      // Generate clean ASCII slugs for queue transfer
      const toSlug = (name: string) =>
        name.replace(/[^\w\s]/g, ' ').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');

      const queueLines = transferableQueues.map((q: any) => {
        const key = toSlug(q.bot_name);
        const label = q.bot_name.replace(/^[\p{Emoji}\s]+/u, '').trim();
        return `  - "${label}": escribe [QUEUE:${key}]`;
      }).join('\n');

      const addTagInstruction = crmCtx.tags.length
        ? `- add_tag: OBLIGATORIO — en cuanto identifiques la intención principal del cliente, aplica la etiqueta más apropiada de esta lista: ${crmCtx.tags.map((t: any) => t.name).join(', ')}. Úsala en el mismo turno en que queda clara la intención, no esperes al final de la llamada.`
        : `- add_tag: para etiquetar al contacto según el tema de la llamada.`;
      const crmInstructions = `HERRAMIENTAS CRM DISPONIBLES: Durante la llamada puedes usar las funciones del CRM de forma silenciosa sin mencionárselas al cliente.
- create_deal: cuando el cliente muestra interés, hace una reserva, o se cierra una venta.
- create_task: cuando el cliente pide que le llamen, pide que le dejen una nota, o necesita seguimiento. También úsalo si te piden "dejar una nota" o "recordatorio".
${addTagInstruction}
- update_deal: para actualizar un trato existente.${crmCtx.stages.length ? `\nEtapas de pipeline: ${crmCtx.stages.map((s: any) => s.pipeline_name ? `${s.name} (${s.pipeline_name})` : s.name).join(', ')}.` : ''}`;

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

    const welcomeText =
      bot.welcome_message ||
      (bot.language.startsWith('es') ? 'Hola, bienvenido. ¿En qué puedo ayudarte?' : 'Hello, how can I help you today?');
    const welcomeEl = await this.ttsElement(welcomeText, bot, callSid, baseUrl);

    return twiml(`
      <Gather input="speech" action="${gather}" timeout="6" speechTimeout="auto" language="${voice.language}">
        ${welcomeEl}
      </Gather>
      <Redirect method="POST">${gather}</Redirect>
    `);
  }

  // ── Gather handler (called every user turn) ───────────────────────────────────

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
    const bot = await this.getBot(botId);
    if (!bot) return twiml(`<Hangup/>`);

    const voice   = resolveVoice(bot.voice_type, bot.language);
    const gather  = `${baseUrl}/call-bots/twilio/${botId}/gather`;
    const keyword = (bot.handoff_keyword || 'agent').toLowerCase();
    const speech  = (speechResult || '').trim();

    // No speech captured → re-gather silently
    if (!speech) {
      const stillThereEl = await this.ttsElement(
        bot.language.startsWith('es') ? '¿Sigues ahí?' : 'Are you still there?',
        bot, callSid, baseUrl,
      );
      return twiml(`
        <Gather input="speech" action="${gather}" timeout="6" speechTimeout="auto" language="${voice.language}">
          ${stillThereEl}
        </Gather>
        <Hangup/>
      `);
    }

    this.callLastSeen.set(callSid, Date.now());

    // Append user turn to transcript
    const prevTranscript = this.callTranscripts.get(callSid) ?? '';
    this.callTranscripts.set(callSid, prevTranscript + `[Usuario]: ${speech}\n`);

    const pc = bot.provider_config ?? {};
    const { apiKey: aiApiKey, provider: aiProvider, model: aiPlatformModel } = await this.platformSettings.getAI();
    const transferToNum = pc.transferToNumber ?? pc.transfer_to_number ?? '';

    // Keyword fallback (only when no AI configured)
    const hasAi = !!aiApiKey;
    if (!hasAi && speech.toLowerCase().includes(keyword)) {
      this.callHistories.delete(callSid);
      await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
      const transferMsg = bot.language.startsWith('es') ? 'Un momento, te transfiero con un agente.' : 'One moment, transferring you.';
      const transferEl = await this.ttsElement(transferMsg, bot, callSid, baseUrl);
      if (transferToNum) {
        return twiml(`${transferEl}<Dial timeout="30" callerId="${bot.phone_number ?? ''}">${xe(transferToNum)}</Dial>`);
      }
      return twiml(`${transferEl}<Hangup/>`);
    }

    if (aiApiKey && bot.system_prompt) {
      // Parallel: load queues (cached) + RAG search — don't block on either
      const [transferableQueues, ragContext] = await Promise.all([
        this.getQueues(botId, bot.tenant_id),
        this.kbSvc.searchRelevantContext(botId, bot.tenant_id, speech).catch(() => ''),
      ]);

      const rawReply = await this.callAi(bot, callSid, speech, aiProvider, aiApiKey, aiPlatformModel, ragContext);
      if (rawReply) {
        const wantsTransfer  = rawReply.includes('[TRANSFER]');
        const wantsHangup    = rawReply.includes('[HANGUP]');
        const transferQueue  = this.extractQueueTag(rawReply);
        const cleanReply     = rawReply
          .replace(/\[TRANSFER\]/g, '').replace(/\[HANGUP\]/g, '').replace(/\[QUEUE:[^\]]+\]/g, '').trim();

        // Append bot turn to transcript
        this.callTranscripts.set(callSid, (this.callTranscripts.get(callSid) ?? '') + `[Bot]: ${cleanReply}\n`);

        // Transfer to another queue's bot
        if (transferQueue) {
          const destBotId = await this.resolveQueueBotId(bot.tenant_id, transferQueue, botId);
          this.logger.log(`[callbot] Queue transfer "${transferQueue}" → destBotId=${destBotId ?? 'NOT FOUND'}`);
          if (destBotId) {
            await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
            const destVoiceUrl = `${baseUrl}/call-bots/twilio/${destBotId}/voice`;
            const replyEl = await this.ttsElement(cleanReply, bot, callSid, baseUrl);
            return twiml(`${replyEl}<Redirect method="POST">${destVoiceUrl}</Redirect>`);
          }
          this.logger.warn(`[callbot] No bot found for queue "${transferQueue}", falling through`);
        }

        // Transfer: AI said [TRANSFER]
        if (wantsTransfer) {
          if (transferableQueues.length > 0) {
            const destBotName = await this.classifyQueueTransfer(bot, callSid, aiProvider, aiApiKey, aiPlatformModel, transferableQueues);
            this.logger.log(`[callbot] Two-step classification result: "${destBotName}"`);

            if (destBotName && destBotName !== 'human') {
              const toSlugLocal = (n: string) =>
                n.replace(/[^\w\s]/g, ' ').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
              const slug = toSlugLocal(destBotName);
              const destBotId = await this.resolveQueueBotId(bot.tenant_id, slug, botId);
              this.logger.log(`[callbot] Classified queue "${destBotName}" slug="${slug}" → destBotId=${destBotId ?? 'NOT FOUND'}`);
              if (destBotId) {
                await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
                const destVoiceUrl = `${baseUrl}/call-bots/twilio/${destBotId}/voice`;
                const classReplyEl = await this.ttsElement(cleanReply, bot, callSid, baseUrl);
                return twiml(`${classReplyEl}<Redirect method="POST">${destVoiceUrl}</Redirect>`);
              }
            }
          }

          if (transferToNum) {
            await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [botId]).catch(() => {});
            this.callHistories.delete(callSid);
            const humanReplyEl = await this.ttsElement(cleanReply, bot, callSid, baseUrl);
            return twiml(`${humanReplyEl}<Dial timeout="30" callerId="${bot.phone_number ?? ''}">${xe(transferToNum)}</Dial>`);
          }

          this.logger.warn(`[callbot] [TRANSFER] detected but no destination available, continuing`);
        }

        if (wantsHangup) {
          this.callHistories.delete(callSid);
          this.callTranscripts.delete(callSid);
          this.ttsFiles.delete(callSid);
          const hangupEl = await this.ttsElement(cleanReply, bot, callSid, baseUrl);
          return twiml(`${hangupEl}<Hangup/>`);
        }

        const replyEl = await this.ttsElement(cleanReply, bot, callSid, baseUrl);
        return twiml(`
          <Gather input="speech" action="${gather}" timeout="8" speechTimeout="auto" language="${voice.language}">
            ${replyEl}
          </Gather>
          <Redirect method="POST">${gather}</Redirect>
        `);
      }
    }

    // Fallback
    const fallbackText = bot.fallback_message || (bot.language.startsWith('es') ? 'Lo siento, no entendí. ¿Puedes repetirlo?' : 'I did not understand. Could you repeat that?');
    const fallbackEl = await this.ttsElement(fallbackText, bot, callSid, baseUrl);
    return twiml(`
      <Gather input="speech" action="${gather}" timeout="6" speechTimeout="auto" language="${voice.language}">
        ${fallbackEl}
      </Gather>
      <Hangup/>
    `);
  }

  private extractQueueTag(text: string): string | null {
    const m = text.match(/\[QUEUE:([^\]]+)\]/i);
    return m ? m[1].trim() : null;
  }

  private async resolveQueueBotId(tenantId: string, queueKey: string, excludeBotId: string): Promise<string | null> {
    const toSlug = (name: string) =>
      name.replace(/[^\w\s]/g, ' ').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');

    const bots = await this.db.query(
      `SELECT id, name FROM call_bots WHERE tenant_id = $1 AND status = 'active' AND id != $2`,
      [tenantId, excludeBotId],
    ).catch((e: any) => { this.logger.error(`[callbot] resolveQueueBotId error: ${e.message}`); return []; });

    const match = bots.find((b: any) => toSlug(b.name) === queueKey);
    return match?.id ?? null;
  }

  /**
   * Second AI call: classify which bot/queue the caller wants.
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
        const body = JSON.stringify({ model, messages: [{ role: 'user', content: classifyPrompt }], max_tokens: 20, temperature: 0 });
        const raw = await httpPost(
          'https://api.openai.com/v1/chat/completions',
          body,
          { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body).toString() },
        );
        reply = JSON.parse(raw).choices?.[0]?.message?.content?.trim() ?? null;

      } else if (provider === 'anthropic') {
        const model = platformModel || 'claude-haiku-4-5-20251001';
        const body = JSON.stringify({ model, messages: [{ role: 'user', content: classifyPrompt }], max_tokens: 20 });
        const raw = await httpPost(
          'https://api.anthropic.com/v1/messages',
          body,
          { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body).toString() },
        );
        reply = JSON.parse(raw).content?.[0]?.text?.trim() ?? null;

      } else if (provider === 'gemini') {
        const model = platformModel || 'gemini-1.5-flash';
        const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: classifyPrompt }] }], generationConfig: { maxOutputTokens: 20, temperature: 0 } });
        const raw = await httpPost(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          body,
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body).toString() },
        );
        reply = JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
      }

      if (!reply) return 'human';

      const replyLower = reply.toLowerCase();
      const matched = botNames.find((name) => replyLower.includes(name.toLowerCase()) || name.toLowerCase().includes(replyLower));
      this.logger.log(`[callbot classify] reply="${reply}" matched="${matched ?? 'none'}" options="${optionsList}"`);
      return matched ?? 'human';

    } catch (err) {
      this.logger.error(`[callbot classify] error: ${err}`);
      return 'human';
    }
  }

  // ── AI call with background tool execution ────────────────────────────────────

  /**
   * Calls the configured AI provider.
   *
   * Optimization: when the AI triggers CRM tools, the tools execute in the
   * background (fire-and-forget) while the bot immediately responds with a
   * short acknowledgment — eliminating the second AI round-trip (~1-2s saved).
   *
   * If the AI already included text content alongside the tool call (common
   * with GPT-4o and Claude), that text is used directly, making the response
   * feel natural without any template.
   */
  /**
   * Public entry for the Media Streams pipeline: text in → bot reply out.
   * Reuses the same LLM + tools + per-call history as the Gather flow.
   */
  /** Execute a Dentally tool synchronously and return what the bot should say. */
  private async runDentallyTool(tenantId: string, contactId: string | null, name: string, args: any): Promise<string> {
    try {
      if (name === 'dentally_list_practitioners') {
        return await this.integrations.botListPractitioners(tenantId, 'dentally');
      }
      if (name === 'dentally_check_availability') {
        return await this.integrations.botCheckAvailability(tenantId, 'dentally', { date: args?.date, practitionerName: args?.practitioner_name, durationMinutes: args?.duration });
      }
      if (name === 'dentally_book_appointment') {
        if (!contactId) return 'No pude identificar tu ficha para agendar la cita.';
        return await this.integrations.botBook(tenantId, 'dentally', { contactId, date: args?.date, time: args?.time, practitionerName: args?.practitioner_name, durationMinutes: args?.duration, reason: args?.reason, dateOfBirth: args?.date_of_birth, gender: args?.gender, title: args?.title });
      }
    } catch (e: any) {
      return `No pude completar la acción ahora mismo: ${e?.message || 'error'}.`;
    }
    return '';
  }

  async generateVoiceReply(
    bot: any,
    sessionId: string,
    userText: string,
    aiCfg: { apiKey: string; provider: string; model: string },
  ): Promise<{ text: string; hangup: boolean; transfer: boolean }> {
    if (!this.callHistories.has(sessionId)) {
      const isEs = bot.language?.startsWith('es') ?? true;
      const hangupRule = isEs
        ? '\n\nIMPORTANTE: Cuando el cliente se despida o dé por terminada la conversación (ej. "gracias, adiós", "eso es todo", "hasta luego"), responde una despedida breve y termina tu mensaje con [HANGUP].'
        : '\n\nIMPORTANT: When the caller says goodbye or ends the conversation, reply with a short farewell and end your message with [HANGUP].';
      this.callHistories.set(sessionId, [{ role: 'system', content: (bot.system_prompt ?? '') + hangupRule }]);
      // Keep the contact resolved by handleIncomingCall; only default if missing.
      if (!this.callMeta.has(sessionId)) {
        this.callMeta.set(sessionId, { contactId: null, tenantId: bot.tenant_id, botId: bot.id });
      }
    }
    // Build the transcript so the call_log + inbox conversation get saved on call end
    // (the status-callback finalizer reads callTranscripts[CallSid]).
    this.callTranscripts.set(sessionId, (this.callTranscripts.get(sessionId) ?? '') + `[Usuario]: ${userText}\n`);

    const rag = await this.kbSvc.searchRelevantContext(bot.id, bot.tenant_id, userText).catch(() => '');
    const raw = await this.callAi(bot, sessionId, userText, aiCfg.provider, aiCfg.apiKey, aiCfg.model, rag);
    if (!raw) {
      return { text: bot.fallback_message || (bot.language?.startsWith('es') ? 'Disculpa, ¿puedes repetir?' : 'Sorry, could you repeat that?'), hangup: false, transfer: false };
    }
    const hangup   = raw.includes('[HANGUP]');
    const transfer = raw.includes('[TRANSFER]');
    const text = raw.replace(/\[TRANSFER\]/g, '').replace(/\[HANGUP\]/g, '').replace(/\[QUEUE:[^\]]+\]/g, '').trim();
    this.callTranscripts.set(sessionId, (this.callTranscripts.get(sessionId) ?? '') + `[Bot]: ${text}\n`);
    return { text, hangup, transfer };
  }

  /** Release per-call memory when a streaming call ends. */
  endVoiceSession(sessionId: string) {
    this.callHistories.delete(sessionId);
    this.callMeta.delete(sessionId);
  }

  private async callAi(
    bot: any,
    callSid: string,
    userMessage: string,
    provider: string,
    apiKey: string,
    platformModel: string,
    ragContext = '',
  ): Promise<string | null> {
    const history: ChatMessage[] = this.callHistories.get(callSid) ?? [
      { role: 'system', content: bot.system_prompt ?? '' },
    ];

    const userContent = ragContext
      ? `[Contexto relevante de la base de conocimiento:\n${ragContext}]\n\n${userMessage}`
      : userMessage;
    history.push({ role: 'user', content: userContent });

    const meta    = this.callMeta.get(callSid);
    const tenantId = meta?.tenantId ?? bot.tenant_id;
    const crmCtx  = await this.getCrmCtx(tenantId);
    const dentallyConnected = await this.integrations.isConnected(tenantId, 'dentally').catch(() => false);
    const tools   = buildTools(
      crmCtx.stages.map((s: any) => s.pipeline_name ? `${s.name} (${s.pipeline_name})` : s.name),
      crmCtx.tags.map((t: any) => t.name),
      dentallyConnected,
    );

    const isEs = bot.language?.startsWith('es') ?? true;
    const langKey = isEs ? 'es' : 'en';

    /** Fire CRM tools in background without blocking voice response */
    const fireTools = (calls: Array<{ name: string; args: any }>) => {
      for (const { name, args } of calls) {
        this.botActions.executeTool(tenantId, meta?.contactId ?? null, name, args)
          .then((r) => this.logger.log(`[bot-action] ${name} → ${r}`))
          .catch((e) => this.logger.warn(`[bot-action] ${name} failed: ${e.message}`));
      }
    };

    /** Pick a TOOL_ACK template for the first tool called */
    const toolAck = (firstName: string): string =>
      TOOL_ACK[langKey]?.[firstName] ?? TOOL_ACK[langKey]?.default ?? 'Listo.';

    try {
      let reply: string | null = null;

      // ── OpenAI ──────────────────────────────────────────────────────────────
      if (provider === 'openai') {
        const model    = platformModel || 'gpt-4o-mini';
        const oaiTools = toOpenAITools(tools);

        const body1 = JSON.stringify({ model, messages: history, tools: oaiTools, tool_choice: 'auto', max_tokens: 120, temperature: 0.7 });
        const raw1  = await httpPost(
          'https://api.openai.com/v1/chat/completions',
          body1,
          { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body1).toString() },
        );
        const msg1 = JSON.parse(raw1).choices?.[0]?.message;

        if (msg1?.tool_calls?.length) {
          const calls = msg1.tool_calls.map((tc: any) => ({ name: tc.function.name, args: JSON.parse(tc.function?.arguments ?? '{}') }));
          const dentallyCall = calls.find((c: any) => c.name.startsWith('dentally_'));
          // CRM tools fire in background; Dentally tools run synchronously so the
          // bot speaks the real result (slots / booking confirmation).
          fireTools(calls.filter((c: any) => !c.name.startsWith('dentally_')));
          if (dentallyCall) {
            reply = await this.runDentallyTool(tenantId, meta?.contactId ?? null, dentallyCall.name, dentallyCall.args);
          } else {
            reply = msg1.content?.trim() || toolAck(calls[0]?.name ?? 'default');
          }
        } else {
          reply = msg1?.content?.trim() ?? null;
        }

      // ── Anthropic ────────────────────────────────────────────────────────────
      } else if (provider === 'anthropic') {
        const model     = platformModel || 'claude-haiku-4-5-20251001';
        const systemMsg = history.find((m) => m.role === 'system')?.content ?? '';
        const msgs      = history.filter((m) => m.role !== 'system');
        const anthTools = toAnthropicTools(tools);

        const body1 = JSON.stringify({ model, system: systemMsg, messages: msgs, tools: anthTools, max_tokens: 120 });
        const raw1  = await httpPost(
          'https://api.anthropic.com/v1/messages',
          body1,
          { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body1).toString() },
        );
        const json1 = JSON.parse(raw1);
        const textBlock  = (json1.content ?? []).find((b: any) => b.type === 'text');
        const toolBlocks = (json1.content ?? []).filter((b: any) => b.type === 'tool_use');

        if (toolBlocks.length) {
          const calls = toolBlocks.map((b: any) => ({ name: b.name, args: b.input ?? {} }));
          const dentallyCall = calls.find((c: any) => c.name.startsWith('dentally_'));
          fireTools(calls.filter((c: any) => !c.name.startsWith('dentally_')));
          if (dentallyCall) {
            reply = await this.runDentallyTool(tenantId, meta?.contactId ?? null, dentallyCall.name, dentallyCall.args);
          } else {
            reply = textBlock?.text?.trim() || toolAck(calls[0]?.name ?? 'default');
          }
        } else {
          reply = textBlock?.text?.trim() ?? null;
        }

      // ── Gemini ───────────────────────────────────────────────────────────────
      } else if (provider === 'gemini') {
        const model            = platformModel || 'gemini-1.5-flash';
        const systemInstruction = bot.system_prompt ? { parts: [{ text: bot.system_prompt }] } : undefined;
        const contents         = history
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const geminiTools = toGeminiTools(tools);

        const body1 = JSON.stringify({ systemInstruction, contents, tools: geminiTools, generationConfig: { maxOutputTokens: 120 } });
        const raw1  = await httpPost(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          body1,
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body1).toString() },
        );
        const json1  = JSON.parse(raw1);
        const parts1 = json1.candidates?.[0]?.content?.parts ?? [];
        const fnCall  = parts1.find((p: any) => p.functionCall);
        const textPart = parts1.find((p: any) => p.text);

        if (fnCall) {
          const name = fnCall.functionCall.name;
          const args = fnCall.functionCall.args ?? {};
          if (name.startsWith('dentally_')) {
            reply = await this.runDentallyTool(tenantId, meta?.contactId ?? null, name, args);
          } else {
            fireTools([{ name, args }]);
            reply = textPart?.text?.trim() || toolAck(name ?? 'default');
          }
        } else {
          reply = textPart?.text?.trim() ?? null;
        }
      }

      if (reply) {
        history.push({ role: 'assistant', content: reply });
        this.callHistories.set(callSid, history);
        this.logger.log(`[callbot AI] callSid=${callSid} turns=${history.length} reply="${reply.slice(0, 80)}"`);
      }

      return reply;
    } catch (err) {
      this.logger.error(`[callbot AI] callSid=${callSid} error: ${err}`);
      return null;
    }
  }

  // ── Status callback (call ended) ──────────────────────────────────────────────

  /**
   * Called by Twilio when a call ends (StatusCallback).
   * Saves a CallLog row and increments bot counters.
   */
  async handleStatus(botId: string, body: Record<string, string>): Promise<void> {
    const transcript = body.CallSid ? (this.callTranscripts.get(body.CallSid) ?? null) : null;
    const meta       = body.CallSid ? (this.callMeta.get(body.CallSid) ?? null) : null;
    const contactId  = meta?.contactId ?? null;

    if (body.CallSid) {
      this.callHistories.delete(body.CallSid);
      this.callTranscripts.delete(body.CallSid);
      this.callMeta.delete(body.CallSid);
      this.callLastSeen.delete(body.CallSid);
      const files = this.ttsFiles.get(body.CallSid) ?? [];
      files.forEach((f) => this.elevenLabs.cleanup(f));
      this.ttsFiles.delete(body.CallSid);
    }

    const terminalStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
    if (!terminalStatuses.includes(body.CallStatus)) return;

    const duration     = parseInt(body.CallDuration ?? '0', 10);
    const direction    = body.Direction === 'inbound' ? 'inbound' : 'outbound';
    const outcome      = body.CallStatus === 'completed' ? 'handled' : body.CallStatus === 'busy' ? 'abandoned' : 'failed';
    const recordingUrl = body.RecordingUrl ?? null;

    try {
      const [bot] = await this.db.query(
        `SELECT tenant_id, inbox_id, name FROM call_bots WHERE id = $1`,
        [botId],
      );
      const tenantId = meta?.tenantId ?? bot?.tenant_id ?? null;
      const inboxId  = bot?.inbox_id ?? null;

      let conversationId: string | null = null;
      if (inboxId && tenantId && body.CallStatus === 'completed') {
        try {
          const callerNumber = direction === 'inbound' ? (body.From ?? '') : (body.To ?? '');
          const subject      = `Llamada ${direction === 'inbound' ? 'entrante' : 'saliente'} — ${callerNumber}`;
          const noteBody     = [
            `📞 **Llamada de voz** vía bot "${bot?.name ?? botId}"`,
            `Duración: ${Math.floor(duration / 60)}m ${duration % 60}s`,
            `Número: ${callerNumber}`,
            transcript ? `\n**Transcript:**\n${transcript}` : '',
          ].filter(Boolean).join('\n');

          const [conv] = await this.db.query(
            `INSERT INTO conversations
               (tenant_id, inbox_id, contact_id, channel_type, status, subject, created_at, updated_at)
             VALUES ($1, $2, $3, 'phone', 'open', $4, NOW(), NOW())
             RETURNING id`,
            [tenantId, inboxId, contactId, subject],
          );
          conversationId = conv?.id ?? null;

          if (conversationId && noteBody) {
            await this.db.query(
              `INSERT INTO messages
                 (tenant_id, conversation_id, body, sender_type, direction, content_type, is_private, created_at)
               VALUES ($1, $2, $3, 'bot', 'inbound', 'text', false, NOW())`,
              [tenantId, conversationId, noteBody],
            );
          }

          this.logger.log(`[callbot] Created conversation ${conversationId} in inbox ${inboxId} for call ${body.CallSid}`);
        } catch (convErr) {
          this.logger.warn(`[callbot] Could not create conversation: ${convErr}`);
        }
      }

      await this.db.query(
        `INSERT INTO call_logs
           (tenant_id, bot_id, direction, from_number, to_number, duration, status, outcome, recording_url, transcript,
            contact_id, conversation_id, started_at, ended_at, created_at)
         VALUES (
           $11, $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $12,
           NOW() - ($5::int * INTERVAL '1 second'),
           NOW(), NOW()
         )`,
        [botId, direction, body.From ?? '', body.To ?? '', duration, body.CallStatus, outcome, recordingUrl, transcript,
         contactId, tenantId, conversationId],
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
