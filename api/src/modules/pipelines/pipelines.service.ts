import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Pipeline } from './entities/pipeline.entity';
import { PipelineStage } from './entities/pipeline-stage.entity';
import { AuditService } from '../audit/audit.service';
import { CreateStageDto, UpdateStageDto } from './dto/pipeline.dto';

@Injectable()
export class PipelinesService extends BaseTenantService<Pipeline> {
  constructor(
    @InjectRepository(Pipeline)
    private readonly pipelineRepo: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private readonly stageRepo: Repository<PipelineStage>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super(pipelineRepo, auditService, eventEmitter);
  }

  findAll(tenantId: string) {
    return this.pipelineRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  findStages(pipelineId: string, tenantId: string) {
    return this.stageRepo.find({
      where: { pipelineId, tenantId },
      order: { position: 'ASC' },
    });
  }

  async createStage(pipelineId: string, dto: CreateStageDto, tenantId: string, userId?: string): Promise<PipelineStage> {
    const count = await this.stageRepo.count({ where: { pipelineId, tenantId } });
    const stage = this.stageRepo.create({
      pipelineId,
      tenantId,
      name: dto.name,
      position: dto.position !== undefined ? dto.position : count,
      createdBy: userId,
    });
    return this.stageRepo.save(stage);
  }

  async updateStage(pipelineId: string, stageId: string, dto: UpdateStageDto, tenantId: string): Promise<PipelineStage> {
    const stage = await this.stageRepo.findOne({ where: { id: stageId, pipelineId, tenantId } });
    if (!stage) throw new NotFoundException('Stage not found');
    Object.assign(stage, dto);
    return this.stageRepo.save(stage);
  }

  async deleteStage(pipelineId: string, stageId: string, tenantId: string): Promise<void> {
    const stage = await this.stageRepo.findOne({ where: { id: stageId, pipelineId, tenantId } });
    if (!stage) throw new NotFoundException('Stage not found');
    await this.stageRepo.remove(stage);
  }
}
