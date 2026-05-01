import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { ScheduleHours } from './entities/schedule-hours.entity';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';

const DAYS = [0, 1, 2, 3, 4, 5, 6]; // Sun–Sat

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(ScheduleHours)
    private readonly hoursRepo: Repository<ScheduleHours>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  findAll(tenantId: string) {
    return this.scheduleRepo.find({
      where: { tenantId },
      relations: ['hours'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const s = await this.scheduleRepo.findOne({ where: { id, tenantId }, relations: ['hours'] });
    if (!s) throw new NotFoundException('Schedule not found');
    return s;
  }

  async create(dto: CreateScheduleDto, tenantId: string, userId?: string) {
    const schedule = this.scheduleRepo.create({
      tenantId,
      name: dto.name,
      timezone: dto.timezone ?? 'UTC',
      isActive: dto.isActive ?? true,
      aiEnabled: dto.aiEnabled ?? false,
      aiFallbackMessage: dto.aiFallbackMessage,
      createdBy: userId,
    });
    const saved = await this.scheduleRepo.save(schedule);

    // Create default hours for all 7 days if not provided
    const hoursData = dto.hours ?? DAYS.map((d) => ({
      dayOfWeek: d,
      isClosed: d === 0 || d === 6, // Sun/Sat closed by default
      openTime: '09:00',
      closeTime: '18:00',
    }));

    await this.saveHours(saved.id, tenantId, hoursData);
    return this.findOne(saved.id, tenantId);
  }

  async update(id: string, dto: UpdateScheduleDto, tenantId: string) {
    const schedule = await this.findOne(id, tenantId);
    if (dto.name !== undefined) schedule.name = dto.name;
    if (dto.timezone !== undefined) schedule.timezone = dto.timezone;
    if (dto.isActive !== undefined) schedule.isActive = dto.isActive;
    if (dto.aiEnabled !== undefined) schedule.aiEnabled = dto.aiEnabled;
    if (dto.aiFallbackMessage !== undefined) schedule.aiFallbackMessage = dto.aiFallbackMessage;
    await this.scheduleRepo.save(schedule);

    if (dto.hours) await this.saveHours(id, tenantId, dto.hours);
    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string) {
    const s = await this.findOne(id, tenantId);
    await this.scheduleRepo.remove(s);
  }

  // ── Inbox assignment (legacy: keeps inboxes.schedule_id in sync) ─────────────

  async getAssignedInboxes(id: string, tenantId: string) {
    return this.db.query(
      `SELECT i.id, i.name, i.channel_type FROM inboxes i WHERE i.schedule_id = $1 AND i.tenant_id = $2`,
      [id, tenantId],
    );
  }

  async assignInbox(scheduleId: string, inboxId: string, tenantId: string) {
    await this.findOne(scheduleId, tenantId);
    await this.db.query(
      `UPDATE inboxes SET schedule_id = $1 WHERE id = $2 AND tenant_id = $3`,
      [scheduleId, inboxId, tenantId],
    );
    await this.db.query(
      `INSERT INTO schedule_assignments (schedule_id, target_type, target_id) VALUES ($1, 'inbox', $2)
       ON CONFLICT DO NOTHING`,
      [scheduleId, inboxId],
    );
    return { ok: true };
  }

  async unassignInbox(scheduleId: string, inboxId: string, tenantId: string) {
    await this.db.query(
      `UPDATE inboxes SET schedule_id = NULL WHERE id = $1 AND tenant_id = $2 AND schedule_id = $3`,
      [inboxId, tenantId, scheduleId],
    );
    await this.db.query(
      `DELETE FROM schedule_assignments WHERE schedule_id = $1 AND target_type = 'inbox' AND target_id = $2`,
      [scheduleId, inboxId],
    );
    return { ok: true };
  }

  // ── Generic assignments (bot | campaign | user) ───────────────────────────────

  async getAssignments(scheduleId: string, tenantId: string) {
    await this.findOne(scheduleId, tenantId);
    const rows = await this.db.query(
      `SELECT sa.id, sa.target_type, sa.target_id, sa.created_at,
              CASE sa.target_type
                WHEN 'inbox' THEN (SELECT name FROM inboxes WHERE id = sa.target_id)
                WHEN 'bot' THEN (SELECT name FROM call_bots WHERE id = sa.target_id)
                WHEN 'campaign' THEN (SELECT name FROM campaigns WHERE id = sa.target_id)
                WHEN 'user' THEN (SELECT full_name FROM users WHERE id = sa.target_id)
              END AS target_name
       FROM schedule_assignments sa
       WHERE sa.schedule_id = $1
       ORDER BY sa.target_type, sa.created_at`,
      [scheduleId],
    );
    return rows;
  }

  async addAssignment(scheduleId: string, targetType: string, targetId: string, tenantId: string) {
    await this.findOne(scheduleId, tenantId);
    await this.db.query(
      `INSERT INTO schedule_assignments (schedule_id, target_type, target_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [scheduleId, targetType, targetId],
    );
    // Sync inbox column for backward compat
    if (targetType === 'inbox') {
      await this.db.query(`UPDATE inboxes SET schedule_id = $1 WHERE id = $2 AND tenant_id = $3`, [scheduleId, targetId, tenantId]);
    }
    return { ok: true };
  }

  async removeAssignment(scheduleId: string, assignmentId: string, tenantId: string) {
    await this.findOne(scheduleId, tenantId);
    const rows = await this.db.query(
      `DELETE FROM schedule_assignments WHERE id = $1 AND schedule_id = $2 RETURNING target_type, target_id`,
      [assignmentId, scheduleId],
    );
    // Sync inbox column
    if (rows.length && rows[0].target_type === 'inbox') {
      await this.db.query(`UPDATE inboxes SET schedule_id = NULL WHERE id = $1`, [rows[0].target_id]);
    }
    return { ok: true };
  }

  async getAssignableTargets(scheduleId: string, tenantId: string, targetType: string) {
    await this.findOne(scheduleId, tenantId);
    const alreadyAssigned = `
      SELECT target_id FROM schedule_assignments
      WHERE schedule_id = $1 AND target_type = $2`;

    if (targetType === 'inbox') {
      return this.db.query(
        `SELECT id, name, channel_type AS type FROM inboxes
         WHERE tenant_id = $3 AND id NOT IN (${alreadyAssigned})`,
        [scheduleId, 'inbox', tenantId],
      );
    }
    if (targetType === 'bot') {
      return this.db.query(
        `SELECT id, name, 'bot' AS type FROM call_bots
         WHERE tenant_id = $3 AND id NOT IN (${alreadyAssigned})`,
        [scheduleId, 'bot', tenantId],
      );
    }
    if (targetType === 'campaign') {
      return this.db.query(
        `SELECT id, name, type FROM campaigns
         WHERE tenant_id = $3 AND id NOT IN (${alreadyAssigned})`,
        [scheduleId, 'campaign', tenantId],
      );
    }
    if (targetType === 'user') {
      return this.db.query(
        `SELECT id, full_name AS name, 'user' AS type FROM users
         WHERE tenant_id = $3 AND id NOT IN (${alreadyAssigned})`,
        [scheduleId, 'user', tenantId],
      );
    }
    return [];
  }

  async checkStatus(id: string, tenantId: string) {
    const schedule = await this.findOne(id, tenantId);
    if (!schedule.isActive) return { open: false, reason: 'inactive' };

    const tz = schedule.timezone || 'UTC';
    const now = new Date();

    // Convert current time to the schedule's timezone using Intl
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayStr  = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const hourVal = parseInt(parts.find((p) => p.type === 'hour')?.value   ?? '0', 10);
    const minVal  = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    const dayOfWeek = DAY_MAP[dayStr] ?? now.getUTCDay();
    const nowMins   = (hourVal % 24) * 60 + minVal;

    const hours = schedule.hours?.find((h) => h.dayOfWeek === dayOfWeek);
    if (!hours || hours.isClosed) return { open: false, reason: 'closed_day', day: dayOfWeek };

    const [oh, om] = (hours.openTime  ?? '09:00').split(':').map(Number);
    const [ch, cm] = (hours.closeTime ?? '18:00').split(':').map(Number);
    const openMins  = oh * 60 + om;
    const closeMins = ch * 60 + cm;
    const open = nowMins >= openMins && nowMins < closeMins;
    return { open, openTime: hours.openTime, closeTime: hours.closeTime, timezone: tz };
  }

  private async saveHours(scheduleId: string, tenantId: string, hours: any[]) {
    for (const h of hours) {
      const existing = await this.hoursRepo.findOne({ where: { scheduleId, dayOfWeek: h.dayOfWeek } });
      if (existing) {
        Object.assign(existing, {
          isClosed: h.isClosed ?? false,
          openTime: h.isClosed ? null : (h.openTime ?? '09:00'),
          closeTime: h.isClosed ? null : (h.closeTime ?? '18:00'),
        });
        await this.hoursRepo.save(existing);
      } else {
        await this.hoursRepo.save(this.hoursRepo.create({
          scheduleId,
          tenantId,
          dayOfWeek: h.dayOfWeek,
          isClosed: h.isClosed ?? false,
          openTime: h.isClosed ? null : (h.openTime ?? '09:00'),
          closeTime: h.isClosed ? null : (h.closeTime ?? '18:00'),
        }));
      }
    }
  }
}
