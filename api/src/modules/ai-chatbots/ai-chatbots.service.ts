import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiChatbot } from './ai-chatbot.entity';

@Injectable()
export class AiChatbotsService implements OnModuleInit {
  constructor(
    @InjectRepository(AiChatbot) private readonly repo: Repository<AiChatbot>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async onModuleInit() {
    // Optional signature appended to the bot's messages (no migrations in this project).
    await this.db.query(`ALTER TABLE ai_chatbots ADD COLUMN IF NOT EXISTS signature text`).catch(() => {});
    // Temporary operational status note (one per tenant) — for same-day incidents
    // ("no route today", "van broke down") that must NOT live in permanent knowledge.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS chatbot_status_note (
        tenant_id uuid PRIMARY KEY,
        note text NOT NULL DEFAULT '',
        expires_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `).catch(() => {});
  }

  /** Temporary operational status note for this tenant (used by the chatbot engine). */
  async getStatusNote(tenantId: string) {
    const [row] = await this.db.query(
      `SELECT note, expires_at, updated_at FROM chatbot_status_note WHERE tenant_id=$1`,
      [tenantId],
    ).catch(() => []);
    return row ?? { note: '', expires_at: null, updated_at: null };
  }

  async saveStatusNote(tenantId: string, dto: { note?: string; expiresAt?: string | null }) {
    const note = String(dto.note ?? '').trim();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    await this.db.query(
      `INSERT INTO chatbot_status_note (tenant_id, note, expires_at, updated_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (tenant_id) DO UPDATE SET note=$2, expires_at=$3, updated_at=now()`,
      [tenantId, note, expiresAt],
    );
    return this.getStatusNote(tenantId);
  }

  async findAll(tenantId: string) {
    const rows = await this.db.query(
      `SELECT
         b.*,
         (SELECT COUNT(*)::int FROM ai_chatbot_sessions s WHERE s.chatbot_id = b.id AND s.status = 'active') AS active_sessions,
         (SELECT COUNT(*)::int FROM ai_chatbot_sessions s WHERE s.chatbot_id = b.id AND DATE(s.created_at) = CURRENT_DATE) AS sessions_today
       FROM ai_chatbots b
       WHERE b.tenant_id = $1
       ORDER BY b.created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const bot = await this.repo.findOne({ where: { id, tenant_id: tenantId } });
    if (!bot) throw new NotFoundException('AI Chatbot not found');
    return bot;
  }

  async create(dto: any, tenantId: string, userId: string) {
    const bot = this.repo.create({ ...dto, tenant_id: tenantId, created_by: userId });
    return this.repo.save(bot);
  }

  async update(id: string, dto: any, tenantId: string) {
    const bot = await this.findOne(id, tenantId);
    Object.assign(bot, dto);
    return this.repo.save(bot);
  }

  async remove(id: string, tenantId: string) {
    const bot = await this.findOne(id, tenantId);
    return this.repo.remove(bot);
  }

  async toggle(id: string, tenantId: string) {
    const bot = await this.findOne(id, tenantId);
    bot.status = bot.status === 'active' ? 'inactive' : 'active';
    return this.repo.save(bot);
  }

  async getSessions(id: string, tenantId: string) {
    return this.db.query(
      `SELECT
         s.*,
         json_build_object('id', c.id, 'fullName', c.full_name, 'email', c.email, 'phone', c.phone) AS contact
       FROM ai_chatbot_sessions s
       LEFT JOIN contacts c ON c.id = s.contact_id
       WHERE s.chatbot_id = $1 AND s.tenant_id = $2
       ORDER BY s.created_at DESC
       LIMIT 100`,
      [id, tenantId],
    );
  }

  async getStats(tenantId: string) {
    const [totals, byProvider, daily] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total_bots,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active_bots,
           SUM(total_conversations)::int AS total_conversations,
           SUM(handoff_count)::int AS total_handoffs
         FROM ai_chatbots WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT provider, COUNT(*)::int AS count
         FROM ai_chatbots WHERE tenant_id = $1
         GROUP BY provider`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('day', s.created_at), 'DD/MM') AS day,
           COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE s.status = 'handed_off')::int AS handoffs
         FROM ai_chatbot_sessions s
         JOIN ai_chatbots b ON b.id = s.chatbot_id
         WHERE b.tenant_id = $1 AND s.created_at > NOW() - INTERVAL '7 days'
         GROUP BY DATE_TRUNC('day', s.created_at)
         ORDER BY DATE_TRUNC('day', s.created_at)`,
        [tenantId],
      ),
    ]);
    return { ...totals[0], byProvider, daily };
  }

  async duplicate(id: string, tenantId: string, userId: string) {
    const bot = await this.findOne(id, tenantId);
    const { id: _id, created_at, updated_at, total_conversations, handoff_count, ...rest } = bot as any;
    const copy = this.repo.create({
      ...rest,
      name: `${bot.name} (copia)`,
      status: 'inactive',
      tenant_id: tenantId,
      created_by: userId,
    });
    return this.repo.save(copy);
  }
}
