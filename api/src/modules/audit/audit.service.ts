import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

interface AuditLogDto {
  tenantId: string;
  actorUserId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  oldValues?: any;
  newValues?: any;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(dto: AuditLogDto): Promise<void> {
    try {
      await this.auditRepo.save(this.auditRepo.create(dto));
    } catch (e) {
      // audit failures should not break business logic
      console.error('Audit log failed:', e.message);
    }
  }
}
