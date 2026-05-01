import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Appointment } from './appointment.entity';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly repo: Repository<Appointment>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string, from?: string, to?: string) {
    const where: any = { tenantId };
    if (from && to) {
      where.scheduledAt = Between(new Date(from), new Date(to));
    } else if (from) {
      where.scheduledAt = MoreThanOrEqual(new Date(from));
    }

    const rows = await this.db.query(
      `SELECT a.*,
              a.scheduled_at   AS "scheduledAt",
              a.contact_id     AS "contactId",
              a.inbox_id       AS "inboxId",
              a.open_ticket    AS "openTicket",
              a.ticket_status  AS "ticketStatus",
              a.assigned_user_id AS "assignedUserId",
              a.created_at     AS "createdAt",
              a.updated_at     AS "updatedAt",
              ct.full_name  AS contact_name,
              ct.phone      AS contact_phone,
              ct.email      AS contact_email,
              u.full_name   AS user_name
       FROM appointments a
       LEFT JOIN contacts ct ON ct.id = a.contact_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1
         ${from ? `AND a.scheduled_at >= $2` : ''}
         ${to ? `AND a.scheduled_at <= $${from ? 3 : 2}` : ''}
       ORDER BY a.scheduled_at ASC`,
      [tenantId, ...(from ? [from] : []), ...(to ? [to] : [])],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const a = await this.repo.findOne({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Appointment not found');
    return a;
  }

  async create(dto: any, tenantId: string, userId?: string) {
    const appointment = this.repo.create({
      tenantId,
      contactId: dto.contactId,
      userId: userId,
      title: dto.title,
      message: dto.message,
      inboxId: dto.inboxId,
      scheduledAt: new Date(dto.scheduledAt),
      timezone: dto.timezone ?? 'UTC',
      openTicket: dto.openTicket ?? false,
      ticketStatus: dto.ticketStatus ?? 'closed',
      assignedUserId: dto.assignedUserId,
      notes: dto.notes,
    });
    return this.repo.save(appointment);
  }

  async update(id: string, dto: any, tenantId: string) {
    const appointment = await this.findOne(id, tenantId);
    Object.assign(appointment, {
      ...(dto.contactId !== undefined && { contactId: dto.contactId }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.message !== undefined && { message: dto.message }),
      ...(dto.inboxId !== undefined && { inboxId: dto.inboxId }),
      ...(dto.scheduledAt !== undefined && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.openTicket !== undefined && { openTicket: dto.openTicket }),
      ...(dto.ticketStatus !== undefined && { ticketStatus: dto.ticketStatus }),
      ...(dto.assignedUserId !== undefined && { assignedUserId: dto.assignedUserId }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    });
    return this.repo.save(appointment);
  }

  async remove(id: string, tenantId: string) {
    const appointment = await this.findOne(id, tenantId);
    await this.repo.remove(appointment);
  }

  async getStats(tenantId: string) {
    const [{ total, pending, sent, cancelled }] = await this.db.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'pending') as pending,
              COUNT(*) FILTER (WHERE status = 'sent') as sent,
              COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
       FROM appointments WHERE tenant_id = $1`,
      [tenantId],
    );
    return { total: +total, pending: +pending, sent: +sent, cancelled: +cancelled };
  }
}
