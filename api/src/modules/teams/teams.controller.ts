import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly svc: TeamsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: any, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.create(dto, tenantId, req.user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.remove(id, tenantId);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getMembers(id, tenantId);
  }

  @Get(':id/members/available')
  getAvailable(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getAvailableUsers(id, tenantId);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() body: { userId: string; role?: string }, @TenantId() tenantId: string) {
    return this.svc.addMember(id, body.userId, body.role ?? 'agent', tenantId);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @TenantId() tenantId: string) {
    return this.svc.removeMember(id, userId, tenantId);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getStats(id, tenantId);
  }
}
