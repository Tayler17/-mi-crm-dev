import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Polls every 60 s for pending appointments whose scheduled_at has passed.
 * For each one:
 *  1. Interpolates {Nombre}, {Fecha}, {Hora}, {Teléfono}, {Email} variables
 *  2. Finds or creates a conversation for the contact
 *  3. Inserts the message
 *  4. If openTicket = true, sets conversation status to 'open'
 *  5. Marks appointment status = 'sent'
 */
@Injectable()
export class AppointmentWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  onModuleInit() {
    this.dispatch();
    this.timer = setInterval(() => this.dispatch(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch() {
    try {
      const due = await this.db.query(
        `SELECT a.*, ct.full_name, ct.phone, ct.email
         FROM appointments a
         LEFT JOIN contacts ct ON ct.id = a.contact_id
         WHERE a.status = 'pending'
           AND a.scheduled_at <= NOW()`,
      );

      if (!due.length) return;
      this.logger.log(`Dispatching ${due.length} appointment(s)`);

      for (const appt of due) {
        try {
          await this.send(appt);
        } catch (err) {
          this.logger.error(`Appointment ${appt.id} error: ${err}`);
          await this.db.query(
            `UPDATE appointments SET status='cancelled', updated_at=NOW() WHERE id=$1`,
            [appt.id],
          );
        }
      }
    } catch (err) {
      this.logger.error(`AppointmentWorker dispatch error: ${err}`);
    }
  }

  private async send(appt: any) {
    const contactName  = appt.full_name ?? '';
    const phone        = appt.phone ?? '';
    const email        = appt.email ?? '';
    const scheduledAt  = new Date(appt.scheduled_at);
    const fecha        = scheduledAt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora         = scheduledAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Interpolate template variables
    const body = (appt.message ?? '')
      .replace(/\{Nombre\}/gi,        contactName)
      .replace(/\{Primer Nombre\}/gi, contactName.split(' ')[0] ?? contactName)
      .replace(/\{Teléfono\}/gi,      phone)
      .replace(/\{Email\}/gi,         email)
      .replace(/\{Fecha\}/gi,         fecha)
      .replace(/\{Hora\}/gi,          hora);

    // Find or create conversation
    let conversationId: string;
    const [existing] = await this.db.query(
      `SELECT id FROM conversations
       WHERE tenant_id=$1 AND contact_id=$2
         AND ($3::uuid IS NULL OR inbox_id=$3)
         AND status != 'resolved'
       ORDER BY created_at DESC LIMIT 1`,
      [appt.tenant_id, appt.contact_id, appt.inbox_id ?? null],
    );

    if (existing) {
      conversationId = existing.id;
    } else {
      const [conv] = await this.db.query(
        `INSERT INTO conversations (tenant_id, contact_id, inbox_id, status, created_at, updated_at)
         VALUES ($1,$2,$3,'open',NOW(),NOW()) RETURNING id`,
        [appt.tenant_id, appt.contact_id, appt.inbox_id ?? null],
      );
      conversationId = conv.id;
    }

    // Send message
    if (body.trim()) {
      await this.db.query(
        `INSERT INTO messages
           (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
         VALUES ($1,$2,$3,'text','outbound','bot',false,NOW(),NOW())`,
        [appt.tenant_id, conversationId, body],
      );
      await this.db.query(
        `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [conversationId],
      );
    }

    // If openTicket enabled, ensure conversation is open
    if (appt.open_ticket) {
      const convStatus = appt.ticket_status ?? 'open';
      await this.db.query(
        `UPDATE conversations SET status=$1, updated_at=NOW() WHERE id=$2`,
        [convStatus, conversationId],
      );
    }

    // Mark appointment sent
    await this.db.query(
      `UPDATE appointments SET status='sent', updated_at=NOW() WHERE id=$1`,
      [appt.id],
    );

    this.logger.log(`Appointment ${appt.id} dispatched → conv ${conversationId}`);
  }
}
