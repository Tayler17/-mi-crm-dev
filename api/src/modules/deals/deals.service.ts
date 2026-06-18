import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Deal } from './entities/deal.entity';
import { UpdateDealStageDto } from './dto/deal.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DealsService extends BaseTenantService<Deal> implements OnModuleInit {
  constructor(
    @InjectRepository(Deal)
    private readonly dealsRepo: Repository<Deal>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super(dealsRepo, auditService, eventEmitter);
  }

  async onModuleInit() {
    // "Fecha estimada de cierre" exists in the UI but had no column → deal edits
    // failed validation. Add it (no migrations in this project).
    await this.dealsRepo.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date DATE`).catch(() => {});
  }

  findAll(tenantId: string, options?: FindManyOptions<Deal>): Promise<Deal[]> {
    return this.dealsRepo.find({
      where: { tenantId },
      relations: ['stage', 'contact'],
      order: { createdAt: 'DESC' },
      take: 500,
      ...options,
    });
  }

  findOne(id: string, tenantId: string) {
    return this.dealsRepo.findOne({
      where: { id, tenantId },
      relations: ['stage', 'contact'],
    }).then(d => { if (!d) throw new (require('@nestjs/common').NotFoundException)('Deal not found'); return d; });
  }

  findForKanban(tenantId: string, pipelineId?: string) {
    return this.dealsRepo.query(
      `SELECT d.id, d.title, d.value, d.currency, d.status, d.priority, d.stage_id AS "stageId", d.created_at AS "createdAt",
        json_build_object('id', c.id, 'fullName', c.full_name, 'email', c.email) AS contact,
        json_build_object('id', ps.id, 'name', ps.name, 'position', ps.position, 'pipelineId', ps.pipeline_id) AS stage
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       WHERE d.tenant_id = $1
       ${pipelineId ? `AND ps.pipeline_id = '${pipelineId}'` : ''}
       AND d.status != 'lost'
       ORDER BY ps.position ASC NULLS LAST, d.created_at DESC
       LIMIT 500`,
      [tenantId],
    );
  }

  async updateStage(id: string, dto: UpdateDealStageDto, tenantId: string, userId?: string): Promise<Deal> {
    const deal = await this.dealsRepo.findOne({ where: { id, tenantId } });
    if (!deal) throw new (require('@nestjs/common').NotFoundException)('Deal not found');
    const oldStageId = deal.stageId;
    deal.stageId = dto.stageId;
    const saved = await this.dealsRepo.save(deal);
    await this.auditService.log({ tenantId, actorUserId: userId, entityType: 'Deal', entityId: id, action: 'STAGE_CHANGED', oldValues: { stageId: oldStageId }, newValues: { stageId: dto.stageId } });
    this.eventEmitter.emit('deal.stage_changed', { tenantId, userId, entityId: id, oldStageId, newStageId: dto.stageId });
    return saved;
  }
}
