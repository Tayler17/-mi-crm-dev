import { Controller, Post, Get, Param, Body, Req, Res, Header } from '@nestjs/common';
import { CallBotTwilioService } from './call-bot-twilio.service';
import * as fs from 'fs';
import * as path from 'path';

const TTS_DIR = '/app/uploads/tts';

/**
 * Public endpoints — no JWT guard — called directly by Twilio.
 *
 * Configure these URLs in your Twilio phone number settings:
 *   Voice & Fax → "A call comes in" → Webhook → POST
 *     https://your-api-domain/call-bots/twilio/{botId}/voice
 *
 *   Status Callback → POST
 *     https://your-api-domain/call-bots/twilio/{botId}/status
 */
@Controller('call-bots/twilio')
export class CallBotWebhooksController {
  constructor(private readonly twilioSvc: CallBotTwilioService) {}

  private getBaseUrl(req: any): string {
    if (process.env.TWILIO_WEBHOOK_BASE_URL) return process.env.TWILIO_WEBHOOK_BASE_URL;
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host  = req.headers['x-forwarded-host']  ?? req.headers['host'] ?? req.get('host');
    return `${proto}://${host}`;
  }

  /** Twilio posts here when a call arrives on the bot's number. Returns TwiML. */
  @Post(':botId/voice')
  @Header('Content-Type', 'text/xml')
  async voice(
    @Param('botId') botId: string,
    @Body() body: Record<string, string>,
    @Req() req: any,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(req);
    return this.twilioSvc.handleIncomingCall(
      botId,
      body.CallSid ?? '',
      body.From    ?? '',
      body.To      ?? '',
      baseUrl,
    );
  }

  /** Twilio posts the speech transcript here after a <Gather>. Returns TwiML. */
  @Post(':botId/gather')
  @Header('Content-Type', 'text/xml')
  async gather(
    @Param('botId') botId: string,
    @Body() body: Record<string, string>,
    @Req() req: any,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(req);
    return this.twilioSvc.handleGather(
      botId,
      body.CallSid      ?? '',
      body.SpeechResult ?? '',
      baseUrl,
    );
  }

  /** Twilio posts the final call status here when the call ends. */
  @Post(':botId/status')
  async status(
    @Param('botId') botId: string,
    @Body() body: Record<string, string>,
  ): Promise<{ ok: boolean }> {
    await this.twilioSvc.handleStatus(botId, body);
    return { ok: true };
  }

  /** Serves ElevenLabs-generated MP3 files for Twilio <Play> */
  @Get('/tts/:filename')
  serveTts(@Param('filename') filename: string, @Res() res: any) {
    const safe = path.basename(filename);
    const fp = path.join(TTS_DIR, safe);
    if (!safe.endsWith('.mp3') || !fs.existsSync(fp)) {
      return res.status(404).send('Not found');
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(fp).pipe(res);
  }
}
