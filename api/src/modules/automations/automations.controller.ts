import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private readonly svc: AutomationsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOne(id, tenantId);
  }

  @Get(':id/executions')
  getExecutions(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getExecutions(id, tenantId);
  }

  @Post()
  create(@Body() dto: any, @TenantId() tenantId: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.svc.create(dto, tenantId, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.remove(id, tenantId);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.toggleActive(id, tenantId);
  }

  @Post(':id/test')
  testRun(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.testRun(id, tenantId);
  }
}
