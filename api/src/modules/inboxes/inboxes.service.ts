import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Inbox } from './entities/inbox.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InboxesService extends BaseTenantService<Inbox> {
  constructor(
    @InjectRepository(Inbox)
    private readonly inboxesRepo: Repository<Inbox>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super(inboxesRepo, auditService, eventEmitter);
  }

  findAll(tenantId: string) {
    return this.inboxesRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }
}
