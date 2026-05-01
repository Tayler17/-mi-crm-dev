import {
  Controller, Get, Post, Param, Body, Res, Header,
} from '@nestjs/common';
import { Response } from 'express';
import { WebchatService } from './webchat.service';
import { WIDGET_JS } from './widget';

@Controller('webchat')
export class WebchatController {
  constructor(private readonly svc: WebchatService) {}

  // ── Widget script ─────────────────────────────────────────────────────────────

  @Get('widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Access-Control-Allow-Origin', '*')
  getWidget(@Res() res: Response) {
    res.send(WIDGET_JS);
  }

  // ── Public API (no JWT) ───────────────────────────────────────────────────────

  @Get(':botId/config')
  @Header('Access-Control-Allow-Origin', '*')
  getConfig(@Param('botId') botId: string) {
    return this.svc.getConfig(botId);
  }

  @Post(':botId/session')
  @Header('Access-Control-Allow-Origin', '*')
  initSession(
    @Param('botId') botId: string,
    @Body('visitorId') visitorId: string,
    @Body('visitorName') visitorName?: string,
    @Body('visitorEmail') visitorEmail?: string,
  ) {
    const vid = visitorId || `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return this.svc.initSession(botId, vid, visitorName, visitorEmail);
  }

  @Post('session/:sessionId/message')
  @Header('Access-Control-Allow-Origin', '*')
  sendMessage(
    @Param('sessionId') sessionId: string,
    @Body('message') message: string,
  ) {
    return this.svc.sendMessage(sessionId, message);
  }

  @Get('session/:sessionId/messages')
  @Header('Access-Control-Allow-Origin', '*')
  getMessages(@Param('sessionId') sessionId: string) {
    return this.svc.getMessages(sessionId);
  }
}
