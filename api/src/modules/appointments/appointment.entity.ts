import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contact_id', nullable: true, type: 'uuid' })
  contactId?: string;

  @Column({ name: 'user_id', nullable: true, type: 'uuid' })
  userId?: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ name: 'inbox_id', nullable: true, type: 'uuid' })
  inboxId?: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ default: 'UTC' })
  timezone: string;

  @Column({ default: 'pending' })
  status: string; // pending | sent | cancelled

  @Column({ name: 'open_ticket', default: false })
  openTicket: boolean;

  @Column({ name: 'ticket_status', default: 'closed' })
  ticketStatus: string;

  @Column({ name: 'assigned_user_id', nullable: true, type: 'uuid' })
  assignedUserId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
