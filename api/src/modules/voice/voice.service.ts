import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHmac } from 'crypto';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/**
 * In-CRM softphone (Twilio Voice SDK / WebRTC): agents register their browser as a
 * Twilio Client (identity = user id) so the bot can transfer a call to a human who
 * answers inside the CRM — and later, agents make outbound calls too.
 *
 * We mint the Twilio AccessToken by hand (a signed JWT) to avoid pulling the full
 * Twilio SDK. Needs an API Key SID + Secret from the Twilio console.
 */
@Injectable()
export class VoiceService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  // Active warm-transfer sessions, keyed by conference room name.
  private warmSessions = new Map<string, { tenantId: string; agentUserId: string; customerLeg: string; targetId: string; bCallSid?: string; confSid?: string }>();

  private b64url(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
  }

  /** Build a Twilio Voice AccessToken (JWT) for an agent's browser. Returns null if not configured. */
  async generateToken(userId: string, ttlSeconds = 3600): Promise<{ token: string; identity: string } | null> {
    const { accountSid, apiKey, apiSecret, twimlAppSid } = await this.platformSettings.getVoiceSdk();
    if (!accountSid || !apiKey || !apiSecret) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' };
    const grants: any = {
      identity: userId,
      voice: {
        incoming: { allow: true },
        ...(twimlAppSid ? { outgoing: { application_sid: twimlAppSid } } : {}),
      },
    };
    const payload = {
      jti: `${apiKey}-${now}`,
      iss: apiKey,
      sub: accountSid,
      iat: now,
      nbf: now,
      exp: now + ttlSeconds,
      grants,
    };
    const data = `${this.b64url(header)}.${this.b64url(payload)}`;
    const sig = createHmac('sha256', apiSecret).update(data).digest('base64url');
    return { token: `${data}.${sig}`, identity: userId };
  }

  /** User ids of agents currently available (online) to receive a transferred call. */
  async getAvailableAgentIds(tenantId: string, excludeUserId?: string): Promise<string[]> {
    const rows = await this.db.query(
      `SELECT id FROM users WHERE tenant_id=$1 AND is_active=true AND availability='online'
         ${excludeUserId ? 'AND id <> $2' : ''}`,
      excludeUserId ? [tenantId, excludeUserId] : [tenantId],
    ).catch(() => []);
    return rows.map((r: any) => r.id);
  }

  /** The business caller ID for an agent's outbound call: the tenant's Twilio number
   *  (from a call bot) or the first platform voice number. */
  async getTenantCallerId(userId: string): Promise<string | null> {
    if (!userId) return null;
    const [u] = await this.db.query(`SELECT tenant_id FROM users WHERE id=$1`, [userId]).catch(() => []);
    if (!u) return null;
    const [b] = await this.db.query(
      `SELECT phone_number FROM call_bots WHERE tenant_id::text=$1 AND phone_number IS NOT NULL AND phone_number <> '' ORDER BY created_at ASC LIMIT 1`,
      [String(u.tenant_id)],
    ).catch(() => []);
    if (b?.phone_number) return b.phone_number;
    const nums = String(await this.platformSettings.get('voice.phone_numbers')).split(/[,\s]+/).filter(Boolean);
    return nums[0] ?? null;
  }

  /** Tenant id for a user. */
  async getTenantId(userId: string): Promise<string | null> {
    if (!userId) return null;
    const [u] = await this.db.query(`SELECT tenant_id FROM users WHERE id=$1`, [userId]).catch(() => []);
    return u ? String(u.tenant_id) : null;
  }

  /** Best-effort contact match by phone (last 9 digits), scoped to the tenant. */
  async matchContactByPhone(tenantId: string, phone: string): Promise<string | null> {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length < 7) return null;
    const [c] = await this.db.query(
      `SELECT id FROM contacts
         WHERE tenant_id::text=$1 AND phone IS NOT NULL AND phone <> ''
           AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = $2
         ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [tenantId, digits.slice(-9)],
    ).catch(() => []);
    return c?.id ?? null;
  }

  /** Record an agent's outbound softphone call; returns the log id to finalize later. */
  async logOutboundCall(p: { tenantId: string; userId: string; from: string; to: string }): Promise<string | null> {
    const contactId = await this.matchContactByPhone(p.tenantId, p.to);
    const [row] = await this.db.query(
      `INSERT INTO call_logs
         (tenant_id, user_id, direction, from_number, to_number, duration, status, outcome, contact_id, started_at, created_at)
       VALUES ($1, $2, 'outbound', $3, $4, 0, 'initiated', 'handled', $5, NOW(), NOW())
       RETURNING id`,
      [p.tenantId, p.userId, p.from, p.to, contactId],
    ).catch(() => []);
    return row?.id ?? null;
  }

  /** Finalize a call log with the dialed-leg duration + status. */
  async finishCallLog(logId: string, durationSeconds: number, dialStatus: string): Promise<void> {
    // Map Twilio DialCallStatus → our status. answered→completed, else keep the raw reason.
    const status = dialStatus === 'answered' || dialStatus === 'completed' ? 'completed' : (dialStatus || 'completed');
    await this.db.query(
      `UPDATE call_logs SET duration=$2, status=$3, ended_at=NOW() WHERE id=$1`,
      [logId, Math.max(0, Math.floor(Number(durationSeconds) || 0)), status],
    ).catch(() => {});
  }

  /** Escape a string for XML attribute/text. */
  xe(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Transfer targets for an in-call agent: other online agents + active call bots. */
  async getTransferTargets(tenantId: string, excludeUserId: string): Promise<{ agents: { id: string; name: string }[]; bots: { id: string; name: string }[] }> {
    const [agents, bots] = await Promise.all([
      this.db.query(
        `SELECT id, full_name AS name FROM users
           WHERE tenant_id=$1 AND is_active=true AND availability='online' AND id <> $2
           ORDER BY full_name ASC`,
        [tenantId, excludeUserId],
      ).catch(() => []),
      this.db.query(
        `SELECT id, name FROM call_bots WHERE tenant_id::text=$1 AND status='active' ORDER BY name ASC`,
        [tenantId],
      ).catch(() => []),
    ]);
    return {
      agents: agents.map((a: any) => ({ id: a.id, name: a.name || 'Agente' })),
      bots: bots.map((b: any) => ({ id: b.id, name: b.name || 'Bot' })),
    };
  }

  private twilioAuth(accountSid: string, authToken: string) {
    return { auth: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'), base: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}` };
  }

  /** Cold-transfer the live customer leg of an agent's call to another agent or a bot. */
  async transferAgentCall(p: { tenantId: string; userId: string; clientCallSid: string; targetType: 'agent' | 'bot'; targetId: string }): Promise<{ ok: boolean; error?: string }> {
    const { accountSid, authToken } = await this.platformSettings.getVoice();
    if (!accountSid || !authToken) return { ok: false, error: 'La voz no está configurada.' };
    if (!p.clientCallSid || !p.targetId) return { ok: false, error: 'Faltan datos de la transferencia.' };
    const { auth, base } = this.twilioAuth(accountSid, authToken);

    try {
      // The agent's browser leg: inbound → its parent is the customer; outbound → its child is the customer.
      const call = await fetch(`${base}/Calls/${p.clientCallSid}.json`, { headers: { Authorization: auth } }).then((r) => r.ok ? r.json() : null).catch(() => null);
      if (!call) return { ok: false, error: 'No se encontró la llamada activa.' };
      let customerLeg: string | undefined = call.parent_call_sid || undefined;
      if (!customerLeg) {
        const kids = await fetch(`${base}/Calls.json?ParentCallSid=${p.clientCallSid}&Status=in-progress`, { headers: { Authorization: auth } }).then((r) => r.ok ? r.json() : null).catch(() => null);
        customerLeg = kids?.calls?.[0]?.sid;
      }
      if (!customerLeg) return { ok: false, error: 'No se encontró la otra pierna de la llamada (¿ya colgó?).' };

      let twiml: string;
      if (p.targetType === 'agent') {
        const callerId = await this.getTenantCallerId(p.userId);
        twiml = `<Response><Dial answerOnBridge="true"${callerId ? ` callerId="${this.xe(callerId)}"` : ''}><Client>${this.xe(p.targetId)}</Client></Dial></Response>`;
      } else {
        const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || 'https://api.automarkiq.com';
        twiml = `<Response><Redirect method="POST">${this.xe(`${baseUrl}/call-bots/twilio/${p.targetId}/voice`)}</Redirect></Response>`;
      }

      const body = new URLSearchParams({ Twiml: twiml }).toString();
      const upd = await fetch(`${base}/Calls/${customerLeg}.json`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!upd.ok) return { ok: false, error: `Twilio rechazó la redirección (${upd.status}).` };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Error al transferir.' };
    }
  }

  // ── Warm (attended) transfer via conference ────────────────────────────────

  /** TwiML for an agent's browser joining a warm-transfer room (served by /voice/twiml). */
  warmJoinTwiml(room: string): string {
    return `<Response><Dial answerOnBridge="true"><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${this.xe(room)}</Conference></Dial></Response>`;
  }

  private async twilioForm(url: string, auth: string, params: Record<string, string>): Promise<any> {
    const body = new URLSearchParams(params).toString();
    return fetch(url, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      .then((r) => (r.ok ? r.json().catch(() => ({})) : null)).catch(() => null);
  }

  private async confSid(base: string, auth: string, room: string): Promise<string | null> {
    const r = await fetch(`${base}/Conferences.json?FriendlyName=${encodeURIComponent(room)}&Status=in-progress`, { headers: { Authorization: auth } })
      .then((x) => (x.ok ? x.json() : null)).catch(() => null);
    return r?.conferences?.[0]?.sid ?? null;
  }

  /** Step 1: park the customer in a conference (hold music) so the agent can consult privately. */
  async warmStart(p: { tenantId: string; userId: string; clientCallSid: string; targetId: string }): Promise<{ ok: boolean; room?: string; error?: string }> {
    const { accountSid, authToken } = await this.platformSettings.getVoice();
    if (!accountSid || !authToken) return { ok: false, error: 'La voz no está configurada.' };
    if (!p.clientCallSid || !p.targetId) return { ok: false, error: 'Faltan datos de la transferencia.' };
    const { auth, base } = this.twilioAuth(accountSid, authToken);
    try {
      const call = await fetch(`${base}/Calls/${p.clientCallSid}.json`, { headers: { Authorization: auth } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!call) return { ok: false, error: 'No se encontró la llamada activa.' };
      let customerLeg: string | undefined = call.parent_call_sid || undefined;
      if (!customerLeg) {
        const kids = await fetch(`${base}/Calls.json?ParentCallSid=${p.clientCallSid}&Status=in-progress`, { headers: { Authorization: auth } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        customerLeg = kids?.calls?.[0]?.sid;
      }
      if (!customerLeg) return { ok: false, error: 'No se encontró la otra pierna de la llamada (¿ya colgó?).' };

      const room = `wt-${customerLeg}`;
      const twiml = `<Response><Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="false" beep="false">${this.xe(room)}</Conference></Dial></Response>`;
      const upd = await this.twilioForm(`${base}/Calls/${customerLeg}.json`, auth, { Twiml: twiml });
      if (!upd) return { ok: false, error: 'No se pudo poner al cliente en espera.' };
      this.warmSessions.set(room, { tenantId: p.tenantId, agentUserId: p.userId, customerLeg, targetId: p.targetId });
      return { ok: true, room };
    } catch (e: any) { return { ok: false, error: e?.message || 'Error al iniciar la consulta.' }; }
  }

  /** Step 2: hold the customer and ring the target agent into the room (A ↔ B private). */
  async warmConsult(room: string): Promise<{ ok: boolean; error?: string }> {
    const s = this.warmSessions.get(room);
    if (!s) return { ok: false, error: 'Sesión de transferencia no encontrada.' };
    const { accountSid, authToken } = await this.platformSettings.getVoice();
    const { auth, base } = this.twilioAuth(accountSid, authToken);
    try {
      const confSid = await this.confSid(base, auth, room);
      if (!confSid) return { ok: false, error: 'La conferencia aún no está activa.' };
      s.confSid = confSid;
      await this.twilioForm(`${base}/Conferences/${confSid}/Participants/${s.customerLeg}.json`, auth, { Hold: 'true' });
      const callerId = await this.getTenantCallerId(s.agentUserId);
      const bTwiml = `<Response><Dial answerOnBridge="true"><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${this.xe(room)}</Conference></Dial></Response>`;
      const created = await this.twilioForm(`${base}/Calls.json`, auth, { To: `client:${s.targetId}`, From: callerId || s.targetId, Twiml: bTwiml });
      if (!created?.sid) return { ok: false, error: 'No se pudo llamar al agente destino.' };
      s.bCallSid = created.sid;
      return { ok: true };
    } catch (e: any) { return { ok: false, error: e?.message || 'Error en la consulta.' }; }
  }

  /** Complete: un-hold the customer; the initiating agent then hangs up → target + customer remain. */
  async warmComplete(room: string): Promise<{ ok: boolean; error?: string }> {
    const s = this.warmSessions.get(room);
    if (!s) return { ok: false, error: 'Sesión no encontrada.' };
    const { accountSid, authToken } = await this.platformSettings.getVoice();
    const { auth, base } = this.twilioAuth(accountSid, authToken);
    const confSid = s.confSid || await this.confSid(base, auth, room);
    if (confSid) await this.twilioForm(`${base}/Conferences/${confSid}/Participants/${s.customerLeg}.json`, auth, { Hold: 'false' });
    this.warmSessions.delete(room);
    return { ok: true };
  }

  /** Cancel: kick the target agent, un-hold the customer, and let the initiating agent's hangup end the call. */
  async warmCancel(room: string, agentCallSid?: string): Promise<{ ok: boolean; error?: string }> {
    const s = this.warmSessions.get(room);
    if (!s) return { ok: false, error: 'Sesión no encontrada.' };
    const { accountSid, authToken } = await this.platformSettings.getVoice();
    const { auth, base } = this.twilioAuth(accountSid, authToken);
    const confSid = s.confSid || await this.confSid(base, auth, room);
    if (confSid) {
      if (s.bCallSid) await fetch(`${base}/Conferences/${confSid}/Participants/${s.bCallSid}.json`, { method: 'DELETE', headers: { Authorization: auth } }).catch(() => null);
      await this.twilioForm(`${base}/Conferences/${confSid}/Participants/${s.customerLeg}.json`, auth, { Hold: 'false' });
      if (agentCallSid) await this.twilioForm(`${base}/Conferences/${confSid}/Participants/${agentCallSid}.json`, auth, { EndConferenceOnExit: 'true' });
    }
    this.warmSessions.delete(room);
    return { ok: true };
  }

  /** TwiML <Dial> that rings ALL available agents' browsers at once (first to answer wins).
   *  Returns null when nobody is available (caller falls back to voicemail/external number). */
  async dialAvailableAgentsTwiml(tenantId: string, callerId?: string): Promise<string | null> {
    const ids = await this.getAvailableAgentIds(tenantId);
    if (!ids.length) return null;
    const clients = ids.map((id) => `<Client>${id}</Client>`).join('');
    const cid = callerId ? ` callerId="${callerId}"` : '';
    return `<Dial timeout="25" answerOnBridge="true"${cid}>${clients}</Dial>`;
  }
}
