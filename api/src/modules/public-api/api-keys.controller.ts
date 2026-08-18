import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { PublicApiService } from './public-api.service';

/** Management of the tenant's public API keys (admin+). */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ApiKeysController {
  constructor(private readonly svc: PublicApiService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.svc.listKeys(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Req() req: any, @Body() dto: { label?: string }) {
    return this.svc.createKey(tenantId, req.user?.id, dto?.label);
  }

  @Delete(':id')
  revoke(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.svc.revokeKey(tenantId, id);
  }
}
