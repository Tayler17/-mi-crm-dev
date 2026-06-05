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

    // Per-tenant regulatory verification (Enfoque A). A tenant operating under the
    // master Twilio account submits a verification request per country; the owner
    // creates the bundle in Twilio and approves it with the resulting SIDs. Numbers in
    // regulated countries can only be bought once the tenant has an 'approved' row.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS tenant_regulatory_bundles (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id     UUID NOT NULL,
        country       TEXT NOT NULL,
        number_type   TEXT NOT NULL DEFAULT 'local',
        status        TEXT NOT NULL DEFAULT 'submitted',
        bundle_sid    TEXT,
        address_sid   TEXT,
        business_name TEXT,
        contact_email TEXT,
        address_text  TEXT,
        doc_urls      JSONB DEFAULT '[]'::jsonb,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, country, number_type)
      )
    `).catch((e: any) => this.logger.warn(`tenant_regulatory_bundles table init failed: ${e.message}`));
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
    // Twilio's AreaCode filter only works for US/CA. For every other country use the
    // input as a Contains pattern (matches digits inside the number). Strip any leading
    // country code the user may have typed (e.g. "+447" → "447" still matches UK mobiles).
    const filterDigits = (opts.areaCode || opts.contains || '').replace(/\D/g, '');
    if (filterDigits) {
      if (country === 'US' || country === 'CA') params.AreaCode = filterDigits;
      else params.Contains = filterDigits;
    }

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
  async purchase(tenantId: string, phoneNumber: string, country?: string, numberType = 'local') {
    if (!phoneNumber) throw new BadRequestException('phoneNumber requerido');
    const { sid, token } = await this.creds();

    const baseUrl = process.env.API_PUBLIC_URL || 'http://localhost:4000';
    const form: Record<string, string> = {
      PhoneNumber:    phoneNumber,
      VoiceUrl:       `${baseUrl}/call-bots/twilio/voice`,
      VoiceMethod:    'POST',
      StatusCallback: `${baseUrl}/call-bots/twilio/status`,
    };

    // Regulatory bundle/address resolution:
    //  1) the tenant's OWN approved bundle for this country (Enfoque A), else
    //  2) the platform-level owner bundle (only correct for the owner's own numbers).
    const cc = (country || '').toUpperCase();
    let bundleSid = '';
    let addressSid = '';
    if (cc) {
      const [tb] = await this.db.query(
        `SELECT bundle_sid, address_sid FROM tenant_regulatory_bundles
         WHERE tenant_id::text=$1 AND country=$2 AND status='approved'
         ORDER BY (number_type=$3) DESC, updated_at DESC LIMIT 1`,
        [tenantId, cc, numberType],
      ).catch(() => [null]);
      if (tb?.bundle_sid)  bundleSid  = tb.bundle_sid;
      if (tb?.address_sid) addressSid = tb.address_sid;
    }
    if (!bundleSid && !addressSid) {
      const [bundleRow] = await this.db.query(`SELECT value FROM platform_settings WHERE key='voice.bundle_sid' LIMIT 1`).catch(() => [null]);
      const [addrRow]   = await this.db.query(`SELECT value FROM platform_settings WHERE key='voice.address_sid' LIMIT 1`).catch(() => [null]);
      if (bundleRow?.value) bundleSid  = bundleRow.value;
      if (addrRow?.value)   addressSid = addrRow.value;
    }
    if (bundleSid)  form.BundleSid  = bundleSid;
    if (addressSid) form.AddressSid = addressSid;

    const path = `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`;
    const bought = await this.twilioRequest('POST', path, sid, token, form);

    const [row] = await this.db.query(
      `INSERT INTO tenant_phone_numbers
         (tenant_id, phone_number, phone_sid, country, capabilities, friendly_name, monthly_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
       ON CONFLICT (phone_sid) DO UPDATE SET
         tenant_id    = EXCLUDED.tenant_id,
         phone_number = EXCLUDED.phone_number,
         country      = EXCLUDED.country,
         capabilities = EXCLUDED.capabilities,
         friendly_name= EXCLUDED.friendly_name,
         status       = 'active'
       RETURNING *`,
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

    // Upsert by phone_sid: re-assigning the same number just reactivates/moves its row
    // (avoids the UNIQUE(phone_sid) violation that happened on a second assign).
    const [row] = await this.db.query(
      `INSERT INTO tenant_phone_numbers
         (tenant_id, phone_number, phone_sid, country, capabilities, friendly_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active')
       ON CONFLICT (phone_sid) DO UPDATE SET
         tenant_id    = EXCLUDED.tenant_id,
         phone_number = EXCLUDED.phone_number,
         capabilities = EXCLUDED.capabilities,
         friendly_name= EXCLUDED.friendly_name,
         status       = 'active'
       RETURNING *`,
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

  // ── Regulatory verification per tenant (Enfoque A) ──────────────────────────

  /** Tenant: list their own verification requests. */
  listRegulatory(tenantId: string) {
    return this.db.query(
      `SELECT id, country, number_type, status, bundle_sid, address_sid, business_name,
              contact_email, address_text, doc_urls, notes, created_at, updated_at
       FROM tenant_regulatory_bundles WHERE tenant_id::text=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  /** Tenant: submit (or re-submit) a verification request for a country. */
  async submitRegulatory(tenantId: string, dto: {
    country: string; numberType?: string; businessName?: string;
    contactEmail?: string; addressText?: string; docUrls?: string[];
  }) {
    const country = (dto.country || '').toUpperCase();
    if (!country) throw new BadRequestException('country requerido');
    const numberType = dto.numberType || 'local';
    const [row] = await this.db.query(
      `INSERT INTO tenant_regulatory_bundles
         (tenant_id, country, number_type, status, business_name, contact_email, address_text, doc_urls)
       VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7)
       ON CONFLICT (tenant_id, country, number_type) DO UPDATE SET
         status='submitted', business_name=EXCLUDED.business_name, contact_email=EXCLUDED.contact_email,
         address_text=EXCLUDED.address_text, doc_urls=EXCLUDED.doc_urls, notes=NULL, updated_at=NOW()
       RETURNING *`,
      [tenantId, country, numberType, dto.businessName ?? null, dto.contactEmail ?? null,
       dto.addressText ?? null, JSON.stringify(dto.docUrls ?? [])],
    );
    this.logger.log(`[regulatory] Tenant ${tenantId} submitted verification for ${country}/${numberType}`);
    return row;
  }

  /** Owner: list all verification requests across tenants. */
  listAllRegulatory() {
    return this.db.query(
      `SELECT b.*, t.name AS tenant_name
       FROM tenant_regulatory_bundles b
       LEFT JOIN tenants t ON t.id = b.tenant_id
       ORDER BY CASE b.status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, b.created_at DESC`,
    );
  }

  /** Owner: approve a request by attaching the Twilio Bundle + Address SIDs. */
  async approveRegulatory(id: string, bundleSid: string, addressSid: string) {
    if (!bundleSid && !addressSid) throw new BadRequestException('Indica al menos Bundle SID o Address SID');
    const [row] = await this.db.query(
      `UPDATE tenant_regulatory_bundles
       SET status='approved', bundle_sid=$2, address_sid=$3, notes=NULL, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, bundleSid || null, addressSid || null],
    );
    if (!row) throw new BadRequestException('Solicitud no encontrada');
    this.logger.log(`[regulatory] Approved ${id} (${row.country}/${row.number_type})`);
    return row;
  }

  /** Owner: reject a request with a reason. */
  async rejectRegulatory(id: string, notes: string) {
    const [row] = await this.db.query(
      `UPDATE tenant_regulatory_bundles SET status='rejected', notes=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id, notes ?? null],
    );
    if (!row) throw new BadRequestException('Solicitud no encontrada');
    return row;
  }
}
