import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';

@Injectable()
export class WhatsappWebService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappWebService.name);
  private readonly sessions    = new Map<string, { status: string; qr: string | null; sock?: any }>();
  /** Consecutive transient-disconnect counter per connection — resets on successful connect */
  private readonly reconnectCount = new Map<string, number>();
  /** Connections being intentionally disconnected — skip auto-reconnect in the close handler */
  private readonly intentionalDisconnects = new Set<string>();
  /** Maps LID digits → real phone digits for each connection, populated by contacts.upsert */
  private readonly lidToPhone = new Map<string, Map<string, string>>();
  /** Guard: prevents concurrent startBaileysSession calls for the same connectionId */
  private readonly sessionStarting = new Set<string>();
  /** Cached WA Web version — fetched once per process to avoid repeated HTTP calls on every reconnect */
  private cachedWaVersion: number[] | null = null;
  /** Monotonic counter — each new Baileys socket gets a unique ID for log correlation */
  private socketSeq = 0;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    if (process.env.WHATSAPP_WEB_ENABLED !== 'true') return;
    try {
      // Only auto-resume sessions that have saved creds — if creds were cleared, the session is dead
      const rows = await this.db.query(
        `SELECT cc.id, cc.tenant_id FROM channel_connections cc
         INNER JOIN wa_session_creds wsc ON wsc.connection_id = cc.id
         WHERE cc.channel_type = 'whatsapp_web' AND cc.status = 'connected'`,
      );
      for (const row of rows) {
        this.logger.log(`Auto-resuming WhatsApp Web session: ${row.id}`);
        const delay = 3000 * rows.indexOf(row); // stagger to avoid overwhelming WA servers
        setTimeout(() => {
          this.startBaileysSession(row.id, row.tenant_id).catch((e: any) => {
            this.logger.warn(`Failed to auto-resume session ${row.id}: ${e.message}`);
          });
        }, delay);
      }
    } catch (e: any) {
      this.logger.warn(`Failed to load WhatsApp Web sessions on startup: ${e.message}`);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Read-only: returns current session state without side effects. Never starts a session. */
  async getQr(connectionId: string): Promise<{ qr: string | null; status: string }> {
    const existing = this.sessions.get(connectionId);
    if (existing?.status === 'connected')  return { qr: null,        status: 'connected' };
    if (existing?.status === 'waiting_qr') return { qr: existing.qr, status: 'waiting_qr' };
    if (existing?.status === 'starting')   return { qr: null,        status: 'starting' };
    if (existing?.status === 'connecting') return { qr: null,        status: 'starting' };
    if (existing?.status === 'pausing')    return { qr: null,        status: 'pausing' };
    return { qr: null, status: 'disconnected' };
  }

  /** Explicitly start a Baileys session. Must only be called via explicit user action (POST /qr). */
  async startSession(connectionId: string, tenantId: string): Promise<{ qr: string | null; status: string }> {
    const existing = this.sessions.get(connectionId);
    if (existing?.status === 'connected')  return { qr: null,        status: 'connected' };
    if (existing?.status === 'waiting_qr') return { qr: existing.qr, status: 'waiting_qr' };
    if (existing?.status === 'starting')   return { qr: null,        status: 'starting' };
    if (existing?.status === 'connecting') return { qr: null,        status: 'starting' };
    if (existing?.status === 'pausing')    return { qr: null,        status: 'pausing' };
    if (process.env.WHATSAPP_WEB_ENABLED === 'true') {
      return this.startBaileysSession(connectionId, tenantId);
    }
    return this.getPlaceholderQr(connectionId);
  }

  async disconnectSession(connectionId: string) {
    this.intentionalDisconnects.add(connectionId);
    const s = this.sessions.get(connectionId);
    if (s?.sock) { try { s.sock.end(undefined); } catch {} }
    this.sessions.delete(connectionId);
    this.reconnectCount.delete(connectionId);
    await Promise.all([
      this.db.query(`UPDATE channel_connections SET status='disconnected', updated_at=NOW() WHERE id=$1`, [connectionId]).catch(() => {}),
      this.db.query(`DELETE FROM wa_session_creds WHERE connection_id=$1`, [connectionId]).catch(() => {}),
      this.db.query(`DELETE FROM wa_session_keys  WHERE connection_id=$1`, [connectionId]).catch(() => {}),
    ]);
  }

  /** Resolve a LID (digits-only) to a real phone number for a given connection */
  resolveLid(connectionId: string, lidDigits: string): string | null {
    return this.lidToPhone.get(connectionId)?.get(lidDigits) ?? null;
  }

  /** Send an outbound text message through an active WhatsApp Web session */
  async sendMessage(connectionId: string, remoteJid: string, text: string): Promise<string | false> {
    const session = this.sessions.get(connectionId);
    if (!session?.sock || session.status !== 'connected') {
      this.logger.warn(`sendMessage: no active session for ${connectionId}`);
      return false;
    }
    try {
      const result = await session.sock.sendMessage(remoteJid, { text });
      return result?.key?.id ?? true as any;
    } catch (e: any) {
      this.logger.error(`sendMessage failed for ${connectionId}: ${e.message}`);
      return false;
    }
  }

  /** Send a media file through an active WhatsApp Web session */
  async sendFile(connectionId: string, remoteJid: string, fileUrl: string, contentType: string): Promise<string | false> {
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

      let result: any;
      if (contentType === 'image') {
        result = await session.sock.sendMessage(remoteJid, { image: buffer, mimetype, caption: '' });
      } else if (contentType === 'audio') {
        result = await session.sock.sendMessage(remoteJid, { audio: buffer, mimetype, ptt: ext === 'ogg' });
      } else if (contentType === 'video') {
        result = await session.sock.sendMessage(remoteJid, { video: buffer, mimetype });
      } else {
        result = await session.sock.sendMessage(remoteJid, { document: buffer, mimetype, fileName: filename });
      }
      return result?.key?.id ?? true as any;
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
    // Dedup guard: if a session start is already in progress for this connection,
    // return the current status instead of creating a second Baileys socket.
    if (this.sessionStarting.has(connectionId)) {
      const s = this.sessions.get(connectionId);
      return { qr: s?.qr ?? null, status: s?.status ?? 'starting' };
    }
    this.sessionStarting.add(connectionId);
    const socketId = `sock-${String(++this.socketSeq).padStart(4, '0')}`;
    this.logger.log(`[${socketId}] Starting Baileys session conn=${connectionId}`);
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

      if (!this.cachedWaVersion) {
        try {
          const { version: v } = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]);
          this.cachedWaVersion = v;
        } catch {
          this.cachedWaVersion = [2, 3000, 1023141924]; // known-good fallback
          this.logger.warn('fetchLatestBaileysVersion timed out — using fallback WA version');
        }
      }
      const version = this.cachedWaVersion;

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
        // Load persisted creds from DB (survives container restarts)
        const [savedCreds] = await this.db.query(
          `SELECT creds FROM wa_session_creds WHERE connection_id = $1`,
          [connectionId],
        ).catch(() => [null]);
        const creds = savedCreds?.creds ?? initAuthCreds();

        authState = {
          creds,
          keys: makeCacheableSignalKeyStore({
            get: async (type: string, ids: string[]) => {
              const rows = await this.db.query(
                `SELECT key_id, key_data FROM wa_session_keys WHERE connection_id=$1 AND key_type=$2 AND key_id = ANY($3)`,
                [connectionId, type, ids],
              ).catch(() => []);
              const r: Record<string, any> = {};
              for (const row of rows) r[row.key_id] = row.key_data;
              return r;
            },
            set: async (data: Record<string, Record<string, any>>) => {
              for (const [type, entries] of Object.entries(data ?? {})) {
                for (const [id, value] of Object.entries(entries ?? {})) {
                  if (value != null) {
                    await this.db.query(
                      `INSERT INTO wa_session_keys (connection_id, key_type, key_id, key_data, updated_at)
                       VALUES ($1,$2,$3,$4,NOW())
                       ON CONFLICT (connection_id, key_type, key_id) DO UPDATE SET key_data=$4, updated_at=NOW()`,
                      [connectionId, type, id, value],
                    ).catch(() => {});
                  } else {
                    await this.db.query(
                      `DELETE FROM wa_session_keys WHERE connection_id=$1 AND key_type=$2 AND key_id=$3`,
                      [connectionId, type, id],
                    ).catch(() => {});
                  }
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
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        retryRequestDelayMs: 500,
        getMessage: async () => undefined,
      });

      this.sessions.set(connectionId, { status: 'starting', qr: null, sock });
      try { sock.ws?.on?.('error', () => {}); } catch {}

      // ── Connection lifecycle ──────────────────────────────────────────────

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, qr, lastDisconnect } = update;
        const code: number = (lastDisconnect?.error as any)?.output?.statusCode;

        // QR was scanned — phone is loading WhatsApp. Mark as connecting so the
        // frontend timer resets and doesn't show "timed out" during phone loading.
        if (connection === 'connecting') {
          const s = this.sessions.get(connectionId);
          if (s && (s.status === 'waiting_qr' || s.status === 'starting')) {
            this.logger.log(`[${socketId}] QR scanned — phone connecting conn=${connectionId}`);
            this.sessions.set(connectionId, { ...s, status: 'connecting', qr: null });
          }
        }

        if (qr) {
          try {
            const dataUrl = await qrcode.toDataURL(qr, { width: 256, margin: 1 });
            this.sessions.set(connectionId, { status: 'waiting_qr', qr: dataUrl, sock });
          } catch {}
        }

        if (connection === 'open') {
          this.sessions.set(connectionId, { status: 'connected', qr: null, sock });
          this.reconnectCount.set(connectionId, 0); // reset on successful connect
          this.logger.log(`[${socketId}] WhatsApp Web connected: conn=${connectionId}`);
          await this.db.query(
            `UPDATE channel_connections SET status='connected', last_tested_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [connectionId],
          ).catch(() => {});
        }

        if (connection === 'close') {
          const reason = code === 401 ? 'loggedOut' : code === 403 ? 'forbidden' : code === 408 ? 'timeout/throttled' : code === 440 ? 'replacedByOtherDevice' : code === 500 ? 'streamError/badMAC' : `code=${code}`;
          this.logger.warn(`[${socketId}] WhatsApp close conn=${connectionId} reason=${reason}`);
          // intentional disconnect — already cleaned up in disconnectSession, nothing to do
          if (this.intentionalDisconnects.has(connectionId)) {
            this.intentionalDisconnects.delete(connectionId);
            return;
          }
          // If the QR was never scanned (qr still in session), don't auto-reconnect —
          // just reset to disconnected so the user can click "Scan QR" again cleanly.
          // Auto-reconnecting from an unscanned QR state burns the retry budget for no benefit.
          const currentSession = this.sessions.get(connectionId);
          if (currentSession?.qr !== null) {
            this.logger.log(`[${socketId}] QR expired unscanned — resetting to disconnected conn=${connectionId}`);
            this.sessions.delete(connectionId);
            this.reconnectCount.delete(connectionId);
            try { sock.end(undefined); } catch {}
            await this.db.query(
              `UPDATE channel_connections SET status='disconnected', updated_at=NOW() WHERE id=$1`,
              [connectionId],
            ).catch(() => {});
            return;
          }
          // codes that mean the session is permanently gone — need re-scan
          // 408 = connection timeout (stale/rejected creds) — treat as permanent after burst
          const permanent = code === 401 || code === 403 || code === 440;
          // code 500 = stream error (Bad MAC / key desync) — recoverable without re-scan
          // clear signal keys so WhatsApp re-negotiates them, keep creds (no QR needed)
          const badMac = code === 500;
          if (badMac) {
            const retries = (this.reconnectCount.get(connectionId) ?? 0) + 1;
            this.reconnectCount.set(connectionId, retries);
            const MAX_BAD_MAC = 5;
            if (retries > MAX_BAD_MAC) {
              this.logger.warn(`Bad MAC retries exhausted (${MAX_BAD_MAC}) conn=${connectionId} — requiring re-scan`);
              this.sessions.delete(connectionId);
              this.reconnectCount.delete(connectionId);
              try { sock.end(undefined); } catch {}
              await Promise.all([
                this.db.query(`UPDATE channel_connections SET status='disconnected', updated_at=NOW() WHERE id=$1`, [connectionId]).catch(() => {}),
                this.db.query(`DELETE FROM wa_session_creds WHERE connection_id=$1`, [connectionId]).catch(() => {}),
                this.db.query(`DELETE FROM wa_session_keys  WHERE connection_id=$1`, [connectionId]).catch(() => {}),
              ]);
              return;
            }
            this.logger.warn(`Bad MAC / stream error (code=500, attempt ${retries}/${MAX_BAD_MAC}) — clearing signal keys and reconnecting conn=${connectionId}`);
            // clear only signal keys (creds stay valid — no QR needed)
            await this.db.query(`DELETE FROM wa_session_keys WHERE connection_id=$1`, [connectionId]).catch(() => {});
            this.sessions.set(connectionId, { status: 'connecting', qr: null });
            try { sock.end(undefined); } catch {}
            setTimeout(() => {
              this.startBaileysSession(connectionId, tenantId).catch(() => {
                this.sessions.delete(connectionId);
              });
            }, 3000 * retries);
            return;
          }
          if (!permanent) {
            // transient disconnect — retry with backoff, pause after burst
            const retries = (this.reconnectCount.get(connectionId) ?? 0) + 1;
            this.reconnectCount.set(connectionId, retries);
            // 408 = WA throttle: limit retries aggressively to reduce re-sync notifications on phone
            const MAX_BURST = code === 408 ? 2 : 5;
            if (retries > MAX_BURST) {
              // Burst exhausted — pause and retry later WITHOUT deleting creds.
              // 408 = WA server throttling (too many reconnects from same IP).
              // Deleting creds here forces a full QR re-scan which is never needed
              // for throttle errors — just wait and WA will accept the session again.
              const pause = code === 408 ? 15 * 60 * 1000 : 10 * 60 * 1000;
              const pauseLabel = code === 408 ? '15 min' : '10 min';
              this.logger.warn(`Burst retries (${MAX_BURST}) exhausted for conn=${connectionId} (code=${code}) — pausing ${pauseLabel}, creds preserved`);
              // Keep 'pausing' in the map so getQr() won't start a duplicate session during wait
              this.sessions.set(connectionId, { status: 'pausing', qr: null });
              this.reconnectCount.delete(connectionId);
              try { sock.end(undefined); } catch {}
              await this.db.query(`UPDATE channel_connections SET status='disconnected', updated_at=NOW() WHERE id=$1`, [connectionId]).catch(() => {});
              setTimeout(() => {
                this.sessions.delete(connectionId); // clear pausing before fresh start
                this.startBaileysSession(connectionId, tenantId).catch(() => {
                  this.sessions.delete(connectionId);
                });
              }, pause);
              return;
            }
            // auto-reconnect: 408 uses slow backoff (30s/60s/90s) to avoid WA throttle;
            // other transient codes use fast exponential (5s, 10s, 20s, 40s, 60s)
            this.logger.log(`Auto-reconnecting (${retries}/${MAX_BURST}, code=${code}) conn=${connectionId}`);
            this.sessions.set(connectionId, { status: 'connecting', qr: null });
            try { sock.end(undefined); } catch {}
            const backoff = code === DisconnectReason.restartRequired
              ? 1000
              : code === 408
                ? Math.min(30000 * retries, 120000)
                : Math.min(5000 * Math.pow(2, retries - 1), 60000);
            setTimeout(() => {
              this.startBaileysSession(connectionId, tenantId, authState).catch(() => {
                this.sessions.delete(connectionId);
              });
            }, backoff);
            return;
          }
          // permanent disconnect — mark disconnected, clear saved keys, require QR re-scan
          this.logger.warn(`Permanent disconnect (code=${code}) conn=${connectionId} — requires re-scan`);
          this.sessions.delete(connectionId);
          await Promise.all([
            this.db.query(`UPDATE channel_connections SET status='disconnected', updated_at=NOW() WHERE id=$1`, [connectionId]).catch(() => {}),
            this.db.query(`DELETE FROM wa_session_creds WHERE connection_id=$1`, [connectionId]).catch(() => {}),
            this.db.query(`DELETE FROM wa_session_keys  WHERE connection_id=$1`, [connectionId]).catch(() => {}),
          ]);
        }
      });

      sock.ev.on('creds.update', async (u: any) => {
        try {
          Object.assign(authState.creds, u);
          await this.db.query(
            `INSERT INTO wa_session_creds (connection_id, creds, updated_at) VALUES ($1,$2,NOW())
             ON CONFLICT (connection_id) DO UPDATE SET creds=$2, updated_at=NOW()`,
            [connectionId, authState.creds],
          ).catch(() => {});
        } catch {}
      });

      // ── Contact map: LID → real phone ─────────────────────────────────────
      // Baileys fires contacts.upsert with both LID and phone JIDs.
      // We build a map so that when a @lid message arrives we can resolve
      // the sender's actual phone number.
      if (!this.lidToPhone.has(connectionId)) {
        this.lidToPhone.set(connectionId, new Map());
      }
      const lidMap = this.lidToPhone.get(connectionId)!;

      const saveLidMapping = (lid: string, phone: string) => {
        if (!lid || !phone) return;
        lidMap.set(lid, phone);
        // Persist to DB so it survives API restarts
        this.db.query(
          `INSERT INTO wa_lid_map (connection_id, lid_digits, phone, updated_at)
           VALUES ($1,$2,$3,NOW())
           ON CONFLICT (connection_id, lid_digits) DO UPDATE SET phone=$3, updated_at=NOW()`,
          [connectionId, lid, phone],
        ).catch(() => {});
        // Backfill any contacts already stored with this LID
        this.db.query(
          `UPDATE contacts SET phone=$1, updated_at=NOW()
           WHERE tenant_id=$2 AND (phone='lid:'||$3 OR phone=$3)`,
          [phone, tenantId, lid],
        ).catch(() => {});
      };

      const processContacts = (contacts: any[]) => {
        // Log first few contacts to understand the data format
        if (contacts?.length) {
          const sample = contacts.slice(0, 3).map((c: any) => JSON.stringify(c));
          this.logger.log(`[contacts] sample (${contacts.length} total): ${sample.join(' | ')}`);
        }
        for (const c of contacts ?? []) {
          try {
            // Pattern A: id is phone JID, lid field is the LID
            // { id: '447XXXXXXX@s.whatsapp.net', lid: '150414133579835@lid' }
            if (c.id?.endsWith('@s.whatsapp.net') && c.lid) {
              const phone = c.id.replace('@s.whatsapp.net', '');
              const lid   = String(c.lid).replace(/@lid$/, '');
              saveLidMapping(lid, phone);
            }
            // Pattern B: id is LID, jid field is the real phone JID
            // { id: '150414133579835@lid', jid: '447XXXXXXX@s.whatsapp.net' }
            if (c.id?.endsWith('@lid') && c.jid) {
              const lid   = c.id.replace(/@lid$/, '');
              const phone = String(c.jid).replace('@s.whatsapp.net', '');
              saveLidMapping(lid, phone);
            }
            // Pattern C: id is LID, phone field explicitly set (older Baileys format)
            if (c.id?.endsWith('@lid') && c.phone) {
              const lid   = c.id.replace(/@lid$/, '');
              const phone = String(c.phone).replace(/\D/g, '');
              saveLidMapping(lid, phone);
            }
          } catch {}
        }
      };

      sock.ev.on('contacts.set', ({ contacts: cs, isLatest }: any) => {
        this.logger.log(`[contacts.set] ${cs?.length ?? 0} contacts, isLatest=${isLatest}`);
        processContacts(cs);
      });
      sock.ev.on('contacts.upsert', (cs: any[]) => {
        this.logger.log(`[contacts.upsert] ${cs?.length ?? 0} contacts`);
        processContacts(cs);
      });
      sock.ev.on('contacts.update', processContacts);
      // messaging-history.set fires on initial sync with full contact list including LID↔phone mappings
      sock.ev.on('messaging-history.set', (hist: any) => {
        const histContacts: any[] = hist?.contacts ?? [];
        this.logger.log(`[messaging-history.set] ${histContacts.length} contacts`);
        if (histContacts.length > 0) {
          this.logger.log(`[messaging-history.set] sample: ${JSON.stringify(histContacts[0])}`);
        }
        processContacts(histContacts);
      });

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

      // Message delivery / read receipt updates
      sock.ev.on('messages.update', async (updates: any[]) => {
        for (const update of updates) {
          const waId = update.key?.id;
          const statusNum: number | undefined = update.update?.status;
          if (!waId || statusNum == null) continue;
          // Baileys status: 1=server_ack(sent), 2=delivery_ack(delivered), 3=read, 4=played
          const statusMap: Record<number, string> = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' };
          const newStatus = statusMap[statusNum];
          if (!newStatus) continue;
          try {
            const [msg] = await this.db.query(
              `UPDATE messages SET status=$1, updated_at=NOW()
               WHERE external_id=$2 AND direction='outbound'
               RETURNING id, conversation_id, tenant_id`,
              [newStatus, waId],
            );
            if (msg) {
              this.notifications.emit({
                tenantId: msg.tenant_id,
                type: 'message_status_updated',
                payload: { conversationId: msg.conversation_id, messageId: msg.id, status: newStatus },
              });
            }
          } catch (e: any) {
            this.logger.warn(`messages.update DB error: ${e.message}`);
          }
        }
      });

      return { qr: null, status: 'starting' };
    } catch (e: any) {
      this.sessions.delete(connectionId);
      this.logger.error(`Baileys session failed: ${e.message}`);
      return { qr: null, status: 'error' };
    } finally {
      this.sessionStarting.delete(connectionId);
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
    if (isJidBroadcast(remoteJid))       return;
    if (isJidStatusBroadcast(remoteJid)) return;
    if (remoteJid.endsWith('@newsletter')) return;

    const isGroup = isJidGroup(remoteJid);

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

    const msgId = msg.key?.id ?? `${Date.now()}`;

    // ── Route to group or DM handler ─────────────────────────────────────────
    if (isGroup) {
      await this.handleGroupMessage(
        connectionId, tenantId, msg, remoteJid, body, dbContentType, msgId,
        helpers, lidMap, sock,
      );
      return;
    }

    // Normalise the JID and resolve real phone number
    const normalizedJid = jidNormalizedUser(remoteJid);
    const isLid = normalizedJid.endsWith('@lid');
    const rawDigits = normalizedJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');

    let cleanPhone: string;
    let resolvedJid = normalizedJid; // JID used for routing replies

    if (isLid) {
      // 1st: check in-memory map (populated by contacts.upsert)
      let realPhone = lidMap?.get(rawDigits);

      // 2nd: if not in memory, check persistent DB map (survives restarts)
      if (!realPhone) {
        const [dbRow] = await this.db.query(
          `SELECT phone FROM wa_lid_map WHERE connection_id=$1 AND lid_digits=$2 LIMIT 1`,
          [connectionId, rawDigits],
        ).catch(() => [null]);
        if (dbRow?.phone) {
          realPhone = dbRow.phone;
          lidMap?.set(rawDigits, realPhone); // warm up memory map
        }
      }

      if (realPhone) {
        cleanPhone  = realPhone;
        resolvedJid = `${realPhone}@s.whatsapp.net`;
      } else {
        cleanPhone = `lid:${rawDigits}`;
      }
    } else {
      cleanPhone  = rawDigits;
      resolvedJid = normalizedJid;
    }
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

  // ── Group message handler ───────────────────────────────────────────────────

  private async handleGroupMessage(
    connectionId: string,
    tenantId: string,
    msg: any,
    groupJid: string,
    body: string,
    dbContentType: string,
    msgId: string,
    helpers: any,
    lidMap?: Map<string, string>,
    sock?: any,
  ) {
    const { jidNormalizedUser } = helpers;

    // Resolve sender (the participant inside the group)
    const senderRaw: string = msg.key?.participant ?? '';
    const senderNorm = senderRaw ? jidNormalizedUser(senderRaw) : '';
    const senderIsLid = senderNorm.endsWith('@lid');
    const senderDigits = senderNorm
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/@lid$/, '');

    let senderPhone: string;
    if (senderIsLid) {
      let real = lidMap?.get(senderDigits);
      if (!real) {
        const [dbRow] = await this.db.query(
          `SELECT phone FROM wa_lid_map WHERE connection_id=$1 AND lid_digits=$2 LIMIT 1`,
          [connectionId, senderDigits],
        ).catch(() => [null]);
        if (dbRow?.phone) { real = dbRow.phone; lidMap?.set(senderDigits, real); }
      }
      senderPhone = real ?? `lid:${senderDigits}`;
    } else {
      senderPhone = senderDigits || 'unknown';
    }
    const senderName = msg.pushName ?? senderPhone;

    // Fetch group name (best-effort — may fail if not cached)
    let groupName = groupJid;
    if (sock) {
      try {
        const meta = await sock.groupMetadata(groupJid);
        if (meta?.subject) groupName = meta.subject;
      } catch {}
    }

    const [conn] = await this.db.query(
      `SELECT inbox_id, tenant_id FROM channel_connections WHERE id=$1 LIMIT 1`,
      [connectionId],
    );
    if (!conn) return;
    const inboxId = conn.inbox_id ?? null;
    const tId = tenantId || conn.tenant_id;

    // Find or create a "group contact" keyed by the group JID as phone
    const [groupContact] = await this.db.query(
      `SELECT id FROM contacts WHERE tenant_id=$1 AND phone=$2 LIMIT 1`,
      [tId, groupJid],
    );
    let groupContactId: string;
    if (groupContact) {
      groupContactId = groupContact.id;
      // Update group name if we have a better one now
      if (groupName !== groupJid) {
        await this.db.query(
          `UPDATE contacts SET full_name=$1, updated_at=NOW() WHERE id=$2 AND (full_name IS NULL OR full_name=$3)`,
          [groupName, groupContactId, groupJid],
        ).catch(() => {});
      }
    } else {
      const [newContact] = await this.db.query(
        `INSERT INTO contacts (tenant_id, full_name, phone, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id`,
        [tId, groupName, groupJid],
      );
      groupContactId = newContact.id;
    }

    // Find or create the group conversation — one permanent conv per group JID.
    // If the existing conversation was resolved, reopen it so the full history
    // stays in a single thread rather than spawning a new conversation.
    const [existingConv] = await this.db.query(
      `SELECT id, status FROM conversations
       WHERE tenant_id=$1 AND external_id=$2 AND connection_id=$3
       ORDER BY created_at DESC LIMIT 1`,
      [tId, groupJid, connectionId],
    );
    let conversationId: string;
    let isNew = false;
    if (existingConv) {
      conversationId = existingConv.id;
      await this.db.query(
        `UPDATE conversations
         SET status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
             subject = CASE WHEN subject IS NULL OR subject = $1 THEN $1 ELSE subject END,
             updated_at = NOW()
         WHERE id = $2`,
        [groupName, conversationId],
      ).catch(() => {});
    } else {
      const [newConv] = await this.db.query(
        `INSERT INTO conversations
           (tenant_id, contact_id, inbox_id, connection_id, external_id,
            channel_type, status, subject, is_group, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'whatsapp_web','open',$6,true,NOW(),NOW()) RETURNING id`,
        [tId, groupContactId, inboxId, connectionId, groupJid, groupName],
      );
      conversationId = newConv.id;
      isNew = true;
    }

    // Dedup check
    const [dup] = await this.db.query(
      `SELECT id FROM messages WHERE external_id=$1 AND conversation_id=$2 LIMIT 1`,
      [msgId, conversationId],
    );
    if (dup) return;

    // Prefix body with sender name so agents/bots see who in the group is talking
    const prefixedBody = `[${senderName}]: ${body}`;
    const msgTs = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    await this.db.query(
      `INSERT INTO messages
         (tenant_id, conversation_id, body, content_type, direction, sender_type,
          is_private, external_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'inbound','contact',false,$5,$6,$6)`,
      [tId, conversationId, prefixedBody, dbContentType, msgId, msgTs],
    );

    await this.db.query(
      `UPDATE conversations SET last_message_at=$1, updated_at=NOW() WHERE id=$2`,
      [msgTs, conversationId],
    );

    this.logger.log(`[whatsapp_web][group] ${senderName} in ${groupName} → conv ${conversationId}`);

    const newMessage = {
      id: msgId, conversationId, body: prefixedBody,
      direction: 'inbound', senderType: 'contact',
      contentType: dbContentType, isPrivate: false, createdAt: msgTs,
    };

    // Real-time SSE push to inbox
    this.notifications.emit({
      tenantId: tId,
      type: 'message_created',
      payload: { conversationId, message: newMessage },
    });

    // Events for bot/automation triggers — bot reply goes to conversation.external_id = groupJid
    const convPayload = {
      tenantId: tId, conversationId,
      conversation: {
        id: conversationId, contact_id: groupContactId,
        inbox_id: inboxId, channel: 'whatsapp_web', is_group: true,
      },
    };
    if (isNew) this.events.emit('conversation.created', convPayload);
    this.events.emit('conversation.message_received', {
      ...convPayload,
      message: { body: prefixedBody, direction: 'inbound', is_private: false, content_type: dbContentType },
    });
  }
}
