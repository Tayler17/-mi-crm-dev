import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { WhatsappWebService } from './whatsapp-web.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(
    private readonly svc: ConnectionsService,
    private readonly waSvc: WhatsappWebService,
  ) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.create(dto, tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.remove(id, tenantId);
  }

  @Post(':id/test')
  testConnection(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.testConnection(id, tenantId);
  }

  @Get(':id/qr')
  getQr(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.waSvc.getQr(id, tenantId);
  }

  @Delete(':id/qr')
  disconnectQr(@Param('id') id: string) {
    this.waSvc.disconnectSession(id);
    return { ok: true };
  }
}
