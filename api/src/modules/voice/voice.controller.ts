import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
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

  /**
   * TwiML App voice endpoint — Twilio hits this when an agent's browser dials out
   * (device.connect). We bridge the outbound leg to the dialed PSTN number using the
   * tenant's business number as caller ID. PUBLIC (Twilio has no JWT); it only returns
   * instructions for a call the authenticated Device already initiated.
   */
  @Post('twiml')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async twiml(@Body() body: any, @Res() res: Response) {
    const to = String(body?.To ?? '').trim();
    const caller = String(body?.Caller ?? body?.From ?? '');
    const userId = caller.startsWith('client:') ? caller.slice('client:'.length) : '';
    const callerId = await this.voice.getTenantCallerId(userId);
    const xe = (s: string) => this.voice.xe(s);

    if (!to || !callerId) {
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES">No se puede completar la llamada.</Say><Hangup/></Response>');
      return;
    }
    // Allow agent→agent (client:) as well as PSTN numbers.
    const target = to.startsWith('client:')
      ? `<Client>${xe(to.slice('client:'.length))}</Client>`
      : `<Number>${xe(to)}</Number>`;
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${xe(callerId)}" answerOnBridge="true">${target}</Dial></Response>`,
    );
  }
}
