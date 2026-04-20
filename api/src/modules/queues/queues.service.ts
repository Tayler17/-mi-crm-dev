import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Queue } from './queue.entity';

@Injectable()
export class QueuesService {
  constructor(
    @InjectRepository(Queue) private readonly repo: Repository<Queue>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string) {
    const rows = await this.db.query(
      `SELECT q.*,
              t.name AS team_name, t.color AS team_color,
              COUNT(c.id) FILTER (WHERE c.status = 'open') AS active_conversations
       FROM queues q
       LEFT JOIN teams t ON t.id = q.team_id
       LEFT JOIN conversations c ON c.queue_id = q.id
       WHERE q.tenant_id = $1
       GROUP BY q.id, t.name, t.color
       ORDER BY q.priority DESC, q.name`,
      [tenantId],
    );
    return rows.map((r: any) => ({
      ...r,
      isActive: r.is_active,
      activeConversations: parseInt(r.active_conversations, 10),
    }));
  }

  async findOne(id: string, tenantId: string) {
    const q = await this.repo.findOne({ where: { id, tenantId } });
    if (!q) throw new NotFoundException('Queue not found');
    return q;
  }

  async create(dto: any, tenantId: string) {
    const queue = this.repo.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      teamId: dto.teamId,
      inboxId: dto.inboxId,
      priority: dto.priority ?? 0,
      maxWaitMinutes: dto.maxWaitMinutes ?? 60,
    });
    return this.repo.save(queue);
  }

  async update(id: string, dto: any, tenantId: string) {
    const queue = await this.findOne(id, tenantId);
    Object.assign(queue, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.teamId !== undefined && { teamId: dto.teamId || null }),
      ...(dto.inboxId !== undefined && { inboxId: dto.inboxId || null }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.maxWaitMinutes !== undefined && { maxWaitMinutes: dto.maxWaitMinutes }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.repo.save(queue);
  }

  async remove(id: string, tenantId: string) {
    const queue = await this.findOne(id, tenantId);
    await this.repo.remove(queue);
  }

  // ── Conversation assignment ───────────────────────────────────────────────────

  async getConversations(queueId: string, tenantId: string) {
    await this.findOne(queueId, tenantId);
    return this.db.query(
      `SELECT c.id, c.status, c.created_at, c.assigned_user_id,
              ct.full_name AS contact_name, ct.phone AS contact_phone,
              u.full_name AS agent_name,
              i.name AS inbox_name
       FROM conversations c
       LEFT JOIN contacts ct ON ct.id = c.contact_id
       LEFT JOIN users u ON u.id = c.assigned_user_id
       LEFT JOIN inboxes i ON i.id = c.inbox_id
       WHERE c.queue_id = $1 AND c.tenant_id = $2
       ORDER BY c.created_at ASC`,
      [queueId, tenantId],
    );
  }

  async assignConversation(conversationId: string, dto: { queueId?: string; teamId?: string; userId?: string }, tenantId: string) {
    const result = await this.db.query(
      `UPDATE conversations
       SET queue_id = $2, team_id = $3, assigned_user_id = $4, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $5
       RETURNING id`,
      [conversationId, dto.queueId ?? null, dto.teamId ?? null, dto.userId ?? null, tenantId],
    );
    if (!result.length) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }
}
