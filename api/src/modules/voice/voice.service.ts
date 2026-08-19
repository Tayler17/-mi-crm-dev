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
