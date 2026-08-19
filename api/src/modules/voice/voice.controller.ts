import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Access token for the agent's browser softphone (Twilio Voice SDK). */
  @Get('token')
  @UseGuards(JwtAuthGuard)
  async token(@Req() req: any) {
    const result = await this.voice.generateToken(req.user.id);
    if (!result) return { ok: false, error: 'El softphone no está configurado (falta API Key/Secret de Twilio en Ajustes → Plataforma).' };
    return { ok: true, ...result };
  }

  /** Available transfer targets (other online agents + active bots) for an in-call agent. */
  @Get('transfer-targets')
  @UseGuards(JwtAuthGuard)
  async transferTargets(@Req() req: any) {
    return this.voice.getTransferTargets(req.user.tenantId, req.user.id);
  }

  /** Cold-transfer the agent's current call to another agent or a bot. */
  @Post('transfer')
  @UseGuards(JwtAuthGuard)
  async transfer(@Req() req: any, @Body() body: any) {
    return this.voice.transferAgentCall({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      clientCallSid: String(body?.callSid ?? ''),
      targetType: body?.targetType === 'bot' ? 'bot' : 'agent',
      targetId: String(body?.targetId ?? ''),
    });
  }

  /**
   * TwiML App voice endpoint — Twilio hits this when an agent's browser dials out
   * (device.connect). We bridge the outbound leg to the dialed PSTN number using the
   * tenant's business number as caller ID. PUBLIC (Twilio has no JWT); it only returns
   * instructions for a call the authenticated Device already initiated.
   */
  @Post('twiml')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async twiml(@Body() body: any, @Req() req: any, @Res() res: Response) {
    const to = String(body?.To ?? '').trim();
    const caller = String(body?.Caller ?? body?.From ?? '');
    const userId = caller.startsWith('client:') ? caller.slice('client:'.length) : '';
    const callerId = await this.voice.getTenantCallerId(userId);
    const xe = (s: string) => this.voice.xe(s);

    if (!to || !callerId) {
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES">No se puede completar la llamada.</Say><Hangup/></Response>');
      return;
    }
    // Log the agent's outbound call (finalized with duration/status by /voice/status).
    let actionAttr = '';
    const isPstn = !to.startsWith('client:');
    if (userId && isPstn) {
      const tenantId = await this.voice.getTenantId(userId);
      if (tenantId) {
        const logId = await this.voice.logOutboundCall({ tenantId, userId, from: callerId, to });
        if (logId) {
          const base = this.baseUrl(req);
          actionAttr = ` action="${xe(`${base}/voice/status?logId=${logId}`)}" method="POST"`;
        }
      }
    }
    // Allow agent→agent (client:) as well as PSTN numbers.
    const target = isPstn ? `<Number>${xe(to)}</Number>` : `<Client>${xe(to.slice('client:'.length))}</Client>`;
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${xe(callerId)}" answerOnBridge="true"${actionAttr}>${target}</Dial></Response>`,
    );
  }

  /** Dial action callback — Twilio POSTs here when the outbound leg ends. Finalizes the log. */
  @Post('status')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async status(@Query('logId') logId: string, @Body() body: any, @Res() res: Response) {
    if (logId) {
      const duration = Number(body?.DialCallDuration ?? body?.CallDuration ?? 0);
      const dialStatus = String(body?.DialCallStatus ?? body?.CallStatus ?? 'completed');
      await this.voice.finishCallLog(logId, duration, dialStatus);
    }
    // Empty response ends the call cleanly.
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  private baseUrl(req: any): string {
    return (
      process.env.TWILIO_WEBHOOK_BASE_URL ??
      `${req?.headers?.['x-forwarded-proto'] ?? 'https'}://${req?.headers?.['x-forwarded-host'] ?? req?.headers?.host ?? 'api.automarkiq.com'}`
    );
  }
}
