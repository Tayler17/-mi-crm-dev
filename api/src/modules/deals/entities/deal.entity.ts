import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { Company } from '../../contacts/entities/company.entity';
import { PipelineStage } from '../../pipelines/entities/pipeline-stage.entity';

@Entity('deals')
export class Deal extends BaseTenantEntity {
  @Column()
  title: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  value: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ default: 'open' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;

  @Column({ name: 'contact_id', nullable: true })
  contactId: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: string;

  @Column({ name: 'stage_id', nullable: true })
  stageId: string;

  @ManyToOne(() => Contact)
  @JoinColumn({ name: 'contact_id' })
  contact?: Contact;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @ManyToOne(() => PipelineStage)
  @JoinColumn({ name: 'stage_id' })
  stage?: PipelineStage;
}
