import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { PlatformSettingsService } from '../settings/platform-settings.service';

const SELECT_COLS = `
  id, name, description, language, gender,
  tts_provider  AS "ttsProvider",
  tts_voice_id  AS "ttsVoiceId",
  is_active     AS "isActive",
  is_default    AS "isDefault",
  sort_order    AS "sortOrder",
  created_at    AS "createdAt",
  updated_at    AS "updatedAt"
`;

@Injectable()
export class VoicesService implements OnModuleInit {
  private readonly logger = new Logger(VoicesService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Generate (or serve from cache) a short audio sample for a Deepgram Aura voice,
   *  so owners/tenants can preview it before assigning. Cached on disk per voice model
   *  → Deepgram is hit only the FIRST time each voice is previewed. */
  async getPreviewAudio(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    const voice = await this.findOne(id); // 404 if missing
    const model = String(voice.ttsVoiceId || '');
    if (voice.ttsProvider !== 'deepgram' || !/^aura/i.test(model)) {
      throw new BadRequestException('La previsualización solo está disponible para voces Deepgram Aura.');
    }
    const dir = join(process.cwd(), 'uploads', 'voice-previews');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, `${model.replace(/[^\w.-]/g, '_')}.wav`);
    if (existsSync(file)) {
      return { buffer: readFileSync(file), contentType: 'audio/wav' };
    }
    const key = (await this.platformSettings.get('deepgram.api_key').catch(() => '')) as string;
    if (!key) throw new BadRequestException('Falta la API Key de Deepgram en Ajustes → Plataforma.');
    const isEs = String(voice.language || '').toLowerCase().startsWith('es');
    const text = isEs
      ? 'Hola, soy tu asistente de AutoMarkIQ. ¿En qué puedo ayudarte hoy?'
      : 'Hi, I am your AutoMarkIQ assistant. How can I help you today?';
    const res = await axios.post(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=linear16&container=wav&sample_rate=24000`,
      { text },
      { headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 15000 },
    );
    const buffer = Buffer.from(res.data);
    try { writeFileSync(file, buffer); } catch { /* cache best-effort */ }
    return { buffer, contentType: 'audio/wav' };
  }

  /** Seed default Deepgram Aura-2 voices (used by the real-time Voice Agent) so the
   *  Voice Catalog isn't empty and tenants can pick one. Idempotent. */
  async onModuleInit() {
    await this.db.query(`ALTER TABLE voices ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false`).catch(() => {});
    const defaults = [
      { name: 'Celeste — Español (femenina)', language: 'es', gender: 'female', ttsVoiceId: 'aura-2-celeste-es', sortOrder: 1 },
      { name: 'Diana — Español (femenina)',   language: 'es', gender: 'female', ttsVoiceId: 'aura-2-diana-es',   sortOrder: 2 },
      { name: 'Javier — Español (masculino)', language: 'es', gender: 'male',   ttsVoiceId: 'aura-2-javier-es',  sortOrder: 3 },
      { name: 'Álvaro — Español (masculino)', language: 'es', gender: 'male',   ttsVoiceId: 'aura-2-alvaro-es',  sortOrder: 4 },
      { name: 'Thalia — English (female)',    language: 'en', gender: 'female', ttsVoiceId: 'aura-2-thalia-en',  sortOrder: 5 },
      { name: 'Andromeda — English (female)', language: 'en', gender: 'female', ttsVoiceId: 'aura-2-andromeda-en', sortOrder: 6 },
      { name: 'Apollo — English (male)',      language: 'en', gender: 'male',   ttsVoiceId: 'aura-2-apollo-en',  sortOrder: 7 },
    ];
    try {
      for (const d of defaults) {
        const [exists] = await this.db.query(`SELECT id FROM voices WHERE tts_voice_id=$1 LIMIT 1`, [d.ttsVoiceId]).catch(() => [null]);
        if (!exists) await this.create({ ...d, ttsProvider: 'deepgram', isActive: true }).catch(() => {});
      }
    } catch (e: any) { this.logger.warn(`voice seed skipped: ${e?.message}`); }
  }

  async findAll(): Promise<any[]> {
    return this.db.query(`SELECT ${SELECT_COLS} FROM voices ORDER BY sort_order ASC, name ASC`);
  }

  async findOne(id: string): Promise<any> {
    const [v] = await this.db.query(`SELECT ${SELECT_COLS} FROM voices WHERE id = $1`, [id]);
    if (!v) throw new NotFoundException('Voice not found');
    return v;
  }

  /** Only one default voice per language family (es / en). Unset the others. */
  private async clearDefaults(language: string, exceptId?: string) {
    const fam = (language || '').slice(0, 2) + '%';
    await this.db.query(
      `UPDATE voices SET is_default=false WHERE language LIKE $1 AND is_default=true${exceptId ? ' AND id<>$2' : ''}`,
      exceptId ? [fam, exceptId] : [fam],
    ).catch(() => {});
  }

  async create(data: {
    name: string;
    description?: string;
    language: string;
    gender: string;
    ttsProvider: string;
    ttsVoiceId?: string;
    isActive?: boolean;
    isDefault?: boolean;
    sortOrder?: number;
  }): Promise<any> {
    if (data.isDefault) await this.clearDefaults(data.language ?? 'es');
    const [v] = await this.db.query(
      `INSERT INTO voices (name, description, language, gender, tts_provider, tts_voice_id, is_active, is_default, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLS}`,
      [
        data.name,
        data.description ?? null,
        data.language ?? 'es-MX',
        data.gender ?? 'neutral',
        data.ttsProvider ?? 'twilio_basic',
        data.ttsVoiceId ?? '',
        data.isActive ?? true,
        data.isDefault ?? false,
        data.sortOrder ?? 0,
      ],
    );
    return v;
  }

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    language: string;
    gender: string;
    ttsProvider: string;
    ttsVoiceId: string;
    isActive: boolean;
    isDefault: boolean;
    sortOrder: number;
  }>): Promise<any> {
    // Marking as default: unset other defaults of the same language family first.
    if (data.isDefault === true) {
      const lang = data.language ?? (await this.findOne(id)).language ?? 'es';
      await this.clearDefaults(lang, id);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name        !== undefined) { fields.push(`name=$${idx++}`);         values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description=$${idx++}`);   values.push(data.description); }
    if (data.language    !== undefined) { fields.push(`language=$${idx++}`);      values.push(data.language); }
    if (data.gender      !== undefined) { fields.push(`gender=$${idx++}`);        values.push(data.gender); }
    if (data.ttsProvider !== undefined) { fields.push(`tts_provider=$${idx++}`);  values.push(data.ttsProvider); }
    if (data.ttsVoiceId  !== undefined) { fields.push(`tts_voice_id=$${idx++}`);  values.push(data.ttsVoiceId); }
    if (data.isActive    !== undefined) { fields.push(`is_active=$${idx++}`);     values.push(data.isActive); }
    if (data.isDefault   !== undefined) { fields.push(`is_default=$${idx++}`);    values.push(data.isDefault); }
    if (data.sortOrder   !== undefined) { fields.push(`sort_order=$${idx++}`);    values.push(data.sortOrder); }

    if (!fields.length) return this.findOne(id);
    values.push(id);

    const [v] = await this.db.query(
      `UPDATE voices SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING ${SELECT_COLS}`,
      values,
    );
    if (!v) throw new NotFoundException('Voice not found');
    return v;
  }

  async remove(id: string): Promise<void> {
    await this.db.query(`DELETE FROM voices WHERE id = $1`, [id]);
  }
}
