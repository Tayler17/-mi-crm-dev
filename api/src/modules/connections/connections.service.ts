import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Connection } from './connection.entity';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectRepository(Connection) private readonly repo: Repository<Connection>,
    @InjectDataSource() private readonly db: DataSource,
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
    await this.repo.remove(conn);
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
            `https://graph.facebook.com/v19.0/${creds.phoneNumberId}?access_token=${creds.accessToken}`,
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
          const res = await (globalThis as any).fetch(
            `https://graph.facebook.com/v19.0/${creds.pageId}?fields=id,name&access_token=${creds.accessToken}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (res.ok) return { ok: true };
          const data = await res.json();
          return { ok: false, error: `Meta API: ${data?.error?.message ?? 'token inválido'}` };
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
            host: creds.host,
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
    const SENSITIVE = ['accessToken', 'password', 'botToken', 'apiSecret', 'apiKey', 'appSecret', 'webhookVerifyToken'];
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(creds)) {
      result[k] = SENSITIVE.includes(k) && v ? '••••••••' : v;
    }
    return result;
  }
}
