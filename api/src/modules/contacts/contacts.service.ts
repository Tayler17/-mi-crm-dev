import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, FindManyOptions, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Contact } from './entities/contact.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ContactsService extends BaseTenantService<Contact> implements OnModuleInit {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
    @InjectDataSource() private readonly ds: DataSource,
  ) {
    super(contactsRepo, auditService, eventEmitter);
  }

  async onModuleInit() {
    // Contact identity columns (no migrations in this project → ALTER IF NOT EXISTS).
    // Existing rows keep name_verified=false / name_source='unknown' — we never mark a
    // name as verified automatically because we can't prove its origin retroactively.
    const cols = [
      `whatsapp_display_name text`,
      `name_verified boolean NOT NULL DEFAULT false`,
      `name_source text NOT NULL DEFAULT 'unknown'`,
      `name_verified_at timestamptz`,
    ];
    for (const c of cols) {
      await this.ds.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ${c}`).catch(() => {});
    }
  }

  findAll(tenantId: string, options?: FindManyOptions<Contact>): Promise<Contact[]> {
    return this.contactsRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 1000, ...options });
  }

  /** A human agent confirms (or corrects) the contact's real name → marks it verified. */
  async confirmName(id: string, tenantId: string, name: string | undefined, userId?: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({ where: { id, tenantId } });
    if (!contact) throw new Error('Contact not found');
    const old = { full_name: contact.fullName, name_verified: contact.nameVerified };
    if (typeof name === 'string' && name.trim()) contact.fullName = name.trim();
    contact.nameVerified = true;
    contact.nameSource = 'agent';
    contact.nameVerifiedAt = new Date();
    const saved = await this.contactsRepo.save(contact);
    await this.auditService.log({
      tenantId, actorUserId: userId, entityType: 'contact', entityId: id,
      action: 'contact.name_confirmed',
      oldValues: old,
      newValues: { full_name: saved.fullName, name_verified: true, name_source: 'agent' },
    }).catch(() => {});
    this.eventEmitter.emit('contact.name_confirmed', { tenantId, contactId: id, name: saved.fullName, source: 'agent' });
    return saved;
  }
}
