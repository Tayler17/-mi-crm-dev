import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiChatbotsService } from './ai-chatbots.service';
import { AiChatbotEngineService } from './ai-chatbot-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { checkPlanLimit } from '../../common/utils/limits';

@Controller('ai-chatbots')
@UseGuards(JwtAuthGuard)
export class AiChatbotsController {
  constructor(
    private readonly svc: AiChatbotsService,
    private readonly engine: AiChatbotEngineService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Get()
  findAll(@TenantId() tenantId: string) { return this.svc.findAll(tenantId); }

  @Get('stats')
  getStats(@TenantId() tenantId: string) { return this.svc.getStats(tenantId); }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.findOne(id, tenantId); }

  @Get(':id/sessions')
  getSessions(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.getSessions(id, tenantId); }

  @Post()
  async create(@Body() dto: any, @TenantId() tenantId: string, @Request() req: any) {
    await checkPlanLimit(this.db, tenantId, 'ai_chatbots');
    const safeDto = await this.stripModelIfNotAllowed(dto, tenantId);
    return this.svc.create(safeDto, tenantId, req.user?.sub ?? req.user?.id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    const safeDto = await this.stripModelIfNotAllowed(dto, tenantId);
    return this.svc.update(id, safeDto, tenantId);
  }

  /** Remove provider/model from dto if the tenant's plan doesn't allow own API keys. */
  private async stripModelIfNotAllowed(dto: any, tenantId: string): Promise<any> {
    const [row] = await this.db.query(
      `SELECT p.allow_own_api_keys
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );
    if (row?.allow_own_api_keys) return dto;
    const { provider: _p, model: _m, ...rest } = dto;
    return rest;
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.remove(id, tenantId); }

  @Post(':id/toggle')
  toggle(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.toggle(id, tenantId); }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.duplicate(id, tenantId, req.user?.sub ?? req.user?.id);
  }

  /** Improve a system prompt using the platform AI. */
  @Post('improve-prompt')
  async improvePrompt(@Body('system_prompt') systemPrompt: string) {
    const improved = await this.engine.improveSystemPrompt(systemPrompt ?? '');
    return { improved };
  }

  /** Test the bot with a message + prior turns so it keeps context (no greeting loop). */
  @Post(':id/test-message')
  testMessage(
    @Param('id') id: string,
    @Body('message') message: string,
    @TenantId() tenantId: string,
    @Body('history') history?: { role: string; content: string }[],
  ) {
    return this.engine.testBotMessage(id, tenantId, message, history ?? []);
  }
}
