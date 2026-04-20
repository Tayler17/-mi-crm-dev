import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('channel_connections')
export class Connection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'channel_type' })
  channelType: string;

  @Column({ default: 'disconnected' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  credentials: Record<string, any>;

  @Column({ name: 'inbox_id', nullable: true, type: 'uuid' })
  inboxId?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true })
  lastTestedAt?: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
