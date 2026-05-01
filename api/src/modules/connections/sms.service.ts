import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as https from 'https';
import * as http from 'http';

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpRequest(
  url: string,
  method: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Incoming SMS handler ──────────────────────────────────────────────────────

export interface InboundSms {
  from: string;   // E.164 phone number of sender
  to: string;     // E.164 phone number of our number
  body: string;
  provider: 'twilio' | 'vonage' | 'telnyx';
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Send ────────────────────────────────────────────────────────────────────

  async send(connectionId: string, tenantId: string, to: string, body: string): Promise<void> {
    const [conn] = await this.db.query(
      `SELECT * FROM channel_connections WHERE id=$1 AND tenant_id=$2 AND channel_type='sms'`,
      [connectionId, tenantId],
    );
    if (!conn) throw new Error('SMS connection not found');
    const creds = conn.credentials ?? {};
    const provider: string = creds.smsProvider ?? 'twilio';

    switch (provider) {
      case 'twilio':    return this.sendTwilio(creds, to, body);
      case 'vonage':    return this.sendVonage(creds, to, body);
      case 'telnyx':    return this.sendTelnyx(creds, to, body);
      default: throw new Error(`Unknown SMS provider: ${provider}`);
    }
  }

  private async sendTwilio(creds: Record<string, any>, to: string, body: string) {
    const { accountSid, authToken, fromNumber } = creds;
    if (!accountSid || !authToken || !fromNumber) throw new Error('Twilio SMS: faltan accountSid, authToken o fromNumber');
    const params = new URLSearchParams({ To: to, From: fromNumber, Body: body });
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await httpRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      'POST',
      params.toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
    );
    if (res.status >= 400) throw new Error(`Twilio SMS error ${res.status}: ${res.body.slice(0, 200)}`);
  }

  private async sendVonage(creds: Record<string, any>, to: string, body: string) {
    const { apiKey, apiSecret, fromNumber } = creds;
    if (!apiKey || !apiSecret || !fromNumber) throw new Error('Vonage SMS: faltan apiKey, apiSecret o fromNumber');
    const payload = JSON.stringify({ api_key: apiKey, api_secret: apiSecret, to: to.replace('+', ''), from: fromNumber, text: body });
    const res = await httpRequest(
      'https://rest.nexmo.com/sms/json',
      'POST',
      payload,
      { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload).toString() },
    );
    const json = JSON.parse(res.body);
    const msg = json.messages?.[0];
    if (msg?.status !== '0') throw new Error(`Vonage SMS error: ${msg?.['error-text'] ?? res.body.slice(0, 200)}`);
  }

  private async sendTelnyx(creds: Record<string, any>, to: string, body: string) {
    const { apiKey, fromNumber, messagingProfileId } = creds;
    if (!apiKey || !fromNumber) throw new Error('Telnyx SMS: faltan apiKey o fromNumber');
    const payload = JSON.stringify({
      from: fromNumber,
      to,
      text: body,
      ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
    });
    const res = await httpRequest(
      'https://api.telnyx.com/v2/messages',
      'POST',
      payload,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload).toString(),
      },
    );
    if (res.status >= 400) throw new Error(`Telnyx SMS error ${res.status}: ${res.body.slice(0, 200)}`);
  }

  // ── Receive (inbound webhook) ────────────────────────────────────────────────

  async handleInbound(sms: InboundSms): Promise<void> {
    // Find the connection by the destination phone number
    const [conn] = await this.db.query(
      `SELECT cc.*, i.id AS inbox_id_resolved
       FROM channel_connections cc
       LEFT JOIN inboxes i ON i.id = cc.inbox_id
       WHERE cc.channel_type = 'sms'
         AND (cc.credentials->>'fromNumber' = $1 OR cc.credentials->>'phoneNumber' = $1)
         AND cc.is_active = true
       LIMIT 1`,
      [sms.to],
    );

    if (!conn) {
      this.logger.warn(`[SMS] No active connection found for number ${sms.to}`);
      return;
    }

    const tenantId: string = conn.tenant_id;
    const inboxId: string = conn.inbox_id;

    if (!inboxId) {
      this.logger.warn(`[SMS] Connection ${conn.id} has no inbox`);
      return;
    }

    // Find or create contact by phone
    let contact = await this.db.query(
      `SELECT id, full_name FROM contacts WHERE tenant_id=$1 AND phone=$2 LIMIT 1`,
      [tenantId, sms.from],
    ).then((r: any[]) => r[0] ?? null);

    if (!contact) {
      const [c] = await this.db.query(
        `INSERT INTO contacts (tenant_id, phone, full_name, created_at, updated_at)
         VALUES ($1, $2, $2, NOW(), NOW()) RETURNING id, full_name`,
        [tenantId, sms.from],
      );
      contact = c;
      this.logger.log(`[SMS] Created contact ${contact.id} for ${sms.from}`);
    }

    // Find or create open conversation
    let convo = await this.db.query(
      `SELECT id FROM conversations
       WHERE tenant_id=$1 AND inbox_id=$2 AND contact_id=$3 AND status='open'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, inboxId, contact.id],
    ).then((r: any[]) => r[0] ?? null);

    if (!convo) {
      const [c] = await this.db.query(
        `INSERT INTO conversations
           (tenant_id, inbox_id, contact_id, channel_type, status, subject, created_at, updated_at)
         VALUES ($1, $2, $3, 'sms', 'open', $4, NOW(), NOW()) RETURNING id`,
        [tenantId, inboxId, contact.id, `SMS de ${sms.from}`],
      );
      convo = c;
      this.logger.log(`[SMS] Created conversation ${convo.id}`);
    }

    // Save message
    await this.db.query(
      `INSERT INTO messages
         (conversation_id, body, sender_type, direction, content_type, is_private, created_at, updated_at)
       VALUES ($1, $2, 'contact', 'inbound', 'text', false, NOW(), NOW())`,
      [convo.id, sms.body],
    );

    // Update conversation timestamp
    await this.db.query(
      `UPDATE conversations SET updated_at=NOW(), last_message_at=NOW() WHERE id=$1`,
      [convo.id],
    );

    this.logger.log(`[SMS] Stored inbound message from ${sms.from} → conv ${convo.id}`);
  }

  // ── Test connection ──────────────────────────────────────────────────────────

  async testCredentials(creds: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
    const provider = creds.smsProvider ?? 'twilio';
    try {
      switch (provider) {
        case 'twilio': {
          const { accountSid, authToken } = creds;
          if (!accountSid || !authToken) return { ok: false, error: 'Faltan accountSid y authToken' };
          const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
          const res = await httpRequest(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
            'GET',
            '',
            { Authorization: `Basic ${auth}` },
          );
          if (res.status === 200) return { ok: true };
          return { ok: false, error: `Twilio ${res.status}: ${JSON.parse(res.body)?.message ?? 'credenciales inválidas'}` };
        }
        case 'vonage': {
          const { apiKey, apiSecret } = creds;
          if (!apiKey || !apiSecret) return { ok: false, error: 'Faltan apiKey y apiSecret de Vonage' };
          const res = await httpRequest(
            `https://rest.nexmo.com/account/get-balance?api_key=${apiKey}&api_secret=${apiSecret}`,
            'GET',
            '',
            {},
          );
          const json = JSON.parse(res.body);
          if (json.value !== undefined) return { ok: true };
          return { ok: false, error: `Vonage: ${json['error-text'] ?? 'credenciales inválidas'}` };
        }
        case 'telnyx': {
          const { apiKey } = creds;
          if (!apiKey) return { ok: false, error: 'Falta apiKey de Telnyx' };
          const res = await httpRequest(
            'https://api.telnyx.com/v2/messaging_profiles',
            'GET',
            '',
            { Authorization: `Bearer ${apiKey}` },
          );
          if (res.status === 200) return { ok: true };
          return { ok: false, error: `Telnyx ${res.status}: credenciales inválidas` };
        }
        default:
          return { ok: false, error: `Proveedor SMS desconocido: ${provider}` };
      }
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
