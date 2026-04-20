import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, Req } from '@nestjs/common';
import { CallBotsService } from './call-bots.service';
import { CreateCallBotDto, UpdateCallBotDto } from './dto/call-bot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('call-bots')
@UseGuards(JwtAuthGuard)
export class CallBotsController {
  constructor(private readonly svc: CallBotsService) {}

  @Get('stats')
  getStats(@TenantId() tenantId: string) {
    return this.svc.getStats(tenantId);
  }

  @Get('logs')
  getLogs(
    @TenantId() tenantId: string,
    @Query('botId') botId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getLogs(tenantId, botId, limit ? +limit : 50);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateCallBotDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.create(dto, tenantId, req.user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCallBotDto, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.remove(id, tenantId);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.toggleStatus(id, tenantId);
  }

  @Post(':id/call')
  initiateCall(
    @Param('id') id: string,
    @Body('toNumber') toNumber: string,
    @TenantId() tenantId: string,
    @Req() req: any,
  ) {
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL
      ?? `${req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'}://${req.headers['x-forwarded-host'] ?? req.headers['host'] ?? req.get('host')}`;
    return this.svc.initiateOutboundCall(id, toNumber, tenantId, baseUrl);
  }
}
// trigger
