import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('queues')
export class Queue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'team_id', nullable: true, type: 'uuid' })
  teamId?: string;

  @Column({ name: 'inbox_id', nullable: true, type: 'uuid' })
  inboxId?: string;

  @Column({ default: 0 })
  priority: number;

  @Column({ name: 'max_wait_minutes', default: 60 })
  maxWaitMinutes: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
