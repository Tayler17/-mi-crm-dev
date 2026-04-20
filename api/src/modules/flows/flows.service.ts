import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConversationFlow } from './flow.entity';

@Injectable()
export class FlowsService {
  constructor(
    @InjectRepository(ConversationFlow) private readonly repo: Repository<ConversationFlow>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string) {
    return this.db.query(
      `SELECT f.*,
              i.name AS inbox_name,
              u.full_name AS created_by_name,
              COUNT(s.id)::int AS total_sessions,
              COUNT(s.id) FILTER (WHERE s.status = 'active')::int AS active_sessions,
              COUNT(s.id) FILTER (WHERE s.status = 'completed')::int AS completed_sessions
       FROM conversation_flows f
       LEFT JOIN inboxes i ON i.id = f.inbox_id
       LEFT JOIN users u ON u.id = f.created_by
       LEFT JOIN flow_sessions s ON s.flow_id = f.id
       WHERE f.tenant_id = $1
       GROUP BY f.id, i.name, u.full_name
       ORDER BY f.created_at DESC`,
      [tenantId],
    );
  }

  async findOne(id: string, tenantId: string) {
    const flow = await this.repo.findOne({ where: { id, tenantId } });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  async create(dto: any, tenantId: string, userId: string) {
    const flow = this.repo.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      inboxId: dto.inboxId || undefined,
      triggerType: dto.triggerType ?? 'new_conversation',
      triggerValue: dto.triggerValue,
      steps: dto.steps ?? [],
      isActive: dto.isActive ?? false,
      createdBy: userId,
    });
    return this.repo.save(flow);
  }

  async update(id: string, dto: any, tenantId: string) {
    const flow = await this.findOne(id, tenantId);
    Object.assign(flow, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.inboxId !== undefined && { inboxId: dto.inboxId || null }),
      ...(dto.triggerType !== undefined && { triggerType: dto.triggerType }),
      ...(dto.triggerValue !== undefined && { triggerValue: dto.triggerValue }),
      ...(dto.steps !== undefined && { steps: dto.steps }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.repo.save(flow);
  }

  async remove(id: string, tenantId: string) {
    const flow = await this.findOne(id, tenantId);
    await this.repo.remove(flow);
  }

  async toggle(id: string, tenantId: string) {
    const flow = await this.findOne(id, tenantId);
    flow.isActive = !flow.isActive;
    await this.repo.save(flow);
    return { id, isActive: flow.isActive };
  }

  async duplicate(id: string, tenantId: string, userId: string) {
    const flow = await this.findOne(id, tenantId);
    const copy = this.repo.create({
      tenantId,
      name: `${flow.name} (copia)`,
      description: flow.description,
      inboxId: flow.inboxId,
      triggerType: flow.triggerType,
      triggerValue: flow.triggerValue,
      steps: flow.steps,
      isActive: false,
      createdBy: userId,
    });
    return this.repo.save(copy);
  }

  async getSessions(flowId: string, tenantId: string) {
    await this.findOne(flowId, tenantId);
    return this.db.query(
      `SELECT s.*, ct.full_name AS contact_name, ct.phone AS contact_phone
       FROM flow_sessions s
       LEFT JOIN contacts ct ON ct.id = s.contact_id
       WHERE s.flow_id = $1
       ORDER BY s.started_at DESC LIMIT 50`,
      [flowId],
    );
  }
}
