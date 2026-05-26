import { Controller, Get, Post, Param, Body, Query, Res, HttpCode } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { WebhooksService } from './webhooks.service';

/**
 * Public webhook endpoints — NO auth guard (called by external services).
 */
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  // ── WhatsApp Business API (Meta) ─────────────────────────────────────────────

  @Get('whatsapp/:connectionId')
  async whatsappVerify(
    @Param('connectionId') connectionId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') token: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && challenge && await this.svc.verifyWebhookToken(connectionId, token)) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('whatsapp/:connectionId')
  @HttpCode(200)
  async whatsappIncoming(@Param('connectionId') connectionId: string, @Body() body: any) {
    await this.svc.processWhatsApp(connectionId, body);
    return { ok: true };
  }

  // ── Telegram ─────────────────────────────────────────────────────────────────

  @Post('telegram/:connectionId')
  @HttpCode(200)
  async telegramIncoming(@Param('connectionId') connectionId: string, @Body() body: any) {
    await this.svc.processTelegram(connectionId, body);
    return { ok: true };
  }

  // ── Facebook Messenger ────────────────────────────────────────────────────────

  @Get('facebook/:connectionId')
  async facebookVerify(
    @Param('connectionId') connectionId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') token: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && challenge && await this.svc.verifyWebhookToken(connectionId, token)) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('facebook/:connectionId')
  @HttpCode(200)
  async facebookIncoming(@Param('connectionId') connectionId: string, @Body() body: any) {
    await this.svc.processFacebook(connectionId, body);
    return { ok: true };
  }

  // ── Instagram ─────────────────────────────────────────────────────────────────

  @Get('instagram/:connectionId')
  async instagramVerify(
    @Param('connectionId') connectionId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') token: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && challenge && await this.svc.verifyWebhookToken(connectionId, token)) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('instagram/:connectionId')
  @HttpCode(200)
  async instagramIncoming(@Param('connectionId') connectionId: string, @Body() body: any) {
    await this.svc.processInstagram(connectionId, body);
    return { ok: true };
  }
}
