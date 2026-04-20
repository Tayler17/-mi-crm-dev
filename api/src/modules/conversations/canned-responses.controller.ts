import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { CannedResponsesService } from './canned-responses.service';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('canned-responses')
@UseGuards(JwtAuthGuard)
export class CannedResponsesController {
  constructor(private readonly service: CannedResponsesService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  create(@Body() dto: CreateCannedResponseDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.create(dto, tenantId, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCannedResponseDto, @TenantId() tenantId: string) {
    return this.service.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
