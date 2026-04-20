import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('call_logs')
export class CallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'bot_id', nullable: true, type: 'uuid' })
  botId?: string;

  @Column({ default: 'inbound' })
  direction: string;

  @Column({ name: 'from_number', nullable: true })
  fromNumber?: string;

  @Column({ name: 'to_number', nullable: true })
  toNumber?: string;

  @Column({ default: 0 })
  duration: number;

  @Column({ default: 'completed' })
  status: string;

  @Column({ default: 'handled' })
  outcome: string;

  @Column({ type: 'text', nullable: true })
  transcript?: string;

  @Column({ name: 'recording_url', nullable: true })
  recordingUrl?: string;

  @Column({ name: 'contact_id', nullable: true, type: 'uuid' })
  contactId?: string;

  @Column({ name: 'conversation_id', nullable: true, type: 'uuid' })
  conversationId?: string;

  @Column({ name: 'started_at', type: 'timestamp', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ name: 'ended_at', nullable: true, type: 'timestamp' })
  endedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
