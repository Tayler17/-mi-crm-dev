import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ScheduleHours } from './schedule-hours.entity';

@Entity('schedules')
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ default: 'UTC' })
  timezone: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'ai_enabled', default: false })
  aiEnabled: boolean;

  @Column({ name: 'ai_fallback_message', nullable: true, type: 'text' })
  aiFallbackMessage: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @OneToMany(() => ScheduleHours, (h) => h.schedule, { cascade: true, eager: true })
  hours: ScheduleHours[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
