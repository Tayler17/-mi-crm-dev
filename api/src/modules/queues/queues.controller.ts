import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('queues')
@UseGuards(JwtAuthGuard)
export class QueuesController {
  constructor(private readonly svc: QueuesService) {}

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

  @Get(':id/conversations')
  getConversations(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getConversations(id, tenantId);
  }

  @Post('assign')
  assignConversation(@Body() body: { conversationId: string; queueId?: string; teamId?: string; userId?: string }, @TenantId() tenantId: string) {
    return this.svc.assignConversation(body.conversationId, body, tenantId);
  }
}
