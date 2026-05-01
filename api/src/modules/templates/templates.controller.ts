import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post(':slug/apply')
  @UseGuards(RolesGuard)
  @Roles('admin')
  apply(@Param('slug') slug: string, @TenantId() tenantId: string) {
    return this.svc.apply(slug, tenantId);
  }
}
