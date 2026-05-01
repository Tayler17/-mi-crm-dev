import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { CampaignContact } from './campaign-contact.entity';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ default: 'email' })
  type: string; // email | whatsapp | sms | phone

  @Column({ default: 'draft' })
  status: string; // draft | scheduled | running | paused | completed | cancelled

  @Column({ nullable: true })
  subject?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ name: 'scheduled_at', nullable: true, type: 'timestamptz' })
  scheduledAt?: Date;

  @Column({ name: 'started_at', nullable: true, type: 'timestamptz' })
  startedAt?: Date;

  @Column({ name: 'completed_at', nullable: true, type: 'timestamptz' })
  completedAt?: Date;

  @Column({ name: 'sent_count', default: 0 })
  sentCount: number;

  @Column({ name: 'delivered_count', default: 0 })
  deliveredCount: number;

  @Column({ name: 'opened_count', default: 0 })
  openedCount: number;

  @Column({ name: 'clicked_count', default: 0 })
  clickedCount: number;

  @Column({ type: 'jsonb', default: [] })
  messages: string[];

  @Column({ name: 'inbox_id', nullable: true, type: 'uuid' })
  inboxId?: string;

  @Column({ name: 'bot_id', nullable: true, type: 'uuid' })
  botId?: string;

  @Column({ name: 'schedule_id', nullable: true, type: 'uuid' })
  scheduleId?: string;

  @Column({ name: 'confirmation_enabled', default: false })
  confirmationEnabled: boolean;

  @Column({ name: 'queue_id', nullable: true, type: 'uuid' })
  queueId?: string;

  @Column({ name: 'created_by', nullable: true, type: 'uuid' })
  createdBy?: string;

  @OneToMany(() => CampaignContact, (cc) => cc.campaign, { eager: false })
  contacts: CampaignContact[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
