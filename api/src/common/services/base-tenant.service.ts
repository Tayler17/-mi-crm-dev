import { Repository, FindManyOptions } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../modules/audit/audit.service';
import { BaseTenantEntity } from '../entities/base-tenant.entity';

export abstract class BaseTenantService<T extends BaseTenantEntity> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: Partial<T>, tenantId: string, userId?: string): Promise<T> {
    const entity = this.repository.create({ ...dto, tenantId, createdBy: userId } as any);
    const saved = await this.repository.save(entity as any);
    const entityName = this.repository.metadata.name;
    await this.auditService.log({
      tenantId,
      actorUserId: userId,
      entityType: entityName,
      entityId: (saved as any).id,
      action: 'CREATE',
      newValues: dto,
    });
    this.eventEmitter.emit(`${entityName.toLowerCase()}.created`, { tenantId, userId, entity: saved });
    return saved as T;
  }

  async findAll(tenantId: string, options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find({ where: { tenantId } as any, ...options });
  }

  async findOne(id: string, tenantId: string): Promise<T> {
    const entity = await this.repository.findOne({ where: { id, tenantId } as any });
    if (!entity) throw new NotFoundException(`Entity ${id} not found`);
    return entity;
  }

  async update(id: string, dto: Partial<T>, tenantId: string, userId?: string): Promise<T> {
    const entity = await this.findOne(id, tenantId);
    const oldValues = { ...entity };
    Object.assign(entity, dto);
    const saved = await this.repository.save(entity as any);
    const entityName = this.repository.metadata.name;
    await this.auditService.log({
      tenantId,
      actorUserId: userId,
      entityType: entityName,
      entityId: id,
      action: 'UPDATE',
      oldValues,
      newValues: dto,
    });
    this.eventEmitter.emit(`${entityName.toLowerCase()}.updated`, { tenantId, userId, entity: saved });
    return saved as T;
  }

  async remove(id: string, tenantId: string, userId?: string): Promise<void> {
    const entity = await this.findOne(id, tenantId);
    await this.repository.remove(entity as any);
    const entityName = this.repository.metadata.name;
    await this.auditService.log({
      tenantId,
      actorUserId: userId,
      entityType: entityName,
      entityId: id,
      action: 'DELETE',
      oldValues: entity,
    });
    this.eventEmitter.emit(`${entityName.toLowerCase()}.deleted`, { tenantId, userId, entityId: id });
  }
}
