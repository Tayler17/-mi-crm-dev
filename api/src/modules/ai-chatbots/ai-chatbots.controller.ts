import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AiChatbotsService } from './ai-chatbots.service';
import { AiChatbotEngineService } from './ai-chatbot-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('ai-chatbots')
@UseGuards(JwtAuthGuard)
export class AiChatbotsController {
  constructor(
    private readonly svc: AiChatbotsService,
    private readonly engine: AiChatbotEngineService,
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
  create(@Body() dto: any, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.create(dto, tenantId, req.user?.sub ?? req.user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.remove(id, tenantId); }

  @Post(':id/toggle')
  toggle(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.toggle(id, tenantId); }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.duplicate(id, tenantId, req.user?.sub ?? req.user?.id);
  }

  /** Test the bot with a single message (no real conversation needed). */
  @Post(':id/test-message')
  testMessage(
    @Param('id') id: string,
    @Body('message') message: string,
    @TenantId() tenantId: string,
  ) {
    return this.engine.testBotMessage(id, tenantId, message);
  }
}
