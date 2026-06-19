import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, UploadedFile, UseInterceptors, UsePipes, ValidationPipe, BadRequestException, NotFoundException, ForbiddenException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { unlink } from 'fs/promises';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagesService } from './messages.service';
import { CreateMessageDto, CreateNoteDto } from './dto/message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappWebService } from '../connections/whatsapp-web.service';

/** Transcode a recorded audio file to mp3 so it plays on every device/browser
 * (ogg/opus fails on Safari). WhatsApp still delivers it as a playable audio. */
function transcodeToMp3(inputPath: string): Promise<string> {
  const outPath = inputPath.replace(/\.[^.]+$/, '') + '.mp3';
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outPath]);
    let err = '';
    ff.stderr?.on('data', (d) => (err += d.toString()));
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(outPath) : reject(new Error('ffmpeg ' + err.slice(-160)))));
  });
}

@Controller('conversations/:conversationId')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly service: MessagesService,
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
    private readonly waSvc: WhatsappWebService,
  ) {}

  @Get('messages')
  async getMessages(@Param('conversationId') cid: string, @TenantId() tenantId: string, @Request() req: any) {
    await this.assertAccess(cid, tenantId, req?.user);
    return this.service.findByConversation(cid, tenantId);
  }

  /** Best-effort: store a copy of a sent email in the mailbox "Sent" folder via IMAP. */
  private async appendToSent(creds: any, mailOptions: any): Promise<void> {
    try {
      if (!creds?.imapHost && !creds?.host) return;
      const MailComposer = (await import('nodemailer/lib/mail-composer')).default as any;
      const raw: Buffer = await new MailComposer(mailOptions).compile().build();

      const { ImapFlow } = await import('imapflow' as any);
      const imapPort = Number(creds.imapPort) || 993;
      const client = new ImapFlow({
        host: String(creds.imapHost || creds.host).trim(),
        port: imapPort,
        secure: imapPort !== 143,
        auth: { user: String(creds.imapUser || creds.user).trim(), pass: String(creds.imapPassword || creds.password || '') },
        logger: false,
        tls: { rejectUnauthorized: false },
      });
      await client.connect();
      try {
        // Resolve the Sent mailbox: prefer the \Sent special-use, else common names.
        let sentBox = 'Sent';
        try {
          const boxes: any[] = await client.list();
          const found = boxes.find((b) => b.specialUse === '\\Sent')
            || boxes.find((b) => /^(INBOX\.)?Sent( Items| Messages)?$/i.test(b.path));
          if (found) sentBox = found.path;
        } catch { /* use default */ }
        await client.append(sentBox, raw, ['\\Seen']);
      } finally {
        await client.logout().catch(() => {});
      }
    } catch (e: any) {
      console.error(`[email-sent-copy] ${e.message}`);
    }
  }

  /** Append the agent's signature to an outbound text body, per channel. */
  private async applySignature(conversationId: string, tenantId: string, userId: string | undefined, body: string): Promise<string> {
    if (!userId) return body;
    const [u] = await this.db.query(
      `SELECT signature_enabled, signature_email, signature_chat FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    if (!u?.signature_enabled) return body;
    const [conv] = await this.db.query(
      `SELECT COALESCE(cc.channel_type, c.channel_type) AS channel_type
         FROM conversations c LEFT JOIN channel_connections cc ON cc.id = c.connection_id
        WHERE c.id = $1 AND c.tenant_id = $2 LIMIT 1`,
      [conversationId, tenantId],
    );
    const channel = conv?.channel_type ?? '';
    const sig: string = (channel === 'email' ? u.signature_email : u.signature_chat) ?? '';
    if (!sig.trim()) return body;
    if (body.trimEnd().endsWith(sig.trim())) return body; // already signed
    const sep = channel === 'email' ? '\n\n--\n' : '\n\n';
    return `${body}${sep}${sig}`;
  }

  /** Enforce team-based conversation scoping for agents (when the tenant enables it). */
  private async assertAccess(conversationId: string, tenantId: string, user?: any) {
    const role = user?.role ?? 'agent';
    if (role === 'admin' || role === 'owner') return;
    const [t] = await this.db.query(
      `SELECT settings->>'restrictAgentsToTeams' AS flag FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (t?.flag !== 'true') return;
    const rows = await this.db.query(
      `SELECT 1 FROM conversations c
        WHERE c.id = $2 AND c.tenant_id = $1 AND (
          c.assigned_to = $3 OR c.assigned_user_id = $3
          OR c.team_id IN (SELECT team_id FROM team_members WHERE user_id = $3)
          OR c.queue_id IN (SELECT id FROM queues WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = $3))
          OR (c.team_id IS NULL AND c.queue_id IS NULL)
        ) LIMIT 1`,
      [tenantId, conversationId, user?.id ?? ''],
    );
    if (rows.length === 0) throw new NotFoundException('Conversation not found');
  }

  @Post('messages')
  async sendMessage(
    @Param('conversationId') cid: string,
    @Body() dto: CreateMessageDto,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    // Append the sending agent's signature (if enabled) to outbound text messages.
    if ((dto.direction ?? 'outbound') === 'outbound' && dto.body && !/^\/uploads\//.test(dto.body)) {
      dto.body = await this.applySignature(cid, tenantId, req.user?.id, dto.body);
    }

    const msg = await this.service.create(cid, dto, tenantId, req.user.id);

    // Deliver through the conversation's actual channel (WA Web, Telegram, etc.)
    await this.deliverOutbound(cid, tenantId, dto.body ?? '', dto.contentType, msg.id, dto.replyToMessageId);

    this.notifications.emit({
      tenantId,
      type: 'message_created',
      payload: { conversationId: cid, message: msg },
    });

    if (dto.direction === 'inbound' || !dto.direction) {
      this.events.emit('conversation.message_received', {
        tenantId, conversationId: cid, message: msg,
      });
    }

    return msg;
  }

  /** Edit a sent message. On WhatsApp Web the edit is pushed to the recipient
   *  (allowed by WhatsApp within ~15 min); other channels update only in the CRM. */
  @Patch('messages/:messageId')
  async editMessage(
    @Param('conversationId') cid: string,
    @Param('messageId') messageId: string,
    @Body() body: { body?: string },
    @TenantId() tenantId: string,
  ) {
    const msg = await this.service.findOneOwned(messageId, cid, tenantId);
    if (!msg) throw new NotFoundException('Mensaje no encontrado');
    if (msg.direction !== 'outbound') throw new ForbiddenException('Solo se pueden editar mensajes enviados');
    if (msg.deletedAt) throw new ForbiddenException('El mensaje está eliminado');
    const text = (body?.body ?? '').trim();
    if (!text) throw new BadRequestException('El mensaje no puede quedar vacío');

    let channelWarning: string | undefined;
    if (msg.externalId) {
      const [conv] = await this.db.query(
        `SELECT c.connection_id, c.external_id, COALESCE(cc.channel_type, c.channel_type) AS channel_type
         FROM conversations c LEFT JOIN channel_connections cc ON cc.id = c.connection_id
         WHERE c.id=$1 AND c.tenant_id=$2 LIMIT 1`,
        [cid, tenantId],
      );
      if (conv?.channel_type === 'whatsapp_web' && conv.connection_id && conv.external_id) {
        const ok = await this.waSvc.editMessage(conv.connection_id, conv.external_id, msg.externalId, text);
        if (!ok) channelWarning = 'No se pudo editar en WhatsApp (quizá pasaron más de 15 min). Se actualizó solo en el CRM.';
      }
    }
    await this.service.markEdited(messageId, text);
    this.notifications.emit({ tenantId, type: 'message_updated', payload: { conversationId: cid, messageId, body: text, editedAt: new Date().toISOString() } });
    return { ok: true, warning: channelWarning };
  }

  /** Delete a sent message. On WhatsApp Web it's revoked for everyone; other
   *  channels (and inbound) are removed only from the CRM view. */
  @Delete('messages/:messageId')
  async deleteMessage(
    @Param('conversationId') cid: string,
    @Param('messageId') messageId: string,
    @TenantId() tenantId: string,
  ) {
    const msg = await this.service.findOneOwned(messageId, cid, tenantId);
    if (!msg) throw new NotFoundException('Mensaje no encontrado');

    if (msg.direction === 'outbound' && msg.externalId) {
      const [conv] = await this.db.query(
        `SELECT c.connection_id, c.external_id, COALESCE(cc.channel_type, c.channel_type) AS channel_type
         FROM conversations c LEFT JOIN channel_connections cc ON cc.id = c.connection_id
         WHERE c.id=$1 AND c.tenant_id=$2 LIMIT 1`,
        [cid, tenantId],
      );
      if (conv?.channel_type === 'whatsapp_web' && conv.connection_id && conv.external_id) {
        await this.waSvc.revokeMessage(conv.connection_id, conv.external_id, msg.externalId);
      }
    }
    await this.service.markDeleted(messageId);
    this.notifications.emit({ tenantId, type: 'message_deleted', payload: { conversationId: cid, messageId } });
    return { ok: true };
  }

  @Get('notes')
  getNotes(@Param('conversationId') cid: string, @TenantId() tenantId: string) {
    return this.service.findNotesByConversation(cid, tenantId);
  }

  @Post('notes')
  async sendNote(
    @Param('conversationId') cid: string,
    @Body() dto: CreateNoteDto,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    const note = await this.service.createNote(cid, dto, tenantId, req.user.id);

    // Emit note_created so inbox SSE appends it in real-time for other agents
    this.notifications.emit({
      tenantId, type: 'note_created',
      payload: { conversationId: cid, note },
    });

    // Parse @mentions and notify each mentioned agent
    const handles = [...new Set((dto.body ?? '').match(/@([\w.]+)/g) ?? [])];
    if (handles.length) {
      const placeholders = handles.map((_, i) => `$${i + 2}`).join(',');
      const names = handles.map((h) => h.slice(1).toLowerCase());
      const users = await this.db.query(
        `SELECT id, full_name FROM users
         WHERE tenant_id = $1 AND LOWER(REPLACE(full_name,' ','')) = ANY(ARRAY[${placeholders}])`,
        [tenantId, ...names],
      ).catch(() => []);
      const [author] = await this.db.query(
        `SELECT full_name FROM users WHERE id=$1 LIMIT 1`, [req.user.id],
      ).catch(() => []);
      for (const u of users) {
        if (u.id === req.user.id) continue; // don't self-notify
        this.notifications.emit({
          tenantId, type: 'mention_created',
          payload: {
            conversationId: cid,
            noteId: note.id,
            mentionedUserId: u.id,
            mentionedBy: author?.full_name ?? 'Alguien',
            body: dto.body?.slice(0, 120) ?? '',
          },
        });
      }
    }

    return note;
  }

  // ── Scheduled messages ────────────────────────────────────────────────────

  @Get('messages/scheduled')
  async getScheduled(@Param('conversationId') cid: string, @TenantId() tenantId: string) {
    return this.db.query(
      `SELECT sm.*, u.full_name AS author_name
       FROM scheduled_messages sm
       LEFT JOIN users u ON u.id = sm.author_id
       WHERE sm.conversation_id = $1 AND sm.tenant_id = $2 AND sm.status = 'pending'
       ORDER BY sm.scheduled_at ASC`,
      [cid, tenantId],
    );
  }

  @Post('messages/schedule')
  async scheduleMessage(
    @Param('conversationId') cid: string,
    @Body() body: { body: string; scheduledAt: string },
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    const rows = await this.db.query(
      `INSERT INTO scheduled_messages (tenant_id, conversation_id, author_id, body, scheduled_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, cid, req.user.id, body.body, body.scheduledAt],
    );
    return rows[0];
  }

  // ── File upload ───────────────────────────────────────────────────────────

  @Post('messages/upload')
  @UsePipes(new ValidationPipe({ whitelist: false }))
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        // Save under /uploads/messages, which IS served statically (the root
        // /uploads is not) — otherwise sent media 404s and won't play in the CRM.
        const dir = join(process.cwd(), 'uploads', 'messages');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|mp3|ogg|wav|m4a|opus|mp4|mov|avi|webm|txt|csv|xlsx|xls|doc|docx|zip)$/i;
      if (!allowed.test(file.originalname)) {
        return cb(new BadRequestException('Tipo de archivo no permitido'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  }))
  async uploadFile(
    @Param('conversationId') cid: string,
    @UploadedFile() file: any,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    if (!file) throw new Error('No file received');
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname);
    // Recorded voice notes are flagged explicitly (kind=audio) because a .webm
    // recording can be reported as video/webm; also accept audio ext/mimetype.
    const forcedAudio = req.body?.kind === 'audio';
    const isAudio = forcedAudio || /\.(mp3|ogg|wav|m4a|opus)$/i.test(file.originalname) || (file.mimetype?.startsWith('audio/') ?? false);
    const isVideo = !isAudio && /\.(mp4|mov|avi|webm)$/i.test(file.originalname);
    const contentType = isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file';

    let filename = file.filename;
    // Audio → mp3 for universal playback (Safari can't play webm/ogg). Falls back to original on failure.
    if (isAudio && !/\.mp3$/i.test(filename)) {
      try {
        const inputPath = join(process.cwd(), 'uploads', 'messages', file.filename);
        const outPath = await transcodeToMp3(inputPath);
        filename = outPath.split(/[\\/]/).pop()!;
        await unlink(inputPath).catch(() => {});
      } catch { /* keep original */ }
    }
    const fileUrl = `/uploads/messages/${filename}`;
    // caption comes via multipart field
    const caption: string = (req.body?.caption ?? '').trim();
    const body = caption
      ? `${fileUrl}|${file.originalname}|${caption}`
      : `${fileUrl}|${file.originalname}`;

    const [msg] = await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, sender_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'outbound','agent',false,NOW(),NOW()) RETURNING *`,
      [tenantId, cid, req.user.id, body, contentType],
    );
    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [cid],
    );
    this.notifications.emit({ tenantId, type: 'message_created', payload: { conversationId: cid, message: msg } });
    // Deliver file through the channel
    await this.deliverOutbound(cid, tenantId, body, contentType, msg.id);
    return msg;
  }

  @Delete('messages/scheduled/:schedId')
  async cancelScheduled(
    @Param('conversationId') cid: string,
    @Param('schedId') schedId: string,
    @TenantId() tenantId: string,
  ) {
    await this.db.query(
      `UPDATE scheduled_messages SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND conversation_id=$2 AND tenant_id=$3 AND status='pending'`,
      [schedId, cid, tenantId],
    );
    return { success: true };
  }

  // ── Channel delivery ──────────────────────────────────────────────────────

  private async deliverOutbound(conversationId: string, tenantId: string, text: string, contentType = 'text', messageId?: string, replyToMessageId?: string) {
    if (!text) return;
    // Defensive: any body that points at an uploaded file ("/uploads/...") is a
    // media message (with or without the "|name" suffix). Infer the type from the
    // extension regardless of contentType so the recipient never gets a raw path.
    if (/^\/uploads\/\S+/.test(text)) {
      const ext = (text.split('|')[0].split('.').pop() ?? '').toLowerCase();
      contentType = /^(jpg|jpeg|png|gif|webp|bmp|heic)$/.test(ext) ? 'image'
        : /^(mp3|ogg|oga|m4a|wav|opus|aac)$/.test(ext) ? 'audio'
        : /^(mp4|mov|avi|webm|3gp)$/.test(ext) ? 'video'
        : 'file';
    }
    try {
      const [conv] = await this.db.query(
        `SELECT c.channel_type, c.connection_id, c.external_id, c.subject,
                cc.channel_type AS conn_channel_type, cc.credentials,
                (SELECT email FROM contacts ct WHERE ct.id = c.contact_id) AS contact_email
         FROM conversations c
         LEFT JOIN channel_connections cc ON cc.id = c.connection_id
         WHERE c.id = $1 AND c.tenant_id = $2 LIMIT 1`,
        [conversationId, tenantId],
      );
      if (!conv) return;

      const channelType = conv.conn_channel_type ?? conv.channel_type;

      switch (channelType) {

        case 'whatsapp_web': {
          const remoteJid    = conv.external_id;
          const connectionId = conv.connection_id;
          if (!remoteJid || !connectionId) return;

          // If replying to a specific message, build the WhatsApp "quoted" ref.
          let quoted: any;
          if (replyToMessageId) {
            const [orig] = await this.db.query(
              `SELECT external_id, body, direction FROM messages WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
              [replyToMessageId, tenantId],
            );
            if (orig?.external_id) {
              quoted = {
                key: { remoteJid, fromMe: orig.direction === 'outbound', id: orig.external_id },
                message: { conversation: (orig.body ?? '').split('|')[0] || ' ' },
              };
            }
          }

          let waId: string | false = false;
          if (contentType === 'image' || contentType === 'audio' || contentType === 'video' || contentType === 'file') {
            const [fileUrl, , fileCaption] = text.split('|');
            waId = await this.waSvc.sendFile(connectionId, remoteJid, fileUrl, contentType, fileCaption || undefined, quoted);
          } else {
            waId = await this.waSvc.sendMessage(connectionId, remoteJid, text, quoted);
          }
          if (!waId) {
            await this.db.query(
              `INSERT INTO messages (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
               VALUES ($1,$2,'⚠ No se pudo entregar: sesión de WhatsApp Web desconectada','text','outbound','system',true,NOW(),NOW())`,
              [tenantId, conversationId],
            ).catch(() => {});
          } else if (messageId && typeof waId === 'string') {
            await this.db.query(
              `UPDATE messages SET external_id=$1 WHERE id=$2`,
              [waId, messageId],
            ).catch(() => {});
          }
          break;
        }

        case 'telegram': {
          const creds    = conv.credentials ?? {};
          const chatId   = conv.external_id;
          const botToken = creds.botToken;
          if (!chatId || !botToken) return;
          await (globalThis as any).fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text }),
              signal: AbortSignal.timeout(8000),
            },
          ).catch(() => {});
          break;
        }

        case 'whatsapp': {
          const creds   = conv.credentials ?? {};
          const phoneId = creds.phoneNumberId;
          const token   = creds.accessToken;
          const toPhone = conv.external_id;
          if (!phoneId || !token || !toPhone) return;
          await (globalThis as any).fetch(
            `https://graph.facebook.com/v19.0/${phoneId}/messages`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                messaging_product: 'whatsapp', to: toPhone,
                type: 'text', text: { body: text },
              }),
              signal: AbortSignal.timeout(8000),
            },
          ).catch(() => {});
          break;
        }

        case 'facebook':
        case 'instagram': {
          const creds = conv.credentials ?? {};
          const recipientId = conv.external_id;
          const token = creds.accessToken;
          if (!recipientId || !token) return;
          await (globalThis as any).fetch(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
              signal: AbortSignal.timeout(8000),
            },
          ).catch(() => {});
          break;
        }

        case 'email': {
          // Email conversations may have no external_id; the recipient is the contact's email.
          const toEmail = conv.external_id || conv.contact_email;
          let creds = conv.credentials ?? {};
          // Conversation not tied to a connection → use the tenant's active email connection.
          if (!creds.host) {
            const [ec] = await this.db.query(
              `SELECT id, credentials FROM channel_connections
                WHERE tenant_id=$1 AND channel_type='email' AND is_active=true
                  AND (credentials->>'host') IS NOT NULL AND (credentials->>'host') != ''
                ORDER BY updated_at DESC LIMIT 1`,
              [tenantId],
            );
            if (ec?.credentials) {
              creds = ec.credentials;
              // Backfill so future sends/threading use this connection.
              await this.db.query(`UPDATE conversations SET connection_id=$1 WHERE id=$2 AND connection_id IS NULL`, [ec.id, conversationId]).catch(() => {});
            }
          }
          if (!toEmail || !creds.host) {
            console.error(`[email-send] cannot send: to=${toEmail ?? 'null'} host=${creds.host ?? 'null'} connId=${conv.connection_id ?? 'null'} conv=${conversationId}`);
            return;
          }
          console.log(`[email-send] sending to=${toEmail} host=${creds.host} port=${creds.port}`);

          const nodemailer = await import('nodemailer');
          const secure = String(creds.encryption ?? '').toUpperCase() === 'SSL' || Number(creds.port) === 465;
          const transport = nodemailer.createTransport({
            host: String(creds.host).trim(),
            port: Number(creds.port) || 587,
            secure,
            auth: creds.user ? { user: String(creds.user).trim(), pass: String(creds.password ?? '') } : undefined,
            tls: { rejectUnauthorized: false },
            connectionTimeout: 10000,
            greetingTimeout: 8000,
            socketTimeout: 15000,
          });

          const fromName = creds.fromName || 'Soporte';
          const fromAddr = String(creds.user || '').trim();
          const baseSubject = conv.subject && conv.subject !== '(sin asunto)' ? conv.subject : 'Mensaje';
          const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;

          // Thread the reply onto the customer's last email (so it lands in the same thread).
          const [lastIn] = await this.db.query(
            `SELECT external_id FROM messages
              WHERE conversation_id = $1 AND direction = 'inbound' AND external_id IS NOT NULL
              ORDER BY created_at DESC LIMIT 1`,
            [conversationId],
          );
          const threadRefs = lastIn?.external_id ? { inReplyTo: lastIn.external_id, references: lastIn.external_id } : {};

          // Media bodies → real email attachment; the caption (if any) is the body.
          let textBody = text;
          let attachments: any[] = [];
          if (contentType === 'image' || contentType === 'audio' || contentType === 'video' || contentType === 'file') {
            const [fileUrl, fileName, cap] = text.split('|');
            attachments = [{ filename: fileName || fileUrl.split('/').pop() || 'file', path: join(process.cwd(), fileUrl) }];
            textBody = cap || '';
          }

          let info: any;
          try {
            info = await transport.sendMail({
              from: fromAddr ? `${fromName} <${fromAddr}>` : fromName,
              to: toEmail,
              subject,
              text: textBody || ' ',
              html: textBody ? textBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : undefined,
              attachments,
              ...threadRefs,
            });
          } finally {
            transport.close(); // release the SMTP connection (Hostinger limits concurrent connections)
          }

          console.log(`[email-send] sent ok id=${info?.messageId} accepted=${JSON.stringify(info?.accepted)} rejected=${JSON.stringify(info?.rejected)}`);

          // Store the sent Message-ID so the next reply threads correctly.
          if (messageId && info?.messageId) {
            await this.db.query(`UPDATE messages SET external_id=$1 WHERE id=$2`, [info.messageId, messageId]).catch(() => {});
          }

          // Best-effort: save a copy to the mailbox "Sent" folder (fire-and-forget,
          // never blocks or fails the send).
          void this.appendToSent(creds, {
            from: fromAddr ? `${fromName} <${fromAddr}>` : fromName,
            to: toEmail,
            subject,
            text: textBody || ' ',
            html: textBody ? textBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : undefined,
            attachments,
            messageId: info?.messageId,
            ...threadRefs,
          });
          break;
        }

        default:
          break;
      }
    } catch (e: any) {
      console.error(`[deliverOutbound] ${e.message}`);
    }
  }
}
