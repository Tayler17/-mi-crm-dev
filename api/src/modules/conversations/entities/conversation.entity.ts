import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';

@Entity('conversations')
export class Conversation extends BaseTenantEntity {
  @Column({ name: 'inbox_id', nullable: true })
  inboxId: string;

  @Column({ name: 'contact_id', nullable: true })
  contactId: string;

  @Column({ nullable: true })
  subject: string;

  @Column({ default: 'open' })
  status: string;

  @Column({ name: 'channel_type', default: 'email' })
  channelType: string;

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo: string;

  @Column({ name: 'connection_id', nullable: true })
  connectionId: string;

  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  @Column({ name: 'queue_id', nullable: true })
  queueId: string;

  @Column({ name: 'team_id', nullable: true })
  teamId: string;

  @Column({ name: 'assigned_user_id', nullable: true })
  assignedUserId: string;
}
