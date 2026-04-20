import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Task } from './entities/task.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TasksService extends BaseTenantService<Task> {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super(tasksRepo, auditService, eventEmitter);
  }

  findAll(tenantId: string) {
    return this.tasksRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}
