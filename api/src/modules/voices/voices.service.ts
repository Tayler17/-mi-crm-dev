import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const SELECT_COLS = `
  id, name, description, language, gender,
  tts_provider  AS "ttsProvider",
  tts_voice_id  AS "ttsVoiceId",
  is_active     AS "isActive",
  sort_order    AS "sortOrder",
  created_at    AS "createdAt",
  updated_at    AS "updatedAt"
`;

@Injectable()
export class VoicesService implements OnModuleInit {
  private readonly logger = new Logger(VoicesService.name);
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Seed default Deepgram Aura-2 voices (used by the real-time Voice Agent) so the
   *  Voice Catalog isn't empty and tenants can pick one. Idempotent. */
  async onModuleInit() {
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

  async create(data: {
    name: string;
    description?: string;
    language: string;
    gender: string;
    ttsProvider: string;
    ttsVoiceId?: string;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<any> {
    const [v] = await this.db.query(
      `INSERT INTO voices (name, description, language, gender, tts_provider, tts_voice_id, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLS}`,
      [
        data.name,
        data.description ?? null,
        data.language ?? 'es-MX',
        data.gender ?? 'neutral',
        data.ttsProvider ?? 'twilio_basic',
        data.ttsVoiceId ?? '',
        data.isActive ?? true,
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
    sortOrder: number;
  }>): Promise<any> {
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
