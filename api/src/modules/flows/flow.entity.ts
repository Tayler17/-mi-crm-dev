import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('conversation_flows')
export class ConversationFlow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'inbox_id', nullable: true, type: 'uuid' })
  inboxId?: string;

  @Column({ name: 'trigger_type', default: 'new_conversation' })
  triggerType: string;

  @Column({ name: 'trigger_value', nullable: true, type: 'text' })
  triggerValue?: string;

  @Column({ type: 'jsonb', default: [] })
  steps: any[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', nullable: true, type: 'uuid' })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
