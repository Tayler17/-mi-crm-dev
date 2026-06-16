import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, UploadedFile, UseInterceptors, UsePipes, ValidationPipe, BadRequestException, Query } from '@nestjs/common';
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
  getMessages(@Param('conversationId') cid: string, @TenantId() tenantId: string) {
    return this.service.findByConversation(cid, tenantId);
  }

  @Post('messages')
  async sendMessage(
    @Param('conversationId') cid: string,
    @Body() dto: CreateMessageDto,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    const msg = await this.service.create(cid, dto, tenantId, req.user.id);

    // Deliver through the conversation's actual channel (WA Web, Telegram, etc.)
    await this.deliverOutbound(cid, tenantId, dto.body ?? '', dto.contentType, msg.id);

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

  private async deliverOutbound(conversationId: string, tenantId: string, text: string, contentType = 'text', messageId?: string) {
    if (!text) return;
    // Defensive: a body shaped like "/uploads/x.ext|name[|caption]" is ALWAYS a
    // media message — infer the type from the extension regardless of the passed
    // contentType, so the recipient never receives a raw /uploads path as text.
    if (/^\/uploads\/\S+\|/.test(text)) {
      const ext = (text.split('|')[0].split('.').pop() ?? '').toLowerCase();
      contentType = /^(jpg|jpeg|png|gif|webp|bmp|heic)$/.test(ext) ? 'image'
        : /^(mp3|ogg|oga|m4a|wav|opus|aac)$/.test(ext) ? 'audio'
        : /^(mp4|mov|avi|webm|3gp)$/.test(ext) ? 'video'
        : 'file';
    }
    try {
      const [conv] = await this.db.query(
        `SELECT c.channel_type, c.connection_id, c.external_id,
                cc.channel_type AS conn_channel_type, cc.credentials
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
          let waId: string | false = false;
          if (contentType === 'image' || contentType === 'audio' || contentType === 'video' || contentType === 'file') {
            const [fileUrl, , fileCaption] = text.split('|');
            waId = await this.waSvc.sendFile(connectionId, remoteJid, fileUrl, contentType, fileCaption || undefined);
          } else {
            waId = await this.waSvc.sendMessage(connectionId, remoteJid, text);
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

        default:
          break;
      }
    } catch (e: any) {
      console.error(`[deliverOutbound] ${e.message}`);
    }
  }
}
