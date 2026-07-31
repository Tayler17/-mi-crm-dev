import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

/** Transcode an audio file to mp3 so it plays on every device/browser (ogg/opus fails
 *  on Safari/iOS). Returns the output path, or throws on ffmpeg failure. */
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

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /** In-memory cache: "facebook:PSID" → real name. Cleared on restart, that's fine. */
  private readonly metaNameCache = new Map<string, string>();

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Token verification ────────────────────────────────────────────────────────

  async verifyWebhookToken(connectionId: string, token: string): Promise<boolean> {
    const conn = await this.getConnection(connectionId);
    if (!conn) return false;
    const stored = conn.credentials?.webhookVerifyToken;
    // If no token configured, allow any (dev mode); otherwise must match
    return !stored || stored === token;
  }

  // ── WhatsApp Business API (Meta) ─────────────────────────────────────────────

  async processWhatsApp(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value;
          if (!value?.messages) continue;
          for (const msg of value.messages) {
            const waId  = msg.from;
            const name  = value.contacts?.find((c: any) => c.wa_id === waId)?.profile?.name ?? waId;
            const { body, contentType } = await this.extractWhatsAppContent(msg, conn.credentials?.accessToken ?? '');
            await this.upsertMessage({
              tenantId: conn.tenant_id, connectionId,
              inboxId: conn.inbox_id, channel: 'whatsapp',
              externalId: waId, contactName: name, contactPhone: waId,
              messageExtId: msg.id, body, contentType,
            });
          }
        }
      }
    } catch (err) {
      this.logger.error(`WhatsApp webhook error [${connectionId}]: ${err}`);
    }
  }

  /** Build body + content_type for a WhatsApp Cloud API message.
   *  Media (image/audio/video/document/sticker) arrives as a media ID that must be
   *  downloaded via the Graph API; we store it under uploads/messages and format the
   *  body as `fileUrl|origName|caption` so the inbox renders it like the WhatsApp Web channel. */
  private async extractWhatsAppContent(msg: any, token: string): Promise<{ body: string; contentType: string }> {
    const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];
    if (!MEDIA_TYPES.includes(msg.type)) {
      // Shared contact card(s): the details arrive in msg.contacts, not as text.
      if (msg.type === 'contacts' && Array.isArray(msg.contacts) && msg.contacts.length) {
        const parts = msg.contacts.map((c: any) => {
          const nm = c?.name?.formatted_name
            || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(' ').trim()
            || 'Contacto';
          const phone = c?.phones?.[0]?.phone || c?.phones?.[0]?.wa_id || '';
          return (phone ? `${nm} — ${phone}` : nm).replace(/\|/g, ' ');
        });
        return { body: `👤 Contacto compartido: ${parts.join('; ')}`, contentType: 'text' };
      }
      // Emoji reaction to one of our messages (msg.reaction = { message_id, emoji }).
      // An empty emoji means the reaction was removed.
      if (msg.type === 'reaction') {
        const emoji = msg.reaction?.emoji;
        return { body: emoji ? `Reaccionó con ${emoji}` : 'Quitó su reacción', contentType: 'text' };
      }
      const text = msg.text?.body
        ?? msg.button?.text
        ?? msg.interactive?.list_reply?.title
        ?? msg.interactive?.button_reply?.title
        ?? msg.type
        ?? '(mensaje)';
      return { body: text, contentType: 'text' };
    }

    const mediaObj = msg[msg.type];
    const media = mediaObj?.id ? await this.downloadWhatsAppMedia(mediaObj.id, token) : null;
    if (!media?.buffer?.length) {
      const labels: Record<string, string> = { image: '[Imagen]', audio: '[Audio]', video: '[Video]', document: '[Documento]', sticker: '[Sticker]' };
      return { body: labels[msg.type] ?? `[${msg.type}]`, contentType: 'text' };
    }

    const mime = mediaObj?.mime_type ?? media.mime ?? '';
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
      'video/mp4': '.mp4', 'video/3gpp': '.3gp',
      'audio/ogg; codecs=opus': '.ogg', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/amr': '.amr',
      'application/pdf': '.pdf',
    };
    const ext = extMap[mime] || (mime.split('/')[1] ? `.${mime.split('/')[1].split(';')[0]}` : '.bin');
    const uploadsDir = join(process.cwd(), 'uploads', 'messages');
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
    let filename = `wa-${Date.now()}${ext}`;
    writeFileSync(join(uploadsDir, filename), media.buffer);
    // Incoming voice notes are ogg/opus → transcode to mp3 so they play on iOS/Safari
    // (the native <audio> element can't decode ogg/opus there).
    if (msg.type === 'audio' && !/\.mp3$/i.test(filename)) {
      try {
        const outPath = await transcodeToMp3(join(uploadsDir, filename));
        try { unlinkSync(join(uploadsDir, filename)); } catch {}
        filename = outPath.split(/[\\/]/).pop()!;
      } catch (e: any) { this.logger.warn(`WA audio transcode failed: ${e.message}`); }
    }
    const fileUrl  = `/uploads/messages/${filename}`;
    const origName = String(mediaObj?.filename ?? filename).replace(/\|/g, ' ');
    const caption  = String(mediaObj?.caption ?? '').replace(/\|/g, ' ').trim();
    const body = caption ? `${fileUrl}|${origName}|${caption}` : `${fileUrl}|${origName}`;

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'];
    let contentType: string;
    if (msg.type === 'image' || msg.type === 'sticker') contentType = 'image';
    else if (msg.type === 'document' && imageExts.includes(ext.toLowerCase())) contentType = 'image';
    else if (msg.type === 'audio') contentType = 'audio';
    else if (msg.type === 'video') contentType = 'video';
    else contentType = 'file';

    return { body, contentType };
  }

  /** Download WhatsApp Cloud API media: resolve the media ID to a URL, then fetch the
   *  binary (both calls require the Bearer token). Returns null on any failure. */
  private async downloadWhatsAppMedia(mediaId: string, token: string): Promise<{ buffer: Buffer; mime: string } | null> {
    if (!token) return null;
    try {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meta: any = await metaRes.json();
      if (!meta?.url) {
        this.logger.warn(`WA media ${mediaId}: no url (${JSON.stringify(meta?.error ?? meta)})`);
        return null;
      }
      const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!binRes.ok) {
        this.logger.warn(`WA media ${mediaId}: download HTTP ${binRes.status}`);
        return null;
      }
      const buffer = Buffer.from(await binRes.arrayBuffer());
      return { buffer, mime: meta.mime_type ?? '' };
    } catch (e: any) {
      this.logger.warn(`WA media download failed (${mediaId}): ${e.message}`);
      return null;
    }
  }

  // ── Facebook Messenger ────────────────────────────────────────────────────────

  async processFacebook(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      const accessToken = conn.credentials?.accessToken ?? '';

      for (const entry of body?.entry ?? []) {
        for (const event of entry?.messaging ?? []) {
          if (!event?.message) continue;           // ignore delivery/read receipts
          if (event.message.is_echo) continue;     // ignore echoes of our own messages

          const senderId = String(event.sender?.id ?? '');
          const text = event.message.text ?? '(media)';
          const contactName = await this.fetchMetaUserName(senderId, accessToken, 'facebook');
          await this.upsertMessage({
            tenantId: conn.tenant_id, connectionId,
            inboxId: conn.inbox_id, channel: 'facebook',
            externalId: senderId, contactName, contactPhone: senderId,
            messageExtId: event.message.mid ?? String(event.timestamp),
            body: text,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Facebook webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Instagram DM ──────────────────────────────────────────────────────────────

  async processInstagram(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      const accessToken = conn.credentials?.accessToken ?? '';

      for (const entry of body?.entry ?? []) {
        for (const event of entry?.messaging ?? []) {
          if (!event?.message) continue;
          if (event.message.is_echo) continue;

          const senderId = String(event.sender?.id ?? '');
          const text = event.message.text ?? '(media)';
          const contactName = await this.fetchMetaUserName(senderId, accessToken, 'instagram');
          await this.upsertMessage({
            tenantId: conn.tenant_id, connectionId,
            inboxId: conn.inbox_id, channel: 'instagram',
            externalId: senderId, contactName, contactPhone: senderId,
            messageExtId: event.message.mid ?? String(event.timestamp),
            body: text,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Instagram webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Telegram ─────────────────────────────────────────────────────────────────

  async processTelegram(connectionId: string, body: any): Promise<void> {
    try {
      const conn = await this.getConnection(connectionId);
      if (!conn) return;

      const msg = body?.message ?? body?.edited_message;
      if (!msg) return;

      const chatId = String(msg.chat?.id ?? '');
      const text   = msg.text ?? msg.caption ?? '(media)';
      const from   = msg.from;
      const name   = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username || chatId;

      await this.upsertMessage({
        tenantId: conn.tenant_id, connectionId,
        inboxId: conn.inbox_id, channel: 'telegram',
        externalId: chatId, contactName: name,
        contactPhone: from?.username ? `@${from.username}` : chatId,
        messageExtId: String(msg.message_id), body: text,
      });
    } catch (err) {
      this.logger.error(`Telegram webhook error [${connectionId}]: ${err}`);
    }
  }

  // ── Core: upsert contact + conversation + message ─────────────────────────────

  private async upsertMessage(opts: {
    tenantId: string; connectionId: string; inboxId: string | null;
    channel: string; externalId: string; contactName: string; contactPhone: string;
    messageExtId: string; body: string; contentType?: string;
  }) {
    const { tenantId, connectionId, inboxId, channel, externalId, contactName, contactPhone, messageExtId, body, contentType = 'text' } = opts;

    // 1. Find or create contact
    const [existing] = await this.db.query(
      `SELECT id, full_name FROM contacts WHERE tenant_id=$1 AND phone=$2 LIMIT 1`,
      [tenantId, contactPhone],
    );
    let contactId: string;
    if (existing) {
      contactId = existing.id;
      // If the contact was saved with just the numeric ID as name, update to real name now
      if (contactName !== contactPhone && existing.full_name === contactPhone) {
        await this.db.query(
          `UPDATE contacts SET full_name=$1, updated_at=NOW() WHERE id=$2`,
          [contactName, contactId],
        ).catch(() => {});
      }
    } else {
      const [newContact] = await this.db.query(
        `INSERT INTO contacts (tenant_id, full_name, phone, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id`,
        [tenantId, contactName, contactPhone],
      );
      contactId = newContact.id;
    }

    // 2. Find or REOPEN the contact's conversation so the whole history stays in ONE chat.
    // Look at the latest conversation regardless of status: if it was resolved, reopen it
    // and bump session_count (each reopen still counts as a conversation for reporting).
    // Only create a brand-new conversation when the contact has none at all.
    const [existingConv] = await this.db.query(
      `SELECT id, status FROM conversations
       WHERE tenant_id=$1 AND contact_id=$2 AND connection_id=$3
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, contactId, connectionId],
    );
    let conversationId: string;
    let isNew = false;
    if (existingConv) {
      conversationId = existingConv.id;
      if (existingConv.status === 'resolved') {
        await this.db.query(
          `UPDATE conversations SET status='open', session_count=session_count+1, updated_at=NOW() WHERE id=$1`,
          [conversationId],
        );
      }
    } else {
      const [newConv] = await this.db.query(
        `INSERT INTO conversations
           (tenant_id, contact_id, inbox_id, connection_id, external_id, channel_type, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NOW()) RETURNING id`,
        [tenantId, contactId, inboxId ?? null, connectionId, externalId, channel],
      );
      conversationId = newConv.id;
      isNew = true;
    }

    // 3. Dedup by external message ID
    const [dup] = await this.db.query(
      `SELECT id FROM messages WHERE external_id=$1 AND conversation_id=$2 LIMIT 1`,
      [messageExtId, conversationId],
    );
    if (dup) return;

    // 4. Insert message
    await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, external_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'inbound','contact',false,$5,NOW(),NOW())`,
      [tenantId, conversationId, body, contentType, messageExtId],
    );
    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [conversationId],
    );

    // 5a. SSE push so inbox updates in real-time
    this.notifications.emit({
      tenantId,
      type: 'message_created',
      payload: {
        conversationId,
        message: { conversationId, body, direction: 'inbound', senderType: 'contact', contentType, isPrivate: false, createdAt: new Date().toISOString() },
      },
    });

    // 5b. Internal events for AI chatbots / automations
    const convPayload = { tenantId, conversationId, conversation: { id: conversationId, contact_id: contactId, inbox_id: inboxId, channel } };
    if (isNew) this.events.emit('conversation.created', convPayload);
    this.events.emit('conversation.message_received', {
      ...convPayload,
      message: { body, direction: 'inbound', is_private: false, content_type: contentType },
    });

    this.logger.log(`[${channel}] msg from ${contactName} → conv ${conversationId}`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Fetch the real display name for a Facebook/Instagram sender via Graph API.
   *  Falls back to the raw senderId if the call fails or the token is missing. */
  private async fetchMetaUserName(
    senderId: string,
    accessToken: string,
    channel: 'facebook' | 'instagram',
  ): Promise<string> {
    if (!accessToken || !senderId) return senderId;
    const cacheKey = `${channel}:${senderId}`;
    if (this.metaNameCache.has(cacheKey)) return this.metaNameCache.get(cacheKey)!;
    try {
      const fields = channel === 'instagram' ? 'name,username' : 'name';
      const res = await (globalThis as any).fetch(
        `https://graph.facebook.com/v21.0/${senderId}?fields=${fields}&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return senderId;
      const data = await res.json();
      const name: string = data.name || (data.username ? `@${data.username}` : '') || senderId;
      this.metaNameCache.set(cacheKey, name);
      return name;
    } catch {
      return senderId; // network error or token expired → fall back to ID
    }
  }

  private async getConnection(connectionId: string) {
    const [conn] = await this.db.query(
      `SELECT id, tenant_id, inbox_id, channel_type, credentials, status
       FROM channel_connections WHERE id=$1 LIMIT 1`,
      [connectionId],
    );
    return conn ?? null;
  }
}
