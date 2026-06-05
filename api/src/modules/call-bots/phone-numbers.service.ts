import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import * as https from 'https';

/**
 * On-demand Twilio phone-number provisioning (Option A: master account + per-tenant tag).
 *
 * - search(): live inventory from Twilio AvailablePhoneNumbers
 * - purchase(): buys via IncomingPhoneNumbers into the master account, auto-configures
 *   the voice webhook so inbound calls hit the call-bot router, and tags the number to
 *   the tenant in tenant_phone_numbers.
 * - list()/release(): manage a tenant's purchased numbers.
 *
 * US/CA need no regulatory bundle. Countries that do (UK, EU, …) require a Bundle + Address
 * SID stored in platform_settings (voice.bundle_sid / voice.address_sid) which are passed
 * through on purchase when present.
 */
@Injectable()
export class PhoneNumbersService implements OnModuleInit {
  private readonly logger = new Logger(PhoneNumbersService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS tenant_phone_numbers (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id     UUID NOT NULL,
        phone_number  TEXT NOT NULL,
        phone_sid     TEXT NOT NULL,
        country       TEXT,
        capabilities  JSONB,
        friendly_name TEXT,
        monthly_price TEXT,
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (phone_sid)
      )
    `).catch((e: any) => this.logger.warn(`tenant_phone_numbers table init failed: ${e.message}`));
  }

  // ── Twilio REST helpers ─────────────────────────────────────────────────────
  private async creds(): Promise<{ sid: string; token: string }> {
    const { accountSid, authToken } = await this.platformSettings.getVoice();
    if (!accountSid || !authToken) {
      throw new BadRequestException('Twilio no está configurado. Añade Account SID y Auth Token en Settings → Platform.');
    }
    return { sid: accountSid, token: authToken };
  }

  private twilioRequest(method: 'GET' | 'POST', path: string, sid: string, token: string, form?: Record<string, string>): Promise<any> {
    const body = form ? new URLSearchParams(form).toString() : '';
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const headers: Record<string, string> = { Authorization: `Basic ${auth}` };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }
    return new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.twilio.com', path, method, headers, timeout: 15_000 },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            let json: any = {};
            try { json = data ? JSON.parse(data) : {}; } catch { json = { raw: data }; }
            if ((res.statusCode ?? 0) >= 400) {
              reject(new BadRequestException(json?.message || `Twilio error ${res.statusCode}`));
            } else {
              resolve(json);
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Twilio request timeout')));
      if (method === 'POST') req.write(body);
      req.end();
    });
  }

  // ── Search available numbers ────────────────────────────────────────────────
  async search(opts: { country?: string; type?: string; areaCode?: string; contains?: string }) {
    const { sid, token } = await this.creds();
    const country = (opts.country || 'US').toUpperCase();
    const type = ['local', 'mobile', 'tollFree'].includes(opts.type || '') ? opts.type! : 'local';
    const typePath = type === 'tollFree' ? 'TollFree' : type === 'mobile' ? 'Mobile' : 'Local';

    const params: Record<string, string> = { PageSize: '20', VoiceEnabled: 'true' };
    if (opts.areaCode) params.AreaCode = opts.areaCode.replace(/\D/g, '');
    if (opts.contains) params.Contains = opts.contains;

    const qs = new URLSearchParams(params).toString();
    const path = `/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/${country}/${typePath}.json?${qs}`;
    const json = await this.twilioRequest('GET', path, sid, token);
    const list: any[] = json?.available_phone_numbers ?? [];
    return list.map((n) => ({
      phoneNumber:  n.phone_number,
      friendlyName: n.friendly_name,
      locality:     n.locality ?? '',
      region:       n.region ?? '',
      country:      n.iso_country ?? country,
      capabilities: n.capabilities ?? {},
    }));
  }

  // ── Purchase a number for a tenant ──────────────────────────────────────────
  async purchase(tenantId: string, phoneNumber: string, country?: string) {
    if (!phoneNumber) throw new BadRequestException('phoneNumber requerido');
    const { sid, token } = await this.creds();

    const baseUrl = process.env.API_PUBLIC_URL || 'http://localhost:4000';
    const form: Record<string, string> = {
      PhoneNumber:    phoneNumber,
      VoiceUrl:       `${baseUrl}/call-bots/twilio/voice`,
      VoiceMethod:    'POST',
      StatusCallback: `${baseUrl}/call-bots/twilio/status`,
    };

    // Pass regulatory bundle / address when configured (required for some countries)
    const [bundleRow] = await this.db.query(`SELECT value FROM platform_settings WHERE key='voice.bundle_sid' LIMIT 1`).catch(() => [null]);
    const [addrRow]   = await this.db.query(`SELECT value FROM platform_settings WHERE key='voice.address_sid' LIMIT 1`).catch(() => [null]);
    if (bundleRow?.value) form.BundleSid  = bundleRow.value;
    if (addrRow?.value)   form.AddressSid = addrRow.value;

    const path = `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`;
    const bought = await this.twilioRequest('POST', path, sid, token, form);

    const [row] = await this.db.query(
      `INSERT INTO tenant_phone_numbers
         (tenant_id, phone_number, phone_sid, country, capabilities, friendly_name, monthly_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active') RETURNING *`,
      [
        tenantId, bought.phone_number, bought.sid, (country || '').toUpperCase() || null,
        JSON.stringify(bought.capabilities ?? {}), bought.friendly_name ?? null, null,
      ],
    );
    this.logger.log(`[phone-numbers] Tenant ${tenantId} purchased ${bought.phone_number} (${bought.sid})`);
    return row;
  }

  // ── List a tenant's numbers ─────────────────────────────────────────────────
  async list(tenantId: string) {
    return this.db.query(
      `SELECT id, phone_number, phone_sid, country, capabilities, friendly_name, status, created_at
       FROM tenant_phone_numbers WHERE tenant_id=$1 AND status<>'released' ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  // ── Owner: list ALL numbers in the master Twilio account ────────────────────
  /** Numbers owned in the master Twilio account, flagged with which tenant (if any) holds each. */
  async twilioInventory() {
    const { sid, token } = await this.creds();
    const json = await this.twilioRequest('GET', `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=100`, sid, token);
    const list: any[] = json?.incoming_phone_numbers ?? [];
    const assigned: Array<{ phone_number: string; tenant_id: string }> = await this.db.query(
      `SELECT phone_number, tenant_id::text FROM tenant_phone_numbers WHERE status='active'`,
    ).catch(() => []);
    const byNumber = new Map(assigned.map((a) => [a.phone_number, a.tenant_id]));
    return list.map((n) => ({
      phoneNumber:  n.phone_number,
      sid:          n.sid,
      friendlyName: n.friendly_name,
      assignedTenantId: byNumber.get(n.phone_number) ?? null,
    }));
  }

  // ── Owner: assign an existing Twilio number to a tenant ─────────────────────
  async assignToTenant(tenantId: string, phoneNumber: string) {
    if (!tenantId || !phoneNumber) throw new BadRequestException('tenantId y phoneNumber requeridos');
    const { sid, token } = await this.creds();

    // Find the number in the master account to get its SID + capabilities
    const json = await this.twilioRequest(
      'GET',
      `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      sid, token,
    );
    const tw = (json?.incoming_phone_numbers ?? [])[0];
    if (!tw) throw new BadRequestException(`El número ${phoneNumber} no existe en tu cuenta Twilio.`);

    // Point its voice webhook at the call-bot router (so calls route correctly)
    const baseUrl = process.env.API_PUBLIC_URL || 'http://localhost:4000';
    await this.twilioRequest('POST', `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${tw.sid}.json`, sid, token, {
      VoiceUrl:       `${baseUrl}/call-bots/twilio/voice`,
      VoiceMethod:    'POST',
      StatusCallback: `${baseUrl}/call-bots/twilio/status`,
    }).catch(() => {});

    // Remove any prior assignment of this number, then assign to the chosen tenant
    await this.db.query(`UPDATE tenant_phone_numbers SET status='released' WHERE phone_number=$1 AND status='active'`, [phoneNumber]).catch(() => {});
    const [row] = await this.db.query(
      `INSERT INTO tenant_phone_numbers
         (tenant_id, phone_number, phone_sid, country, capabilities, friendly_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING *`,
      [tenantId, tw.phone_number, tw.sid, null, JSON.stringify(tw.capabilities ?? {}), tw.friendly_name ?? null],
    );
    this.logger.log(`[phone-numbers] Owner assigned ${tw.phone_number} → tenant ${tenantId}`);
    return row;
  }

  // ── Release (delete from Twilio + mark released) ────────────────────────────
  async release(tenantId: string, id: string) {
    const [row] = await this.db.query(
      `SELECT phone_sid, phone_number FROM tenant_phone_numbers WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    if (!row) throw new BadRequestException('Número no encontrado');

    // Block release if a call bot still uses this number
    const [inUse] = await this.db.query(
      `SELECT 1 FROM call_bots WHERE tenant_id::text=$1 AND phone_number=$2 AND status<>'deleted' LIMIT 1`,
      [tenantId, row.phone_number],
    ).catch(() => [null]);
    if (inUse) throw new BadRequestException('Este número está asignado a un call bot. Quítalo del bot antes de liberarlo.');

    const { sid, token } = await this.creds();
    // Releasing a Twilio number = HTTP DELETE on the IncomingPhoneNumbers resource
    await this.twilioDelete(`/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${row.phone_sid}.json`, sid, token);

    await this.db.query(`UPDATE tenant_phone_numbers SET status='released' WHERE id=$1`, [id]);
    this.logger.log(`[phone-numbers] Tenant ${tenantId} released ${row.phone_number} (${row.phone_sid})`);
    return { ok: true };
  }

  private twilioDelete(path: string, sid: string, token: string): Promise<void> {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    return new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.twilio.com', path, method: 'DELETE', headers: { Authorization: `Basic ${auth}` }, timeout: 15_000 },
        (res) => { res.on('data', () => {}); res.on('end', () => resolve()); },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Twilio delete timeout')));
      req.end();
    });
  }
}
