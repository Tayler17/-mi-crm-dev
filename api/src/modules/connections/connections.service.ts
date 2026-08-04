import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Connection } from './connection.entity';
import * as nodemailer from 'nodemailer';
import { SmsService } from './sms.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectRepository(Connection) private readonly repo: Repository<Connection>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly smsSvc: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(tenantId: string) {
    const rows = await this.db.query(
      `SELECT cc.*, i.name AS inbox_name, i.channel_type AS inbox_channel
       FROM channel_connections cc
       LEFT JOIN inboxes i ON i.id = cc.inbox_id
       WHERE cc.tenant_id = $1
       ORDER BY cc.channel_type, cc.name`,
      [tenantId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      channelType: r.channel_type,
      status: r.status,
      credentials: this.maskCredentials(r.channel_type, r.credentials ?? {}),
      inboxId: r.inbox_id,
      inbox_name: r.inbox_name,
      errorMessage: r.error_message,
      lastTestedAt: r.last_tested_at,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** List the tenant's WhatsApp message templates from Meta (Cloud API).
   *  Reads the WABA ID + access token from the tenant's WhatsApp API connection and
   *  calls Meta's message_templates endpoint. Returns name/category/language/status. */
  async listWhatsappTemplates(tenantId: string) {
    const [conn] = await this.db.query(
      `SELECT credentials FROM channel_connections
       WHERE tenant_id=$1 AND channel_type='whatsapp'
       ORDER BY (status='connected') DESC, updated_at DESC
       LIMIT 1`,
      [tenantId],
    );
    const creds  = conn?.credentials ?? {};
    const wabaId = creds.wabaId;
    const token  = creds.accessToken;
    if (!wabaId || !token) {
      return { ok: false, error: 'No hay una conexión de WhatsApp API con WABA ID y Access Token.', templates: [] };
    }
    try {
      const res = await (globalThis as any).fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=200&access_token=${encodeURIComponent(token)}`,
      );
      const data: any = await res.json();
      if (data?.error) {
        return { ok: false, error: `Meta API: ${data.error.message}`, templates: [] };
      }
      const templates = (data?.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        category: t.category,             // MARKETING | UTILITY | AUTHENTICATION
        language: t.language,
        status: t.status,                 // APPROVED | PENDING | REJECTED | ...
        components: t.components ?? [],    // header/body/footer/buttons (with {{n}} vars)
      }));
      return { ok: true, templates };
    } catch (e: any) {
      this.logger.warn(`[wa-templates] fetch failed for tenant ${tenantId}: ${e.message}`);
      return { ok: false, error: e.message, templates: [] };
    }
  }

  /** Send a WhatsApp message template (Cloud API) to a number. Reads the phone number ID
   *  + token from the tenant's WhatsApp API connection. bodyParams fills the {{n}} body
   *  variables in order. Returns the Meta message id on success. */
  async sendWhatsappTemplate(
    tenantId: string,
    dto: { to?: string; name?: string; language?: string; bodyParams?: string[]; conversationId?: string; renderedBody?: string },
  ) {
    const [conn] = await this.db.query(
      `SELECT credentials FROM channel_connections
       WHERE tenant_id=$1 AND channel_type='whatsapp'
       ORDER BY (status='connected') DESC, updated_at DESC
       LIMIT 1`,
      [tenantId],
    );
    const creds   = conn?.credentials ?? {};
    const phoneId = creds.phoneNumberId;
    const token   = creds.accessToken;
    if (!phoneId || !token) {
      return { ok: false, error: 'No hay una conexión de WhatsApp API con Phone Number ID y Access Token.' };
    }
    const to = String(dto.to ?? '').replace(/[^\d]/g, '');
    if (!to) return { ok: false, error: 'Número de destino inválido.' };
    if (!dto.name || !dto.language) return { ok: false, error: 'Falta el nombre o el idioma de la plantilla.' };

    const components: any[] = [];
    const bodyParams = (dto.bodyParams ?? []).filter((v) => v != null && String(v).trim() !== '');
    if (bodyParams.length) {
      components.push({ type: 'body', parameters: bodyParams.map((v) => ({ type: 'text', text: String(v) })) });
    }
    const template: any = { name: dto.name, language: { code: dto.language } };
    if (components.length) template.components = components;

    try {
      const res = await (globalThis as any).fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data: any = await res.json();
      if (data?.error) return { ok: false, error: `Meta API: ${data.error.message}` };
      const messageId = data?.messages?.[0]?.id;

      // If sent from a conversation (inbox), record it as an outbound message so it shows
      // in the chat, and reopen the conversation if it was resolved (re-engagement).
      if (dto.conversationId) {
        await this.recordTemplateMessage(tenantId, dto.conversationId, dto.renderedBody || `[Plantilla: ${dto.name}]`, messageId);
      }
      return { ok: true, messageId };
    } catch (e: any) {
      this.logger.warn(`[wa-templates] send failed for tenant ${tenantId}: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  /** Persist a sent template as an outbound message in the conversation + push it to the
   *  inbox in real time. Reopens the conversation if it was resolved. Best-effort. */
  private async recordTemplateMessage(tenantId: string, conversationId: string, body: string, messageId?: string) {
    try {
      const [conv] = await this.db.query(
        `SELECT id FROM conversations WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
        [conversationId, tenantId],
      );
      if (!conv) return;
      await this.db.query(
        `INSERT INTO messages
           (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, external_id, created_at, updated_at)
         VALUES ($1,$2,$3,'text','outbound','agent',false,$4,NOW(),NOW())`,
        [tenantId, conversationId, body, messageId ?? null],
      );
      await this.db.query(
        `UPDATE conversations
           SET status = CASE WHEN status='resolved' THEN 'open' ELSE status END,
               last_message_at = NOW(), updated_at = NOW()
         WHERE id=$1`,
        [conversationId],
      );
      this.notifications.emit({
        tenantId,
        type: 'message_created',
        payload: {
          conversationId,
          message: { conversationId, body, direction: 'outbound', senderType: 'agent', contentType: 'text', isPrivate: false, createdAt: new Date().toISOString() },
        },
      });
    } catch (e: any) {
      this.logger.warn(`[wa-templates] could not record template message: ${e.message}`);
    }
  }

  /** Read the tenant's WhatsApp API credentials (WABA ID + token). */
  private async getWhatsappCreds(tenantId: string): Promise<{ wabaId?: string; token?: string }> {
    const [conn] = await this.db.query(
      `SELECT credentials FROM channel_connections
       WHERE tenant_id=$1 AND channel_type='whatsapp'
       ORDER BY (status='connected') DESC, updated_at DESC LIMIT 1`,
      [tenantId],
    );
    const creds = conn?.credentials ?? {};
    return { wabaId: creds.wabaId, token: creds.accessToken };
  }

  /** Create a WhatsApp message template in the tenant's WABA (submitted to Meta for
   *  review). If the body has {{n}} variables, Meta requires an example value per variable. */
  async createWhatsappTemplate(
    tenantId: string,
    dto: { name?: string; category?: string; language?: string; bodyText?: string; examples?: string[] },
  ) {
    const { wabaId, token } = await this.getWhatsappCreds(tenantId);
    if (!wabaId || !token) return { ok: false, error: 'No hay una conexión de WhatsApp API con WABA ID y Access Token.' };

    const name = String(dto.name ?? '').trim().toLowerCase();
    const category = String(dto.category ?? '').trim().toUpperCase();
    const language = String(dto.language ?? '').trim();
    const bodyText = String(dto.bodyText ?? '').trim();
    if (!/^[a-z0-9_]{1,512}$/.test(name)) return { ok: false, error: 'Nombre inválido: solo minúsculas, números y guion bajo (_).' };
    if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(category)) return { ok: false, error: 'Categoría inválida.' };
    if (!language) return { ok: false, error: 'Falta el idioma.' };
    if (!bodyText) return { ok: false, error: 'Falta el texto del cuerpo.' };

    // Count {{n}} variables; Meta needs an example value for each.
    let varMax = 0;
    for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) varMax = Math.max(varMax, Number(m[1]));
    const bodyComponent: any = { type: 'BODY', text: bodyText };
    if (varMax > 0) {
      const examples = (dto.examples ?? []).map((e) => String(e ?? '').trim());
      if (examples.length < varMax || examples.slice(0, varMax).some((e) => !e)) {
        return { ok: false, error: `Faltan ejemplos para las ${varMax} variable(s) del cuerpo.` };
      }
      bodyComponent.example = { body_text: [examples.slice(0, varMax)] };
    }

    try {
      const res = await (globalThis as any).fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, category, language, components: [bodyComponent] }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data: any = await res.json();
      if (data?.error) return { ok: false, error: `Meta API: ${data.error.message}` };
      return { ok: true, id: data?.id, status: data?.status };
    } catch (e: any) {
      this.logger.warn(`[wa-templates] create failed for tenant ${tenantId}: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  /** Delete a WhatsApp message template by name (removes all its languages). */
  async deleteWhatsappTemplate(tenantId: string, name: string) {
    const { wabaId, token } = await this.getWhatsappCreds(tenantId);
    if (!wabaId || !token) return { ok: false, error: 'No hay una conexión de WhatsApp API con WABA ID y Access Token.' };
    if (!name) return { ok: false, error: 'Falta el nombre de la plantilla.' };
    try {
      const res = await (globalThis as any).fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) },
      );
      const data: any = await res.json();
      if (data?.error) return { ok: false, error: `Meta API: ${data.error.message}` };
      return { ok: true };
    } catch (e: any) {
      this.logger.warn(`[wa-templates] delete failed for tenant ${tenantId}: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  async findOne(id: string, tenantId: string) {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Connection not found');
    return c;
  }

  async create(dto: any, tenantId: string) {
    // Auto-create an inbox linked to this connection if none was provided
    let inboxId = dto.inboxId || undefined;
    if (!inboxId) {
      const [newInbox] = await this.db.query(
        `INSERT INTO inboxes (tenant_id, name, channel_type, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
        [tenantId, dto.name, dto.channelType],
      );
      inboxId = newInbox.id;
      this.logger.log(`Auto-created inbox "${dto.name}" (${dto.channelType}) for tenant ${tenantId}`);
    }

    const conn = this.repo.create({
      tenantId,
      name: dto.name,
      channelType: dto.channelType,
      credentials: dto.credentials ?? {},
      inboxId,
      isActive: dto.isActive ?? true,
      status: 'disconnected',
    });
    return this.repo.save(conn);
  }

  async update(id: string, dto: any, tenantId: string) {
    const conn = await this.findOne(id, tenantId);
    if (dto.credentials) {
      const merged: Record<string, any> = { ...conn.credentials };
      for (const [k, v] of Object.entries(dto.credentials)) {
        if (v !== '••••••••') merged[k] = v;
      }
      conn.credentials = merged;
    }
    Object.assign(conn, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.inboxId !== undefined && { inboxId: dto.inboxId || null }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    conn.status = 'disconnected';
    conn.errorMessage = undefined;
    return this.repo.save(conn);
  }

  async remove(id: string, tenantId: string) {
    const conn = await this.findOne(id, tenantId);
    const inboxId = conn.inboxId;
    await this.repo.remove(conn);
    if (inboxId) {
      // Nullify FK references before deleting the inbox to avoid constraint errors
      await this.db.query(
        `UPDATE conversations SET inbox_id = NULL WHERE inbox_id = $1`,
        [inboxId],
      ).catch(() => {});
      await this.db.query(
        `DELETE FROM conversation_flows WHERE inbox_id = $1`,
        [inboxId],
      ).catch(() => {});
      await this.db.query(
        `DELETE FROM inboxes WHERE id = $1 AND tenant_id = $2`,
        [inboxId, tenantId],
      ).catch(() => {});
    }
  }

  // ── Test connection ───────────────────────────────────────────────────────────

  async testConnection(id: string, tenantId: string) {
    const conn = await this.findOne(id, tenantId);
    const result = await this.runTest(conn);
    conn.status = result.ok ? 'connected' : 'error';
    conn.errorMessage = result.ok ? undefined : result.error;
    conn.lastTestedAt = new Date();
    await this.repo.save(conn);
    return { ok: result.ok, message: result.ok ? 'Conexión exitosa' : result.error };
  }

  private async runTest(conn: Connection): Promise<{ ok: boolean; error?: string }> {
    const creds = conn.credentials ?? {};

    switch (conn.channelType) {

      // ── Telegram ──────────────────────────────────────────────────────────────
      case 'telegram': {
        if (!creds.botToken) return { ok: false, error: 'Falta botToken de Telegram' };
        try {
          const res = await (globalThis as any).fetch(
            `https://api.telegram.org/bot${creds.botToken}/getMe`,
            { signal: AbortSignal.timeout(8000) },
          );
          const data = await res.json();
          if (!data.ok) return { ok: false, error: `Telegram: ${data.description ?? 'token inválido'}` };

          // Auto-register webhook so Telegram sends messages here
          const baseUrl = process.env.API_PUBLIC_URL || process.env.FRONTEND_URL?.replace(':3000', ':4000') || 'http://localhost:4000';
          const webhookUrl = `${baseUrl}/webhooks/telegram/${conn.id}`;
          const whRes = await (globalThis as any).fetch(
            `https://api.telegram.org/bot${creds.botToken}/setWebhook`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message'] }),
              signal: AbortSignal.timeout(8000),
            },
          );
          const whData = await whRes.json();
          if (!whData.ok) {
            this.logger.warn(`Telegram setWebhook failed: ${whData.description}`);
            // Still return ok — bot token is valid even if webhook can't register (e.g. localhost not reachable by Telegram)
          } else {
            this.logger.log(`Telegram webhook registered: ${webhookUrl}`);
          }
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: `No se pudo conectar con Telegram: ${e.message}` };
        }
      }

      // ── WhatsApp Business API (Meta) ──────────────────────────────────────────
      case 'whatsapp': {
        if (!creds.phoneNumberId || !creds.accessToken) {
          return { ok: false, error: 'Faltan credenciales: phoneNumberId y accessToken son requeridos' };
        }
        try {
          const res = await (globalThis as any).fetch(
            `https://graph.facebook.com/v21.0/${creds.phoneNumberId}?access_token=${creds.accessToken}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (res.ok) return { ok: true };
          const data = await res.json();
          return { ok: false, error: `Meta API: ${data?.error?.message ?? 'token o phoneNumberId inválido'}` };
        } catch (e: any) {
          return { ok: false, error: `No se pudo conectar con Meta: ${e.message}` };
        }
      }

      // ── Facebook / Instagram ──────────────────────────────────────────────────
      case 'facebook':
      case 'instagram': {
        if (!creds.pageId || !creds.accessToken) {
          return { ok: false, error: 'Faltan credenciales: pageId y accessToken son requeridos' };
        }
        try {
          // 1. Verify the page/token is valid (basic fields only — works for both
          //    Facebook Page IDs and Instagram Business Account IDs)
          const pageRes = await (globalThis as any).fetch(
            `https://graph.facebook.com/v21.0/${creds.pageId}?fields=id,name&access_token=${creds.accessToken}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!pageRes.ok) {
            const data = await pageRes.json();
            return { ok: false, error: `Meta API: ${data?.error?.message ?? 'token inválido'}` };
          }

          // 1b. For Instagram connections, resolve and persist the Instagram Business
          //     Account ID so the webhook router can match entry.id correctly.
          //     Instagram Business Messaging sends entry.id = igAccountId (NOT pageId).
          //     Two cases:
          //     a) pageId is a Facebook Page ID → fetch instagram_business_account field
          //     b) pageId is already an Instagram Business Account ID → igAccountId = pageId
          if (conn.channelType === 'instagram') {
            let igAccountId: string | undefined;

            const igRes = await (globalThis as any).fetch(
              `https://graph.facebook.com/v21.0/${creds.pageId}?fields=instagram_business_account&access_token=${creds.accessToken}`,
              { signal: AbortSignal.timeout(8000) },
            );
            const igData = await igRes.json();

            if (igData?.instagram_business_account?.id) {
              // Case a: pageId is a Facebook Page — resolved IG account from it
              igAccountId = igData.instagram_business_account.id;
            } else if (igData?.error?.code === 100) {
              // Case b: pageId is already an Instagram Business Account ID
              igAccountId = creds.pageId;
              this.logger.log(`Instagram connection ${conn.id}: pageId=${creds.pageId} is already an IG account ID`);
            }

            if (igAccountId && igAccountId !== creds.igAccountId) {
              conn.credentials = { ...creds, igAccountId };
              await this.repo.save(conn);
              this.logger.log(`Instagram connection ${conn.id}: stored igAccountId=${igAccountId} for pageId=${creds.pageId}`);
            }
          }

          // 2. Subscribe the page to webhook events
          // Meta requires form-encoded body (not JSON) for this endpoint.
          // For Instagram Business API, the global app webhook handles message routing
          // and per-page subscribed_apps may return error #3 — that is expected and safe.
          const subscribeBody = new URLSearchParams({
            subscribed_fields: 'messages,messaging_postbacks',
            access_token: creds.accessToken,
          });
          const subscribeRes = await (globalThis as any).fetch(
            `https://graph.facebook.com/v21.0/${creds.pageId}/subscribed_apps`,
            {
              method: 'POST',
              body: subscribeBody,
              signal: AbortSignal.timeout(8000),
            },
          );
          const subscribeData = await subscribeRes.json();
          this.logger.log(`Meta subscribed_apps response for ${creds.pageId}: ${JSON.stringify(subscribeData)}`);

          if (!subscribeData.success) {
            const errCode: number = subscribeData.error?.code ?? 0;
            const errMsg = subscribeData.error?.message ?? JSON.stringify(subscribeData);

            if (conn.channelType === 'instagram' && errCode === 3) {
              // Instagram Business API uses global app-level webhook subscription.
              // Per-page subscribed_apps is not required and returns #3 for IG accounts.
              // Global webhook is already configured → messages still arrive → treat as connected.
              this.logger.warn(`Instagram ${creds.pageId}: subscribed_apps returned #3 (expected for Business API — global webhook is active)`);
              return { ok: true };
            }
            return { ok: false, error: `Suscripción de webhook fallida: ${errMsg}` };
          }
          this.logger.log(`Meta page ${creds.pageId} successfully subscribed: messages, messaging_postbacks`);

          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: `No se pudo conectar con Meta: ${e.message}` };
        }
      }

      // ── Email (SMTP) ──────────────────────────────────────────────────────────
      case 'email': {
        if (!creds.host || !creds.port || !creds.user || !creds.password) {
          return { ok: false, error: 'Faltan credenciales SMTP: host, port, user y password son requeridos' };
        }
        try {
          const transport = nodemailer.createTransport({
            host: String(creds.host).trim(),
            port: Number(creds.port),
            secure: Number(creds.port) === 465,
            auth: { user: creds.user, pass: creds.password },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 8000,
            greetingTimeout: 5000,
          });
          await transport.verify();
          transport.close();
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: `SMTP: ${e.message}` };
        }
      }

      // ── SMS (Twilio / Vonage / Telnyx) ───────────────────────────────────────
      case 'sms':
        return this.smsSvc.testCredentials(creds);

      // ── WhatsApp Web / Webchat ────────────────────────────────────────────────
      case 'whatsapp_web':
      case 'webchat':
        return { ok: true };

      default:
        return { ok: false, error: `Canal desconocido: ${conn.channelType}` };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private maskCredentials(channelType: string, creds: Record<string, any>): Record<string, any> {
    const SENSITIVE = ['accessToken', 'password', 'botToken', 'apiSecret', 'apiKey', 'appSecret', 'webhookVerifyToken', 'authToken', 'imapPassword'];
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(creds)) {
      result[k] = SENSITIVE.includes(k) && v ? '••••••••' : v;
    }
    return result;
  }
}
