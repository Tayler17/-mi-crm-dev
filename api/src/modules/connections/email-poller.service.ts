import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class EmailPollerService {
  private readonly logger = new Logger(EmailPollerService.name);
  private readonly inProgress = new Set<string>();

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Cron('*/2 * * * *')
  async pollAll() {
    const conns: any[] = await this.db.query(
      `SELECT id, tenant_id, name, credentials, inbox_id
       FROM channel_connections
       WHERE channel_type = 'email' AND is_active = true
         AND (credentials->>'imapHost') IS NOT NULL
         AND (credentials->>'imapHost') != ''`,
    );
    for (const conn of conns) {
      if (!this.inProgress.has(conn.id)) {
        this.pollOne(conn).catch((err) =>
          this.logger.error(`IMAP poll error conn=${conn.id}: ${err.message}`),
        );
      }
    }
  }

  private async pollOne(conn: any) {
    this.inProgress.add(conn.id);
    try {
      const { ImapFlow } = await import('imapflow' as any);
      const { simpleParser } = await import('mailparser' as any);

      const creds = conn.credentials ?? {};
      const client = new ImapFlow({
        host: String(creds.imapHost).trim(),
        port: Number(creds.imapPort) || 993,
        secure: Number(creds.imapPort || 993) !== 143,
        auth: {
          user: String(creds.imapUser || creds.user).trim(),
          pass: String(creds.imapPassword || creds.password),
        },
        logger: false,
        tls: { rejectUnauthorized: false },
      });

      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids: number[] = await client.search({ seen: false }, { uid: true });
        if (!uids.length) return;

        const done: number[] = [];
        for await (const msg of client.fetch(uids, { uid: true, envelope: true, source: true }, { uid: true })) {
          try {
            const parsed = await simpleParser(msg.source);
            await this.upsertEmail(conn, msg.envelope, parsed);
            done.push(msg.uid);
          } catch (e: any) {
            this.logger.warn(`Skip uid=${msg.uid} conn=${conn.id}: ${e.message}`);
          }
        }
        if (done.length) {
          await client.messageFlagsAdd(done, ['\\Seen'], { uid: true });
          this.logger.log(`Processed ${done.length} email(s) for conn=${conn.id}`);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    } finally {
      this.inProgress.delete(conn.id);
    }
  }

  private async upsertEmail(conn: any, envelope: any, parsed: any) {
    const from = envelope.from?.[0];
    if (!from?.address) return;

    const fromEmail = from.address.toLowerCase().trim();
    const fromName  = from.name || from.address;
    const subject   = envelope.subject || '(sin asunto)';
    const messageId = envelope.messageId || `imap-${conn.id}-${Date.now()}`;

    // Dedup: skip if this message was already imported
    const dup = await this.db.query(
      `SELECT id FROM messages WHERE tenant_id = $1 AND external_id = $2 LIMIT 1`,
      [conn.tenant_id, messageId],
    );
    if (dup.length) return;

    // Find or create contact by email address
    let contactId: string;
    const existing = await this.db.query(
      `SELECT id FROM contacts WHERE tenant_id = $1 AND LOWER(email) = $2 LIMIT 1`,
      [conn.tenant_id, fromEmail],
    );
    if (existing.length) {
      contactId = existing[0].id;
    } else {
      const [nc] = await this.db.query(
        `INSERT INTO contacts (id, tenant_id, full_name, email, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id`,
        [conn.tenant_id, fromName, fromEmail],
      );
      contactId = nc.id;
    }

    // Find open conversation for this connection+contact or open a new one
    let convId: string;
    const openConv = await this.db.query(
      `SELECT id FROM conversations
       WHERE tenant_id = $1 AND connection_id = $2 AND contact_id = $3 AND status != 'resolved'
       ORDER BY updated_at DESC LIMIT 1`,
      [conn.tenant_id, conn.id, contactId],
    );
    if (openConv.length) {
      convId = openConv[0].id;
    } else {
      const [nc] = await this.db.query(
        `INSERT INTO conversations
           (id, tenant_id, inbox_id, contact_id, connection_id, channel_type, external_id, subject, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'email', $5, $6, 'open', NOW(), NOW())
         RETURNING id`,
        [conn.tenant_id, conn.inbox_id, contactId, conn.id, fromEmail, subject],
      );
      convId = nc.id;
    }

    const body = extractBody(parsed, subject);

    await this.db.query(
      `INSERT INTO messages
         (id, tenant_id, conversation_id, sender_type, body, direction, external_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'contact', $3, 'inbound', $4, 'received', NOW(), NOW())`,
      [conn.tenant_id, convId, body, messageId],
    );

    await this.db.query(
      `UPDATE conversations SET updated_at = NOW(), last_message_at = NOW() WHERE id = $1`,
      [convId],
    );
  }
}

function extractBody(parsed: any, subject: string): string {
  let text = parsed.text || '';

  // Remove Outlook/Hotmail quoted header block at end of body
  // Pattern: "________________________________\nFrom: ...\nSent: ...\nTo: ...\nSubject: ..."
  text = text
    .replace(/_{5,}[\s\S]*$/m, '')             // Outlook separator + everything after
    .replace(/^From:.*\nSent:.*\nTo:.*\nSubject:[^\n]*/im, '') // Inline header block
    .replace(/-{5,}\s*Original Message\s*-{5,}[\s\S]*/i, '')  // "-----Original Message-----"
    // Plain-text link artifacts: "label<http://url>" → keep the real URL so it
    // renders as a clean clickable link instead of "label<http://url>".
    .replace(/\S*<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If text is empty or just whitespace, fall back to stripped HTML
  if (!text && parsed.html) {
    const fromHtml = stripHtml(parsed.html)
      .replace(/From:\s+.+?Subject:\s*[^\n]*/is, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    text = fromHtml;
  }

  return (text || subject).slice(0, 10000);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
