import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CallBot } from './entities/call-bot.entity';
import { CallLog } from './entities/call-log.entity';
import { CreateCallBotDto, UpdateCallBotDto } from './dto/call-bot.dto';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import axios from 'axios';

@Injectable()
export class CallBotsService {
  constructor(
    @InjectRepository(CallBot)
    private readonly botRepo: Repository<CallBot>,
    @InjectRepository(CallLog)
    private readonly logRepo: Repository<CallLog>,
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  findAll(tenantId: string) {
    return this.botRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, tenantId: string) {
    const bot = await this.botRepo.findOne({ where: { id, tenantId } });
    if (!bot) throw new NotFoundException('Call bot not found');
    return bot;
  }

  async create(dto: CreateCallBotDto, tenantId: string, userId?: string) {
    const bot = this.botRepo.create({
      tenantId,
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      language: dto.language ?? 'es-MX',
      voiceType: dto.voiceType ?? 'neutral',
      provider: dto.provider ?? 'twilio',
      providerConfig: dto.providerConfig ?? {},
      systemPrompt: dto.systemPrompt,
      welcomeMessage: dto.welcomeMessage,
      fallbackMessage: dto.fallbackMessage,
      handoffKeyword: dto.handoffKeyword ?? 'agente',
      maxCallDuration: dto.maxCallDuration ?? 300,
      status: 'draft',
      createdBy: userId,
    });
    return this.botRepo.save(bot);
  }

  async update(id: string, dto: UpdateCallBotDto, tenantId: string) {
    const bot = await this.findOne(id, tenantId);
    Object.assign(bot, dto);
    return this.botRepo.save(bot);
  }

  async remove(id: string, tenantId: string) {
    const bot = await this.findOne(id, tenantId);
    await this.botRepo.remove(bot);
  }

  async toggleStatus(id: string, tenantId: string) {
    const bot = await this.findOne(id, tenantId);
    bot.status = bot.status === 'active' ? 'inactive' : 'active';
    return this.botRepo.save(bot);
  }

  // ── Call Logs ─────────────────────────────────────────────────────────────────

  async getLogs(tenantId: string, botId?: string, limit = 50) {
    const where: any = { tenantId };
    if (botId) where.botId = botId;

    const logs = await this.logRepo.find({
      where,
      order: { startedAt: 'DESC' },
      take: limit,
    });

    // Enrich with bot name
    const botIds = [...new Set(logs.map((l) => l.botId).filter(Boolean))];
    const bots = botIds.length
      ? await this.botRepo.findByIds(botIds)
      : [];
    const botMap = Object.fromEntries(bots.map((b) => [b.id, b.name]));

    return logs.map((l) => ({ ...l, botName: l.botId ? botMap[l.botId] : null }));
  }

  // ── Outbound Calls ────────────────────────────────────────────────────────────

  async initiateOutboundCall(
    botId: string,
    toNumber: string,
    tenantId: string,
    baseUrl: string,
  ): Promise<{ callSid: string; status: string }> {
    const bot = await this.findOne(botId, tenantId);
    if (bot.status !== 'active') {
      throw new BadRequestException('El bot debe estar activo para realizar llamadas');
    }

    if (bot.provider === 'twilio') {
      const { accountSid, authToken } = await this.platformSettings.getVoice();
      const fromNumber = bot.phoneNumber;

      if (!accountSid || !authToken || !fromNumber) {
        throw new BadRequestException(
          'Faltan credenciales de voz. Configúralas en Ajustes → Plataforma.',
        );
      }

      const voiceUrl   = `${baseUrl}/call-bots/twilio/${botId}/voice`;
      const statusUrl  = `${baseUrl}/call-bots/twilio/${botId}/status`;

      const params = new URLSearchParams({
        To:             toNumber,
        From:           fromNumber,
        Url:            voiceUrl,
        StatusCallback: statusUrl,
        StatusCallbackMethod: 'POST',
      });

      const res = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        params.toString(),
        {
          auth:    { username: accountSid, password: authToken },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );

      return { callSid: res.data.sid, status: res.data.status };
    }

    throw new BadRequestException(`Proveedor "${bot.provider}" no soporta llamadas salientes desde este sistema aún.`);
  }

  async getStats(tenantId: string) {
    const bots = await this.botRepo.find({ where: { tenantId } });
    const totalBots = bots.length;
    const activeBots = bots.filter((b) => b.status === 'active').length;

    const rows = await this.logRepo.query(
      `SELECT
         COUNT(*)::int               AS total_calls,
         AVG(duration)::int          AS avg_duration,
         COUNT(*) FILTER (WHERE outcome = 'transferred')::int AS transferred,
         COUNT(*) FILTER (WHERE outcome = 'handled')::int     AS handled,
         COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24h')::int AS calls_today
       FROM call_logs
       WHERE tenant_id = $1`,
      [tenantId],
    );
    return { totalBots, activeBots, ...rows[0] };
  }
}
