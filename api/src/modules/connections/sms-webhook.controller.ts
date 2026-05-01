import { Controller, Post, Body, Headers, Param, HttpCode, RawBodyRequest, Req } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Receives inbound SMS webhooks from Twilio, Vonage and Telnyx.
 * All routes are public (no JWT) — each provider calls them directly.
 */
@Controller('sms')
export class SmsWebhookController {
  constructor(private readonly sms: SmsService) {}

  // ── Twilio ──────────────────────────────────────────────────────────────────
  // Configure in Twilio console: Messaging → Phone Numbers → Webhook = POST /sms/twilio/incoming

  @Post('twilio/incoming')
  @HttpCode(200)
  async twilioIncoming(@Body() body: Record<string, string>) {
    await this.sms.handleInbound({
      from: body['From'] ?? '',
      to:   body['To']   ?? '',
      body: body['Body'] ?? '',
      provider: 'twilio',
    });
    // Twilio expects an empty TwiML response or a <MessagingResponse>
    return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  }

  // ── Vonage / Bird ───────────────────────────────────────────────────────────
  // Configure in Vonage dashboard: SMS → Inbound webhook = GET+POST /sms/vonage/incoming

  @Post('vonage/incoming')
  @HttpCode(200)
  async vonageIncoming(@Body() body: Record<string, string>) {
    await this.sms.handleInbound({
      from: body['msisdn'] ? `+${body['msisdn']}` : (body['from'] ?? ''),
      to:   body['to']     ? `+${body['to']}`     : (body['To']  ?? ''),
      body: body['text']   ?? body['body']         ?? '',
      provider: 'vonage',
    });
    return { status: 'ok' };
  }

  // ── Telnyx ──────────────────────────────────────────────────────────────────
  // Configure in Telnyx portal: Messaging Profile → Webhooks = /sms/telnyx/incoming

  @Post('telnyx/incoming')
  @HttpCode(200)
  async telnyxIncoming(@Body() body: Record<string, any>) {
    const payload = body?.data?.payload ?? {};
    const from = payload?.from?.phone_number ?? payload?.from ?? '';
    const to   = payload?.to?.[0]?.phone_number ?? payload?.to ?? '';
    const text = payload?.text ?? '';

    if (!from || !text) return { status: 'ignored' };

    await this.sms.handleInbound({ from, to, body: text, provider: 'telnyx' });
    return { status: 'ok' };
  }
}
