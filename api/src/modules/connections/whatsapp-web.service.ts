import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';

@Injectable()
export class WhatsappWebService {
  private readonly logger = new Logger(WhatsappWebService.name);
  private readonly sessions  = new Map<string, { status: string; qr: string | null; sock?: any }>();
  /** Maps LID digits → real phone digits for each connection, populated by contacts.upsert */
  private readonly lidToPhone = new Map<string, Map<string, string>>();

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  async getQr(connectionId: string, _tenantId: string): Promise<{ qr: string | null; status: string }> {
    const existing = this.sessions.get(connectionId);
    if (existing?.status === 'connected')  return { qr: null,          status: 'connected' };
    if (existing?.status === 'waiting_qr') return { qr: existing.qr,   status: 'waiting_qr' };
    if (existing?.status === 'starting')   return { qr: null,          status: 'starting' };
    if (existing?.status === 'connecting') return { qr: null,          status: 'starting' };

    if (process.env.WHATSAPP_WEB_ENABLED === 'true') {
      return this.startBaileysSession(connectionId, _tenantId);
    }
    return this.getPlaceholderQr(connectionId);
  }

  disconnectSession(connectionId: string) {
    const s = this.sessions.get(connectionId);
    if (s?.sock) { try { s.sock.end(undefined); } catch {} }
    this.sessions.delete(connectionId);
  }

  /** Send an outbound text message through an active WhatsApp Web session */
  async sendMessage(connectionId: string, remoteJid: string, text: string): Promise<boolean> {
    const session = this.sessions.get(connectionId);
    if (!session?.sock || session.status !== 'connected') {
      this.logger.warn(`sendMessage: no active session for ${connectionId}`);
      return false;
    }
    try {
      await session.sock.sendMessage(remoteJid, { text });
      return true;
    } catch (e: any) {
      this.logger.error(`sendMessage failed for ${connectionId}: ${e.message}`);
      return false;
    }
  }

  /** Send a media file through an active WhatsApp Web session */
  async sendFile(connectionId: string, remoteJid: string, fileUrl: string, contentType: string): Promise<boolean> {
    const session = this.sessions.get(connectionId);
    if (!session?.sock || session.status !== 'connected') {
      this.logger.warn(`sendFile: no active session for ${connectionId}`);
      return false;
    }
    try {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const filePath = join(process.cwd(), fileUrl); // fileUrl is like /uploads/xxx.jpg
      const buffer = readFileSync(filePath);
      const filename = fileUrl.split('/').pop() ?? 'file';
      const ext = filename.split('.').pop()?.toLowerCase() ?? '';

      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        mp4: 'video/mp4', '3gp': 'video/3gpp',
        ogg: 'audio/ogg; codecs=opus', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
        pdf: 'application/pdf', doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        zip: 'application/zip', txt: 'text/plain',
      };
      const mimetype = mimeMap[ext] ?? 'application/octet-stream';

      if (contentType === 'image') {
        await session.sock.sendMessage(remoteJid, { image: buffer, mimetype, caption: '' });
      } else if (contentType === 'audio') {
        await session.sock.sendMessage(remoteJid, { audio: buffer, mimetype, ptt: ext === 'ogg' });
      } else if (contentType === 'video') {
        await session.sock.sendMessage(remoteJid, { video: buffer, mimetype });
      } else {
        await session.sock.sendMessage(remoteJid, { document: buffer, mimetype, fileName: filename });
      }
      return true;
    } catch (e: any) {
      this.logger.error(`sendFile failed for ${connectionId}: ${e.message}`);
      return false;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async getPlaceholderQr(connectionId: string): Promise<{ qr: string | null; status: string }> {
    try {
      // @ts-ignore
      const qrcode = await import('qrcode');
      const dataUrl = await qrcode.toDataURL(
        `whatsapp://wa.me/?text=CRM-WA-${connectionId.slice(0, 8)}`,
        { width: 256, margin: 1 },
      );
      return { qr: dataUrl, status: 'waiting_qr' };
    } catch {
      return { qr: null, status: 'waiting_qr' };
    }
  }

  private async startBaileysSession(
    connectionId: string,
    tenantId: string,
    existingAuthState?: any,
  ): Promise<{ qr: string | null; status: string }> {
    try {
      // @ts-ignore — baileys is ESM-only
      const baileys = await import('@whiskeysockets/baileys');
      const {
        makeWASocket, initAuthCreds, makeCacheableSignalKeyStore,
        fetchLatestBaileysVersion, Browsers, DisconnectReason,
        getContentType, jidNormalizedUser, isJidGroup,
        isJidBroadcast, isJidStatusBroadcast,
      } = baileys as any;
      // @ts-ignore
      const qrcode = await import('qrcode');

      const { version } = await fetchLatestBaileysVersion();

      const silentLog = {
        level: 'silent' as const,
        trace: (..._: any[]) => {}, debug: (..._: any[]) => {},
        info:  (..._: any[]) => {}, warn:  (..._: any[]) => {},
        error: (..._: any[]) => {}, fatal: (..._: any[]) => {},
        child: () => silentLog, bindings: () => ({}), flush: () => {},
      };

      let authState: any;
      if (existingAuthState) {
        authState = existingAuthState;
      } else {
        const creds = initAuthCreds();
        const keyCache: Record<string, any> = {};
        authState = {
          creds,
          keys: makeCacheableSignalKeyStore({
            get: async (type: string, ids: string[]) => {
              const r: Record<string, any> = {};
              for (const id of ids) r[id] = keyCache[`${type}:${id}`] ?? null;
              return r;
            },
            set: async (data: Record<string, Record<string, any>>) => {
              for (const [t, e] of Object.entries(data ?? {})) {
                for (const [id, v] of Object.entries(e ?? {})) {
                  if (v != null) keyCache[`${t}:${id}`] = v;
                  else delete keyCache[`${t}:${id}`];
                }
              }
            },
          }, silentLog),
        };
      }

      this.sessions.set(connectionId, { status: 'starting', qr: null });

      const sock = makeWASocket({
        version,
        auth: authState,
        printQRInTerminal: false,
        logger: silentLog,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        markOnlineOnConnect: false,
        retryRequestDelayMs: 500,
        getMessage: async () => undefined,
      });

      this.sessions.set(connectionId, { status: 'starting', qr: null, sock });
      try { sock.ws?.on?.('error', () => {}); } catch {}

      // ── Connection lifecycle ──────────────────────────────────────────────

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, qr, lastDisconnect } = update;
        const code: number = (lastDisconnect?.error as any)?.output?.statusCode;

        if (qr) {
          try {
            const dataUrl = await qrcode.toDataURL(qr, { width: 256, margin: 1 });
            this.sessions.set(connectionId, { status: 'waiting_qr', qr: dataUrl, sock });
          } catch {}
        }

        if (connection === 'open') {
          this.sessions.set(connectionId, { status: 'connected', qr: null, sock });
          this.logger.log(`WhatsApp Web connected: ${connectionId}`);
          await this.db.query(
            `UPDATE channel_connections SET status='connected', last_tested_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [connectionId],
          ).catch(() => {});
        }

        if (connection === 'close') {
          this.logger.warn(`WhatsApp close code=${code} conn=${connectionId}`);
          // codes that mean the session is permanently gone — need re-scan
          const permanent = code === 401 || code === 403 || code === 500 || code === 440;
          if (!permanent) {
            // transient disconnect (408 connectionLost, 428 connectionClosed, 515 restartRequired, etc.)
            // — auto-reconnect
            this.logger.log(`Auto-reconnecting (code=${code}) conn=${connectionId}`);
            this.sessions.set(connectionId, { status: 'connecting', qr: null });
            try { sock.end(undefined); } catch {}
            const delay = code === DisconnectReason.restartRequired ? 1000 : 5000;
            setTimeout(() => {
              this.startBaileysSession(connectionId, tenantId, authState).catch(() => {
                this.sessions.delete(connectionId);
              });
            }, delay);
            return;
          }
          // permanent disconnect — mark disconnected and require QR re-scan
          this.logger.warn(`Permanent disconnect (code=${code}) conn=${connectionId} — requires re-scan`);
          this.sessions.delete(connectionId);
          await this.db.query(
            `UPDATE channel_connections SET status='disconnected', updated_at=NOW() WHERE id=$1`,
            [connectionId],
          ).catch(() => {});
        }
      });

      sock.ev.on('creds.update', (u: any) => {
        try { Object.assign(authState.creds, u); } catch {}
      });

      // ── Contact map: LID → real phone ─────────────────────────────────────
      // Baileys fires contacts.upsert with both LID and phone JIDs.
      // We build a map so that when a @lid message arrives we can resolve
      // the sender's actual phone number.
      if (!this.lidToPhone.has(connectionId)) {
        this.lidToPhone.set(connectionId, new Map());
      }
      const lidMap = this.lidToPhone.get(connectionId)!;

      const processContacts = (contacts: any[]) => {
        for (const c of contacts ?? []) {
          try {
            // Pattern A: contact has both .id (@s.whatsapp.net) and .lid (@lid)
            if (c.id?.endsWith('@s.whatsapp.net') && c.lid) {
              const phone = c.id.replace('@s.whatsapp.net', '');
              const lid   = String(c.lid).replace('@lid', '');
              if (phone && lid) lidMap.set(lid, phone);
            }
            // Pattern B: id is @lid and there's a notify/phone field
            if (c.id?.endsWith('@lid') && c.phone) {
              const lid   = c.id.replace('@lid', '');
              const phone = String(c.phone).replace(/\D/g, '');
              if (phone && lid) lidMap.set(lid, phone);
            }
          } catch {}
        }
      };

      sock.ev.on('contacts.upsert',  processContacts);
      sock.ev.on('contacts.update',  processContacts);

      // ── Incoming messages ─────────────────────────────────────────────────

      sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          try {
            await this.handleIncomingMessage(connectionId, tenantId, msg, {
              getContentType, jidNormalizedUser, isJidGroup,
              isJidBroadcast, isJidStatusBroadcast,
              downloadMediaMessage: baileys.downloadMediaMessage,
            }, lidMap, sock);
          } catch (e: any) {
            this.logger.error(`Failed to process WA message: ${e.message}`);
          }
        }
      });

      return { qr: null, status: 'starting' };
    } catch (e: any) {
      this.sessions.delete(connectionId);
      this.logger.error(`Baileys session failed: ${e.message}`);
      return { qr: null, status: 'error' };
    }
  }

  // ── Incoming message handler ────────────────────────────────────────────────

  private async handleIncomingMessage(
    connectionId: string,
    tenantId: string,
    msg: any,
    helpers: any,
    lidMap?: Map<string, string>,
    sock?: any,
  ) {
    const { getContentType, jidNormalizedUser, isJidGroup, isJidBroadcast, isJidStatusBroadcast, downloadMediaMessage } = helpers;

    if (msg.key?.fromMe) return;

    const remoteJid: string = msg.key?.remoteJid ?? '';
    if (isJidGroup(remoteJid))           return;
    if (isJidBroadcast(remoteJid))       return;
    if (isJidStatusBroadcast(remoteJid)) return;

    const msgContent = msg.message;
    if (!msgContent) return;

    const contentType = getContentType(msgContent);

    // ── Media download ──────────────────────────────────────────────────────
    let dbContentType = 'text';
    let body          = '';

    const isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(contentType);

    if (isMedia && sock && downloadMediaMessage) {
      try {
        const buffer: Buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: { level: 'silent' } as any, reuploadRequest: sock.updateMediaMessage });
        if (buffer?.length) {
          // Determine extension from mimetype
          const mime: string = msgContent[contentType]?.mimetype ?? '';
          const extMap: Record<string, string> = {
            'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
            'video/mp4': '.mp4', 'video/3gpp': '.3gp',
            'audio/ogg; codecs=opus': '.ogg', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
            'application/pdf': '.pdf',
          };
          const ext = extMap[mime] || (mime.split('/')[1] ? `.${mime.split('/')[1].split(';')[0]}` : '.bin');
          const uploadsDir = join(process.cwd(), 'uploads');
          if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
          const filename = `wa-${Date.now()}${ext}`;
          writeFileSync(join(uploadsDir, filename), buffer);
          const fileUrl  = `/uploads/${filename}`;
          const origName = msgContent.documentMessage?.fileName ?? msgContent.audioMessage?.fileName ?? filename;
          body = `${fileUrl}|${origName}`;
          if (contentType === 'imageMessage' || contentType === 'stickerMessage') dbContentType = 'image';
          else if (contentType === 'audioMessage') dbContentType = 'audio';
          else if (contentType === 'videoMessage') dbContentType = 'video';
          else dbContentType = 'file';
        }
      } catch (e: any) {
        this.logger.warn(`Media download failed (${contentType}): ${e.message}`);
      }
    }

    // Fallback: text representation
    if (!body) {
      dbContentType = 'text';
      switch (contentType) {
        case 'conversation':        body = msgContent.conversation ?? ''; break;
        case 'extendedTextMessage': body = msgContent.extendedTextMessage?.text ?? ''; break;
        case 'imageMessage':        body = msgContent.imageMessage?.caption || '[Imagen]'; break;
        case 'videoMessage':        body = msgContent.videoMessage?.caption || '[Video]'; break;
        case 'audioMessage':        body = '[Audio]'; break;
        case 'documentMessage':     body = `[Documento: ${msgContent.documentMessage?.fileName ?? 'archivo'}]`; break;
        case 'stickerMessage':      body = '[Sticker]'; break;
        case 'locationMessage':     body = '[Ubicación]'; break;
        case 'contactMessage':      body = `[Contacto: ${msgContent.contactMessage?.displayName ?? ''}]`; break;
        default:                    body = `[${contentType ?? 'mensaje'}]`;
      }
    }
    if (!body) return;

    // Normalise the JID and resolve real phone number
    const normalizedJid = jidNormalizedUser(remoteJid);
    const isLid = normalizedJid.endsWith('@lid');
    const rawDigits = normalizedJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');

    let cleanPhone: string;
    let resolvedJid = normalizedJid; // JID used for routing replies

    if (isLid) {
      // Try to resolve the real phone number from the LID→phone map
      // (populated by contacts.upsert events from Baileys)
      const realPhone = lidMap?.get(rawDigits);
      if (realPhone) {
        // We know the real number — use it as both phone and routing JID
        cleanPhone  = realPhone;
        resolvedJid = `${realPhone}@s.whatsapp.net`;
        this.logger.debug(`LID ${rawDigits} resolved to phone ${realPhone}`);
      } else {
        // Not yet in map — store as 'lid:DIGITS' so the UI doesn't show
        // random digits as if they were a phone number.
        // We keep the original LID JID for routing replies.
        cleanPhone = `lid:${rawDigits}`;
      }
    } else {
      cleanPhone  = rawDigits;
      resolvedJid = normalizedJid;
    }
    const msgId   = msg.key?.id ?? `${Date.now()}`;
    const pushName = msg.pushName ?? cleanPhone;

    const [conn] = await this.db.query(
      `SELECT inbox_id, tenant_id FROM channel_connections WHERE id=$1 LIMIT 1`,
      [connectionId],
    );
    if (!conn) return;

    const inboxId = conn.inbox_id ?? null;
    const tId     = tenantId || conn.tenant_id;

    // 1. Find or create contact — look up by cleanPhone, normalizedJid, or the old lid: prefix
    const [existingContact] = await this.db.query(
      `SELECT id FROM contacts WHERE tenant_id=$1 AND (phone=$2 OR phone=$3 OR phone=$4) LIMIT 1`,
      [tId, cleanPhone, normalizedJid, `lid:${rawDigits}`],
    );
    let contactId: string;
    if (existingContact) {
      contactId = existingContact.id;
      // Backfill: fix stored phone if it's a raw JID, an old lid:prefix, or bare LID digits
      // (only when we actually have a better value now)
      await this.db.query(
        `UPDATE contacts SET phone=$1, updated_at=NOW()
         WHERE id=$2 AND (phone LIKE '%@%' OR phone LIKE 'lid:%' OR phone=$3)`,
        [cleanPhone, contactId, rawDigits],
      ).catch(() => {});
      if (pushName && pushName !== cleanPhone) {
        await this.db.query(
          `UPDATE contacts SET full_name=$1, updated_at=NOW() WHERE id=$2 AND (full_name IS NULL OR full_name=$3 OR full_name=$4)`,
          [pushName, contactId, cleanPhone, normalizedJid],
        ).catch(() => {});
      }
    } else {
      const [newContact] = await this.db.query(
        `INSERT INTO contacts (tenant_id, full_name, phone, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id`,
        [tId, pushName || cleanPhone, cleanPhone],
      );
      contactId = newContact.id;
    }

    // 2. Find or create open conversation — keyed by connectionId + remoteJid
    const [existingConv] = await this.db.query(
      `SELECT id FROM conversations
       WHERE tenant_id=$1 AND contact_id=$2 AND connection_id=$3 AND status != 'resolved'
       ORDER BY created_at DESC LIMIT 1`,
      [tId, contactId, connectionId],
    );
    let conversationId: string;
    let isNew = false;
    if (existingConv) {
      conversationId = existingConv.id;
      // If the conversation was stored with a LID JID but we now know the real phone,
      // backfill the external_id so future outbound delivery uses the correct JID.
      if (resolvedJid !== remoteJid) {
        await this.db.query(
          `UPDATE conversations SET external_id=$1 WHERE id=$2 AND (external_id LIKE '%@lid' OR external_id IS NULL)`,
          [resolvedJid, conversationId],
        ).catch(() => {});
      }
    } else {
      // Auto-subject: use WhatsApp display name if available, otherwise phone number
      const autoSubject = (pushName && pushName !== cleanPhone && pushName !== `lid:${rawDigits}`)
        ? pushName
        : cleanPhone;

      const [newConv] = await this.db.query(
        `INSERT INTO conversations
           (tenant_id, contact_id, inbox_id, connection_id, external_id, channel_type, status, subject, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'whatsapp_web','open',$6,NOW(),NOW()) RETURNING id`,
        [tId, contactId, inboxId, connectionId, resolvedJid, autoSubject],
      );
      conversationId = newConv.id;
      isNew = true;
    }

    // 3. Dedup
    const [dup] = await this.db.query(
      `SELECT id FROM messages WHERE external_id=$1 AND conversation_id=$2 LIMIT 1`,
      [msgId, conversationId],
    );
    if (dup) return;

    // 4. Insert message
    const msgTs = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type,
          is_private, external_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'inbound','contact',false,$5,$6,$6)`,
      [tId, conversationId, body, dbContentType, msgId, msgTs],
    );

    await this.db.query(
      `UPDATE conversations SET last_message_at=$1, updated_at=NOW() WHERE id=$2`,
      [msgTs, conversationId],
    );

    this.logger.log(`[whatsapp_web] ${pushName} → conv ${conversationId}: "${body.slice(0, 60)}"`);

    // Build the new message object for SSE
    const newMessage = {
      id: msgId,
      conversationId,
      body,
      direction: 'inbound',
      senderType: 'contact',
      contentType: dbContentType,
      isPrivate: false,
      createdAt: msgTs,
    };

    // 5a. Emit SSE to push update to inbox in real-time (no page refresh needed)
    this.notifications.emit({
      tenantId: tId,
      type: 'message_created',
      payload: { conversationId, message: newMessage },
    });

    // 5b. Emit internal events for AI chatbots / automations
    const convPayload = {
      tenantId: tId, conversationId,
      conversation: { id: conversationId, contact_id: contactId, inbox_id: inboxId, channel: 'whatsapp_web' },
    };
    if (isNew) this.events.emit('conversation.created', convPayload);
    this.events.emit('conversation.message_received', {
      ...convPayload,
      message: { body, direction: 'inbound', is_private: false, content_type: dbContentType },
    });
  }
}
