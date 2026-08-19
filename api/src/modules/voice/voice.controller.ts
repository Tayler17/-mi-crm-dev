import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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
}
