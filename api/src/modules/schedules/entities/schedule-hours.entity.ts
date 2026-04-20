import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Schedule } from './schedule.entity';

@Entity('schedule_hours')
export class ScheduleHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'schedule_id' })
  scheduleId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number; // 0=Sun, 1=Mon ... 6=Sat

  @Column({ name: 'open_time', nullable: true, type: 'time' })
  openTime: string;

  @Column({ name: 'close_time', nullable: true, type: 'time' })
  closeTime: string;

  @Column({ name: 'is_closed', default: false })
  isClosed: boolean;

  @ManyToOne(() => Schedule, (s) => s.hours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule: Schedule;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
