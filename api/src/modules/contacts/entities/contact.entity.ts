import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { Company } from './company.entity';

@Entity('contacts')
export class Contact extends BaseTenantEntity {
  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'job_title', nullable: true })
  jobTitle: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  // ── Contact identity (name verification) ────────────────────────────────────
  // full_name (above) may initially hold the WhatsApp display name for display, but
  // agents (AI) must only treat it as the real name when nameVerified is true.
  @Column({ name: 'whatsapp_display_name', nullable: true })
  whatsappDisplayName: string;

  @Column({ name: 'name_verified', type: 'boolean', default: false })
  nameVerified: boolean;

  // Source of the current name: 'customer' | 'agent' | 'import' | 'whatsapp' | 'unknown'
  @Column({ name: 'name_source', type: 'text', default: 'unknown' })
  nameSource: string;

  @Column({ name: 'name_verified_at', type: 'timestamptz', nullable: true })
  nameVerifiedAt: Date;

  @Column({ name: 'company_id', nullable: true })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company?: Company;
}
