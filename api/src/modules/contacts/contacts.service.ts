import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Contact } from './entities/contact.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ContactsService extends BaseTenantService<Contact> {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super(contactsRepo, auditService, eventEmitter);
  }

  findAll(tenantId: string) {
    return this.contactsRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}
