import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { OutboundWebhooksService } from './outbound-webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('outbound-webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class OutboundWebhooksController {
  constructor(private readonly svc: OutboundWebhooksService) {}

  @Get()
  getAll(@TenantId() tenantId: string) {
    return this.svc.getAll(tenantId);
  }

  @Get('events')
  getEvents() {
    return { events: this.svc.SUPPORTED_EVENTS };
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: { name: string; url: string; secret?: string; events?: string[] }) {
    return this.svc.create(tenantId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @TenantId() tenantId: string, @Body() dto: any) {
    return this.svc.update(id, tenantId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.delete(id, tenantId);
  }

  @Post(':id/test')
  async testWebhook(@Param('id') id: string, @TenantId() tenantId: string) {
    const hooks = await this.svc.getAll(tenantId);
    const hook = hooks.find((h: any) => h.id === id);
    if (!hook) return { error: 'Not found' };
    await this.svc.fire(tenantId, 'test', { message: 'Test event from CRM SaaS', hookId: id });
    return { ok: true };
  }

  @Get(':id/logs')
  getLogs(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getLogs(id, tenantId, 100);
  }
}
