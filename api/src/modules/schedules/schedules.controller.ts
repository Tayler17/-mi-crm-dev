import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('schedules')
@UseGuards(JwtAuthGuard)
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Get(':id/status')
  checkStatus(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.checkStatus(id, tenantId);
  }

  @Get(':id/inboxes')
  getInboxes(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.getAssignedInboxes(id, tenantId);
  }

  @Post(':id/inboxes/:inboxId')
  assignInbox(@Param('id') id: string, @Param('inboxId') inboxId: string, @TenantId() tenantId: string) {
    return this.service.assignInbox(id, inboxId, tenantId);
  }

  @Delete(':id/inboxes/:inboxId')
  unassignInbox(@Param('id') id: string, @Param('inboxId') inboxId: string, @TenantId() tenantId: string) {
    return this.service.unassignInbox(id, inboxId, tenantId);
  }

  // ── Generic assignments ───────────────────────────────────────────────────────

  @Get(':id/assignments')
  getAssignments(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.getAssignments(id, tenantId);
  }

  @Get(':id/assignments/available')
  getAssignable(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    const type = req.query.type ?? 'inbox';
    return this.service.getAssignableTargets(id, tenantId, type);
  }

  @Post(':id/assignments')
  addAssignment(
    @Param('id') id: string,
    @Body() body: { targetType: string; targetId: string },
    @TenantId() tenantId: string,
  ) {
    return this.service.addAssignment(id, body.targetType, body.targetId, tenantId);
  }

  @Delete(':id/assignments/:assignmentId')
  removeAssignment(@Param('id') id: string, @Param('assignmentId') assignId: string, @TenantId() tenantId: string) {
    return this.service.removeAssignment(id, assignId, tenantId);
  }

  @Post()
  create(@Body() dto: CreateScheduleDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.create(dto, tenantId, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateScheduleDto, @TenantId() tenantId: string) {
    return this.service.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
