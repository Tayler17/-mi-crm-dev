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
type CallMeta = { contactId: string | null; tenantId: string; contactName?: string | null; botId?: string; baseUrl?: string };

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
          notes:      { type: 'string',  description: 'IMPORTANT: include EVERY detail the caller gave during the call, organized and complete — names, full pickup AND destination addresses, item description, weight, dimensions, recipient name/phone/ID, payment method, dates, prices and any other specifics. Do not summarize away or drop details; this is the record the team works from.' },
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
      name: 'update_contact',
      description: 'Save the caller\'s details onto their CRM contact record. Call this AS SOON AS you learn the caller\'s name (so the contact is not left as just a phone number), and again if they give an email or address. Silent — do not mention it to the caller.',
      parameters: {
        type: 'object',
        properties: {
          name:    { type: 'string', description: 'Full name of the caller' },
          email:   { type: 'string', description: 'Caller email (optional)' },
          address: { type: 'string', description: 'Caller address, e.g. the pickup address (optional)' },
          notes:   { type: 'string', description: 'Other useful info about the contact (optional)' },
        },
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
      { name: 'dentally_check_availability', description: 'Check open appointment slots for a specific day the caller has chosen. Only call this AFTER the caller has told you a concrete date — never assume today. The result you receive is the real list of times — read it to the caller.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'The exact date the caller asked for, YYYY-MM-DD. Do not invent or default to today.' }, practitioner_name: { type: 'string', description: 'The practitioner the caller asked for, if any. Leave empty if the caller has no preference.' }, duration: { type: 'number' } }, required: ['date'] } },
      { name: 'dentally_get_appointments', description: "Look up the caller's own existing/upcoming appointments. Use when they ask things like \"what is my appointment\", \"when is my appointment\", \"which doctor do I have\", \"do I have an appointment booked\". Read the real result to the caller; never guess appointment details.", parameters: { type: 'object', properties: {} } },
      { name: 'dentally_book_appointment', description: 'Book an appointment as soon as the caller picks a day and time from the list — call this, do NOT re-check availability for the same date. If the caller says they are ALREADY a patient, try to book directly (the system finds them by their record); only if they are NOT a patient, first ask for date_of_birth (YYYY-MM-DD) and gender (male/female), then call this.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM 24h' }, practitioner_name: { type: 'string' }, duration: { type: 'number' }, reason: { type: 'string' }, date_of_birth: { type: 'string' }, gender: { type: 'string', enum: ['male', 'female'] }, title: { type: 'string' } }, required: ['date', 'time'] } },
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
  /** Expand symbols/abbreviations the TTS engines mispronounce (£, $, kg, km…)
   *  into spoken words, so "£50" is read "50 pounds" not "pound fifty". */
  private speakable(text: string, lang: string): string {
    const en = !(lang ?? '').startsWith('es');
    let t = text || '';
    const cur = (sym: string, e: string, s: string) => {
      // "£50" / "£ 50" → "50 pounds"; "50£" → "50 pounds"
      const word = en ? e : s;
      t = t.replace(new RegExp(`\\${sym}\\s?(\\d[\\d.,]*)`, 'g'), `$1 ${word}`);
      t = t.replace(new RegExp(`(\\d[\\d.,]*)\\s?\\${sym}`, 'g'), `$1 ${word}`);
    };
    cur('£', 'pounds', 'libras');
    cur('$', 'dollars', 'dólares');
    cur('€', 'euros', 'euros');
    // Units after a number: "5kg" / "5 kg" / "5KG" → "5 kilograms/kilogramos"
    const unit = (abbr: string, e: string, s: string) =>
      (t = t.replace(new RegExp(`(\\d[\\d.,]*)\\s?${abbr}\\b`, 'gi'), `$1 ${en ? e : s}`));
    unit('kg', 'kilograms', 'kilogramos');
    unit('km', 'kilometers', 'kilómetros');
    unit('cm', 'centimeters', 'centímetros');
    unit('mg', 'milligrams', 'miligramos');
    unit('ml', 'milliliters', 'mililitros');
    t = t.replace(/(\d[\d.,]*)\s?%/g, en ? '$1 percent' : '$1 por ciento');
    t = t.replace(/&/g, en ? ' and ' : ' y ');
    return t.replace(/\s{2,}/g, ' ').trim();
  }

  private async ttsElement(
    rawText: string,
    bot: any,
    callSid: string,
    baseUrl: string,
  ): Promise<string> {
    const text = this.speakable(rawText, bot.language);
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
      this.callMeta.set(callSid, { contactId: contact?.id ?? null, tenantId: bot.tenant_id, contactName: contact?.name, botId, baseUrl });
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
        this.callMeta.set(callSid, { contactId: contact.id, tenantId: bot.tenant_id, contactName: contact.name, botId, baseUrl });
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
    // Streaming is used when the bot has it on OR the platform forces it globally —
    // but ONLY if both required keys exist, so a misconfig falls back to Gather
    // instead of a broken (silent) call.
    let useStreaming = !!bot.streaming_mode;
    if (!useStreaming) {
      const globalOn = ((await this.platformSettings.get('call.streaming_global').catch(() => '')) as string) === 'on';
      if (globalOn) {
        const [dg, el] = await Promise.all([
          this.platformSettings.get('deepgram.api_key').catch(() => ''),
          this.platformSettings.get('elevenlabs.api_key').catch(() => ''),
        ]);
        useStreaming = !!dg && !!el;
        if (globalOn && !useStreaming) this.logger.warn('[callbot] streaming_global ON but Deepgram/ElevenLabs key missing → Gather fallback');
      }
    }
    if (useStreaming) {
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
      const [crmCtx, transferableQueues, prevLogs, dentallyOn] = await Promise.all([
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
        this.integrations.isConnected(bot.tenant_id, 'dentally').catch(() => false),
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

      // Current date + language + Dentally appointment protocol — without these the
      // model invents past dates (2023) and mishandles bookings on the voice path.
      const nowDt2 = new Date();
      const isEs2 = bot.language?.startsWith('es') ?? true;
      const dateRule2 = `FECHA Y HORA ACTUAL: ${nowDt2.toISOString().slice(0, 16).replace('T', ' ')} UTC (${nowDt2.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}). Usa SIEMPRE esta fecha para interpretar "hoy", "mañana", "el lunes". Nunca uses fechas de años anteriores; las citas son SIEMPRE a futuro respecto a esta fecha.`;
      const langRule2 = isEs2
        ? 'IDIOMA: Responde SIEMPRE en español, en TODOS tus mensajes. No mezcles inglés ni otros idiomas dentro de una respuesta.'
        : 'LANGUAGE: Always reply in English, in ALL your messages. Do not mix Spanish or other languages within a reply.';
      const apptRule2 = !dentallyOn ? '' : (isEs2
        ? 'PROTOCOLO DE CITAS: Para consultar disponibilidad lo ÚNICO obligatorio es la FECHA. Si el paciente quiere cita pero no dijo qué día, pregúntale qué día desea; NUNCA asumas la fecha de hoy. El profesional es OPCIONAL: solo úsalo si el paciente lo menciona; si no, deja practitioner_name vacío y consulta con todos. En cuanto el paciente elija un horario, agenda con dentally_book_appointment sin volver a consultar. NUNCA pidas la fecha de nacimiento, el género ni datos personales por teléfono: el paciente se identifica por su número de teléfono. Intenta agendar directamente; SOLO si dentally_book_appointment devuelve un error pidiendo esos datos, entonces pídelos.'
        : 'APPOINTMENT PROTOCOL: To check availability the ONLY required field is the DATE. If the patient wants an appointment but gave no day, ask which day; NEVER assume today. The practitioner is OPTIONAL: only use it if the patient mentions one, otherwise leave practitioner_name empty and check all. As soon as the patient picks a time, book with dentally_book_appointment without re-checking. NEVER ask for date of birth, gender or personal details over the phone: the patient is identified by their phone number. Try to book directly; ONLY if dentally_book_appointment returns an error asking for those details, then ask for them.');

      const instructions = [
        bot.system_prompt,
        dateRule2,
        langRule2,
        apptRule2,
        contactLine,
        memoryNote,
        crmInstructions,
        'ESTILO DE VOZ: Habla de forma natural y conversacional. Da respuestas COMPLETAS (puedes extenderte si el cliente pide detalle), pero nunca dejes una frase a medias: termina siempre tu idea. Cuando una explicación sea larga, divídela: cuenta una parte y haz una pausa preguntando si quiere que continúes o profundices, en vez de soltar un monólogo de un minuto seguido.',
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
      <Gather input="speech" enhanced="true" speechModel="phone_call" action="${gather}" timeout="6" speechTimeout="auto" language="${voice.language}">
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
        <Gather input="speech" enhanced="true" speechModel="phone_call" action="${gather}" timeout="6" speechTimeout="auto" language="${voice.language}">
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
      // Skip the knowledge-base lookup (an embeddings API call ~0.5-1s) for short
      // flow answers ("yes", "8 AM", a name, "Monday") — they never need KB context.
      const wordCount = speech.split(/\s+/).filter(Boolean).length;
      const useRag = wordCount >= 4;
      const tRag0 = Date.now();
      // Parallel: load queues (cached) + RAG search — don't block on either
      const [transferableQueues, ragContext] = await Promise.all([
        this.getQueues(botId, bot.tenant_id),
        useRag ? this.kbSvc.searchRelevantContext(botId, bot.tenant_id, speech).catch(() => '') : Promise.resolve(''),
      ]);
      const tRag = Date.now() - tRag0;

      const tAi0 = Date.now();
      const rawReply = await this.callAi(bot, callSid, speech, aiProvider, aiApiKey, aiPlatformModel, ragContext);
      this.logger.log(`[callbot perf] callSid=${callSid} rag=${tRag}ms(used=${useRag}) ai=${Date.now() - tAi0}ms`);
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

        const tTts0 = Date.now();
        const replyEl = await this.ttsElement(cleanReply, bot, callSid, baseUrl);
        this.logger.log(`[callbot perf] callSid=${callSid} tts=${Date.now() - tTts0}ms provider=${bot.tts_provider ?? 'twilio'}`);
        return twiml(`
          <Gather input="speech" enhanced="true" speechModel="phone_call" action="${gather}" timeout="8" speechTimeout="auto" language="${voice.language}">
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
      <Gather input="speech" enhanced="true" speechModel="phone_call" action="${gather}" timeout="6" speechTimeout="auto" language="${voice.language}">
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
  /** Cheap heuristic to detect the caller's language from their words, so Dentally
   *  tool messages match the language they're actually speaking this turn. */
  private detectLang(text: string, fallback: 'es' | 'en'): 'es' | 'en' {
    const t = (text || '').toLowerCase();
    if (/[ñ¿¡áéíóú]/.test(t)) return 'es';
    if (/\b(hola|gracias|cita|quiero|quisiera|necesito|por favor|s[ií]|d[ií]a|ma[ñn]ana|buenos|buenas|cu[áa]nto|cu[áa]ndo|d[óo]nde)\b/.test(t)) return 'es';
    if (/\b(hello|hi|thanks|thank|appointment|want|need|please|yes|today|tomorrow|morning|how much|when|where)\b/.test(t)) return 'en';
    return fallback;
  }

  /** Execute a Dentally tool synchronously and return what the bot should say. */
  private async runDentallyTool(tenantId: string, contactId: string | null, name: string, args: any, lang: 'es' | 'en' = 'es'): Promise<string> {
    const en = lang === 'en';
    try {
      if (name === 'dentally_list_practitioners') {
        return await this.integrations.botListPractitioners(tenantId, 'dentally', lang);
      }
      if (name === 'dentally_check_availability') {
        return await this.integrations.botCheckAvailability(tenantId, 'dentally', { date: args?.date, practitionerName: args?.practitioner_name, durationMinutes: args?.duration }, lang);
      }
      if (name === 'dentally_get_appointments') {
        return await this.integrations.botGetAppointments(tenantId, 'dentally', contactId, lang);
      }
      if (name === 'dentally_book_appointment') {
        if (!contactId) return en ? "I couldn't identify your record to book the appointment." : 'No pude identificar tu ficha para agendar la cita.';
        return await this.integrations.botBook(tenantId, 'dentally', { contactId, date: args?.date, time: args?.time, practitionerName: args?.practitioner_name, durationMinutes: args?.duration, reason: args?.reason, dateOfBirth: args?.date_of_birth, gender: args?.gender, title: args?.title }, lang);
      }
    } catch (e: any) {
      return en ? `I couldn't complete the action right now: ${e?.message || 'error'}.` : `No pude completar la acción ahora mismo: ${e?.message || 'error'}.`;
    }
    return '';
  }

  // ── Deepgram Voice Agent (real-time) ──────────────────────────────────────────

  /** Build the Deepgram Voice Agent "Settings" message for a bot/call. */
  async buildVoiceAgentSettings(bot: any, callSid: string): Promise<any> {
    const isEs = bot.language?.startsWith('es') ?? true;
    const meta = this.callMeta.get(callSid);
    const tenantId = meta?.tenantId ?? bot.tenant_id;

    const pc = bot.provider_config ?? {};
    const hasHumanTransfer = !!(pc.transferToNumber ?? pc.transfer_to_number);

    const [crmCtx, dentallyConnected, ai, transferableQueues] = await Promise.all([
      this.getCrmCtx(tenantId),
      this.integrations.isConnected(tenantId, 'dentally').catch(() => false),
      this.platformSettings.getAI().catch(() => ({ apiKey: '', provider: '', model: '' })),
      this.getQueues(bot.id, tenantId).catch(() => []),
    ]);
    const deptLabels: string[] = (transferableQueues as any[]).map((q) => q.bot_name).filter(Boolean);
    const tools = buildTools(
      crmCtx.stages.map((s: any) => (s.pipeline_name ? `${s.name} (${s.pipeline_name})` : s.name)),
      crmCtx.tags.map((t: any) => t.name),
      dentallyConnected,
    );
    // Client-side functions are defined WITHOUT an `endpoint` (Deepgram then sends
    // us a FunctionCallRequest). A `client_side` field here is NOT valid and makes
    // Deepgram reject the whole think config.
    const functions: any[] = tools.map((t) => ({
      name: t.name, description: t.description, parameters: t.parameters,
    }));
    // Lets the agent end the call when the conversation is over (the bridge hangs up).
    functions.push({
      name: 'end_call',
      description: isEs
        ? 'Finaliza la llamada cuando el cliente se despide o la conversación ha terminado. Despídete brevemente ANTES de llamarla.'
        : 'End the call when the caller says goodbye or the conversation is complete. Say a short farewell BEFORE calling it.',
      parameters: { type: 'object', properties: {} },
    });
    // Transfer to another department/bot of the same tenant (the bridge redirects the
    // live call to the destination bot's voice webhook).
    if (deptLabels.length) {
      functions.push({
        name: 'transfer_to_department',
        description: isEs
          ? 'Transfiere la llamada a otro departamento del negocio cuando el cliente necesita un área distinta. Di una frase breve de aviso ANTES de llamarla.'
          : 'Transfer the call to another department when the caller needs a different area. Say a short heads-up BEFORE calling it.',
        parameters: {
          type: 'object',
          properties: { department: { type: 'string', enum: deptLabels, description: isEs ? 'Nombre exacto del departamento de destino.' : 'Exact destination department name.' } },
          required: ['department'],
        },
      });
    }
    // Transfer to a human agent (dials the tenant's configured number).
    if (hasHumanTransfer) {
      functions.push({
        name: 'transfer_to_human',
        description: isEs
          ? 'Transfiere la llamada a un agente humano (persona real) cuando el cliente lo pide o el caso lo requiere. Di una frase breve de aviso ANTES de llamarla.'
          : 'Transfer the call to a human agent (real person) when the caller asks or the case requires it. Say a short heads-up BEFORE calling it.',
        parameters: { type: 'object', properties: {} },
      });
    }

    const nowDt = new Date();
    const dateRule = `FECHA Y HORA ACTUAL: ${nowDt.toISOString().slice(0, 16).replace('T', ' ')} UTC (${nowDt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}). Usa SIEMPRE esta fecha para "hoy"/"mañana". Nunca uses fechas de años anteriores; las citas son a futuro.`;
    const langRule = isEs
      ? 'IDIOMA: Responde SIEMPRE en español.'
      : 'LANGUAGE: Always reply in English.';
    const voiceRule = isEs
      ? 'ESTILO DE VOZ: Es una llamada. Responde en 1-2 frases cortas y deja hablar al cliente; no des monólogos.'
      : 'VOICE STYLE: This is a phone call. Reply in 1-2 short sentences and let the caller speak; no monologues.';
    const apptRule = !dentallyConnected ? '' : (isEs
      ? 'CITAS: Para disponibilidad lo único obligatorio es la FECHA; si no la dieron, pregúntala (nunca asumas hoy). El profesional es OPCIONAL. En cuanto elijan horario, agenda con dentally_book_appointment. No pidas datos personales por teléfono salvo que la herramienta los exija.'
      : 'APPOINTMENTS: The only required field for availability is the DATE; if not given, ask for it (never assume today). The practitioner is OPTIONAL. As soon as they pick a time, book with dentally_book_appointment. Do not ask for personal data over the phone unless the tool requires it.');
    const hangupRule = isEs
      ? 'FINALIZAR LLAMADA: Cuando el cliente se despida o la conversación haya terminado (ej. "gracias, adiós", "eso es todo", "nada más"), di UNA frase corta de despedida y a continuación LLAMA SIEMPRE a la función end_call para colgar. No te quedes en silencio esperando.'
      : 'ENDING THE CALL: When the caller says goodbye or the conversation is over (e.g. "thanks, bye", "that\'s all", "nothing else"), say ONE short farewell and then ALWAYS call the end_call function to hang up. Do not stay silent waiting.';
    const deptRule = deptLabels.length
      ? (isEs
          ? `TRANSFERIR A OTRO DEPARTAMENTO: Solo si el cliente necesita un ÁREA DE NEGOCIO distinta (ventas, soporte, etc.), di una frase breve ("Te paso ahora con el departamento de X") y llama a transfer_to_department con el nombre exacto. Departamentos: ${deptLabels.join(', ')}. NUNCA uses transfer_to_department por un tema de idioma.`
          : `TRANSFER TO ANOTHER DEPARTMENT: Only if the caller needs a different BUSINESS AREA (sales, support, etc.), say a short heads-up ("Let me put you through to X") and call transfer_to_department with the exact name. Departments: ${deptLabels.join(', ')}. NEVER use transfer_to_department for a language issue.`)
      : '';
    const humanRule = hasHumanTransfer
      ? (isEs
          ? 'TRANSFERIR A UN HUMANO: Si el cliente pide hablar con una persona real (o el caso lo requiere), di una frase breve ("Te paso con un agente, un momento") y llama a la función transfer_to_human.'
          : 'TRANSFER TO A HUMAN: If the caller asks to speak with a real person (or the case requires it), say a short heads-up ("Let me put you through to an agent, one moment") and call transfer_to_human.')
      : '';
    // A caller asking to be helped in a language this bot doesn't speak must go to a
    // HUMAN, never to another bot/department.
    const langTransferRule = hasHumanTransfer
      ? (isEs
          ? 'IDIOMA DEL CLIENTE: Si el cliente pide ser atendido en otro idioma que no manejas (p. ej. te piden inglés), NO lo transfieras a un departamento ni a otro bot: transfiérelo a un agente humano con transfer_to_human.'
          : 'CALLER LANGUAGE: If the caller asks to be helped in another language you do not handle (e.g. they ask for Spanish), do NOT transfer them to a department or another bot: transfer them to a human agent with transfer_to_human.')
      : '';
    const prompt = [bot.system_prompt ?? '', dateRule, langRule, voiceRule, apptRule, langTransferRule, deptRule, humanRule, hangupRule].filter(Boolean).join('\n\n');

    // Use the Aura voice the tenant picked in the Voice Catalog (getBot resolves
    // voice_catalog_id → tts_provider/tts_voice_id); else the catalog's default voice
    // for this language (owner-marked in the Voice Catalog); else a hardcoded fallback.
    let speakModel = (bot.tts_provider === 'deepgram' && /^aura/i.test(bot.tts_voice_id || '')) ? bot.tts_voice_id : null;
    if (!speakModel) {
      const fam = (isEs ? 'es' : 'en') + '%';
      const [def] = await this.db.query(
        `SELECT tts_voice_id FROM voices
          WHERE is_default = true AND tts_provider = 'deepgram'
            AND language LIKE $1 AND COALESCE(tts_voice_id,'') <> ''
          LIMIT 1`,
        [fam],
      ).catch(() => [null]);
      speakModel = def?.tts_voice_id || (isEs ? 'aura-2-celeste-es' : 'aura-2-thalia-en');
    }
    const greeting = bot.welcome_message || (isEs ? 'Hola, gracias por llamar. ¿En qué puedo ayudarte?' : 'Hello, thanks for calling. How can I help you?');

    return {
      type: 'Settings',
      audio: {
        input:  { encoding: 'mulaw', sample_rate: 8000 },
        output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
      },
      agent: {
        language: isEs ? 'es' : 'en',
        listen: { provider: { type: 'deepgram', model: 'nova-3' } },
        think:  {
          provider: { type: 'open_ai', model: 'gpt-4o-mini', temperature: 0.7 },
          // Use OUR OpenAI key so the LLM does NATIVE tool-calling. With Deepgram's
          // managed LLM the model wrote "functions.end_call()" as text instead of
          // emitting a real FunctionCallRequest, so no function ever ran.
          ...(ai.provider === 'openai' && ai.apiKey
            ? { endpoint: { url: 'https://api.openai.com/v1/chat/completions', headers: { authorization: `Bearer ${ai.apiKey}` } } }
            : {}),
          prompt,
          ...(functions.length ? { functions } : {}),
        },
        speak:  { provider: { type: 'deepgram', model: speakModel } },
        greeting,
      },
    };
  }

  /** Execute a tool requested by the Voice Agent and return the string result. */
  async runVoiceAgentFunction(bot: any, callSid: string, name: string, args: any): Promise<string> {
    const meta = this.callMeta.get(callSid);
    const tenantId = meta?.tenantId ?? bot.tenant_id;
    const contactId = meta?.contactId ?? null;
    if (name.startsWith('dentally_')) {
      const lang: 'es' | 'en' = (bot.language?.startsWith('es') ?? true) ? 'es' : 'en';
      return this.runDentallyTool(tenantId, contactId, name, args, lang);
    }
    try {
      const r: any = await this.botActions.executeTool(tenantId, contactId, name, args);
      return typeof r === 'string' ? r : (r?.message ?? 'OK');
    } catch (e: any) {
      return `No pude completar la acción: ${e?.message || 'error'}.`;
    }
  }

  /** Append a line to the call transcript (so the call_log/inbox is saved on hangup). */
  appendCallTranscript(callSid: string, role: 'user' | 'bot', text: string) {
    const tag = role === 'user' ? 'Usuario' : 'Bot';
    this.callTranscripts.set(callSid, (this.callTranscripts.get(callSid) ?? '') + `[${tag}]: ${text}\n`);
  }

  /** End an active Twilio call via REST (closing the media-stream WS alone doesn't
   *  reliably hang up the PSTN leg). */
  async hangupCall(callSid: string): Promise<void> {
    try {
      const { accountSid, authToken } = await this.platformSettings.getVoice();
      if (!accountSid || !authToken || !callSid) return;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const body = 'Status=completed';
      await httpPost(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        body,
        { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body).toString() },
      );
      this.logger.log(`[callbot] hung up call ${callSid} via REST`);
    } catch (e: any) {
      this.logger.warn(`[callbot] hangupCall failed: ${e?.message}`);
    }
  }

  /** Transfer an active Voice-Agent call via Twilio REST (redirect the live call):
   *   • kind 'department' → redirect to the destination bot's voice webhook.
   *   • kind 'human'      → replace TwiML with a <Dial> to the configured number.
   *  Returns true on success. The caller should clean up the media-stream after. */
  async transferCall(callSid: string, bot: any, target: { kind: 'human' | 'department'; department?: string }): Promise<boolean> {
    try {
      const { accountSid, authToken } = await this.platformSettings.getVoice();
      if (!accountSid || !authToken || !callSid) { this.logger.warn('[callbot] transferCall: missing Twilio creds or callSid'); return false; }

      let param: { key: 'Twiml' | 'Url'; value: string } | null = null;

      if (target.kind === 'department' && target.department) {
        const toSlug = (n: string) => n.replace(/[^\w\s]/g, ' ').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
        const destBotId = await this.resolveQueueBotId(bot.tenant_id, toSlug(target.department), bot.id);
        if (!destBotId) { this.logger.warn(`[callbot] transfer: department "${target.department}" not resolved`); return false; }
        const baseUrl = this.callMeta.get(callSid)?.baseUrl || process.env.TWILIO_WEBHOOK_BASE_URL || '';
        if (!baseUrl) { this.logger.warn('[callbot] transfer: no baseUrl available'); return false; }
        await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [bot.id]).catch(() => {});
        param = { key: 'Url', value: `${baseUrl}/call-bots/twilio/${destBotId}/voice` };
      } else if (target.kind === 'human') {
        const pc = bot.provider_config ?? {};
        const num = pc.transferToNumber ?? pc.transfer_to_number ?? '';
        if (!num) { this.logger.warn('[callbot] transfer: no human number configured'); return false; }
        await this.db.query(`UPDATE call_bots SET transferred_calls=transferred_calls+1, updated_at=NOW() WHERE id=$1`, [bot.id]).catch(() => {});
        const callerId = bot.phone_number ?? '';
        param = { key: 'Twiml', value: `<Response><Dial timeout="30"${callerId ? ` callerId="${xe(callerId)}"` : ''}>${xe(num)}</Dial></Response>` };
      }
      if (!param) return false;

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const usp = new URLSearchParams();
      usp.set(param.key, param.value);
      if (param.key === 'Url') usp.set('Method', 'POST');
      const body = usp.toString();
      await httpPost(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        body,
        { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body).toString() },
      );
      this.logger.log(`[callbot] transferred call ${callSid} → ${target.kind}${target.department ? ` (${target.department})` : ''} via REST`);
      return true;
    } catch (e: any) {
      this.logger.warn(`[callbot] transferCall failed: ${e?.message}`);
      return false;
    }
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
      const nowDt = new Date();
      const dateRule = `\n\nFECHA Y HORA ACTUAL: ${nowDt.toISOString().slice(0, 16).replace('T', ' ')} UTC (${nowDt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}). Usa SIEMPRE esta fecha para interpretar "hoy", "mañana", "el lunes". Nunca uses fechas de años anteriores; las citas son siempre a futuro.`;
      // When Dentally is connected, give the bot a strict appointment protocol so it
      // stops auto-checking availability for "today" with a default doctor.
      const dentallyOn = await this.integrations.isConnected(bot.tenant_id, 'dentally').catch(() => false);
      const apptRule = !dentallyOn ? '' : (isEs
        ? '\n\nPROTOCOLO DE CITAS: Para consultar disponibilidad lo ÚNICO obligatorio es la FECHA. Si el paciente quiere cita pero no dijo qué día, pregúntale qué día desea; NUNCA asumas la fecha de hoy. El profesional es OPCIONAL: solo usa un profesional si el paciente lo menciona; si no menciona ninguno, NO preguntes por el profesional y consulta la disponibilidad con todos (deja practitioner_name vacío). Llama a dentally_check_availability en cuanto tengas la fecha. Lee únicamente los horarios reales que devuelva la herramienta; nunca inventes horarios ni digas que no hay disponibilidad sin haber llamado a la herramienta con la fecha que pidió el paciente.'
        : '\n\nAPPOINTMENT PROTOCOL: To check availability the ONLY required field is the DATE. If the patient wants an appointment but did not give a day, ask which day they want; NEVER assume today\'s date. The practitioner is OPTIONAL: only use a practitioner if the patient mentions one; if they don\'t, do NOT ask about the practitioner and check availability across all of them (leave practitioner_name empty). Call dentally_check_availability as soon as you have the date. Read only the real times the tool returns; never invent times or say there is no availability without having called the tool with the date the patient requested.');
      // Stable single-language: always reply in the bot's configured language so a
      // stray mis-transcription never makes the bot flip languages mid-call.
      const langRule = isEs
        ? '\n\nIDIOMA: Responde SIEMPRE en español, en todos tus mensajes. No te pases al inglés aunque una frase suene en otro idioma.'
        : '\n\nLANGUAGE: Always reply in English, in every message. Do not switch to Spanish even if a phrase sounds like another language.';
      // CRITICAL for voice turn-taking: short replies. While the bot talks, the
      // caller's speech is ignored — long monologues feel like "it won't listen".
      const voiceStyleRule = isEs
        ? '\n\nESTILO DE VOZ (MUY IMPORTANTE): Es una llamada telefónica. Responde MUY breve: 1 o 2 frases cortas como máximo, y termina haciendo UNA pregunta o pausa para que el cliente hable. NUNCA des explicaciones largas de un tirón; si hay mucho que contar, di una frase y pregunta "¿quieres que te dé más detalle?". Habla como una persona, no como un folleto.'
        : '\n\nVOICE STYLE (VERY IMPORTANT): This is a phone call. Reply VERY briefly: 1-2 short sentences max, then ask ONE question or pause so the caller can speak. NEVER give long explanations in one go; if there is a lot to say, give one sentence and ask "would you like more detail?". Talk like a person, not a brochure.';
      this.callHistories.set(sessionId, [{ role: 'system', content: (bot.system_prompt ?? '') + dateRule + apptRule + langRule + voiceStyleRule + hangupRule }]);
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
    const [crmCtx, dentallyConnected] = await Promise.all([
      this.getCrmCtx(tenantId),
      this.integrations.isConnected(tenantId, 'dentally').catch(() => false),
    ]);
    const tools   = buildTools(
      crmCtx.stages.map((s: any) => s.pipeline_name ? `${s.name} (${s.pipeline_name})` : s.name),
      crmCtx.tags.map((t: any) => t.name),
      dentallyConnected,
    );

    const isEs = bot.language?.startsWith('es') ?? true;
    // Tool/Dentally messages follow the bot's configured language (stable; no
    // flipping from stray mis-transcriptions).
    const langKey: 'es' | 'en' = isEs ? 'es' : 'en';

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

        const body1 = JSON.stringify({ model, messages: history, tools: oaiTools, tool_choice: 'auto', max_tokens: 300, temperature: 0.7 });
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
            reply = await this.runDentallyTool(tenantId, meta?.contactId ?? null, dentallyCall.name, dentallyCall.args, langKey);
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

        const body1 = JSON.stringify({ model, system: systemMsg, messages: msgs, tools: anthTools, max_tokens: 300 });
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
            reply = await this.runDentallyTool(tenantId, meta?.contactId ?? null, dentallyCall.name, dentallyCall.args, langKey);
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

        const body1 = JSON.stringify({ systemInstruction, contents, tools: geminiTools, generationConfig: { maxOutputTokens: 300 } });
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
            reply = await this.runDentallyTool(tenantId, meta?.contactId ?? null, name, args, langKey);
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
