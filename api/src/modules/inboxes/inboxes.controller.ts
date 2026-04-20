import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { InboxesService } from './inboxes.service';
import { CreateInboxDto, UpdateInboxDto } from './dto/inbox.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('inboxes')
@UseGuards(JwtAuthGuard)
export class InboxesController {
  constructor(private readonly service: InboxesService) {}

  @Post()
  create(@Body() dto: CreateInboxDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.create(dto as any, tenantId, req.user.id);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInboxDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.update(id, dto as any, tenantId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.remove(id, tenantId, req.user.id);
  }
}
