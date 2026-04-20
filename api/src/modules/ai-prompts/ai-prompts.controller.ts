import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AiPromptsService } from './ai-prompts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('ai-prompts')
@UseGuards(JwtAuthGuard)
export class AiPromptsController {
  constructor(private readonly svc: AiPromptsService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query('category') category?: string) {
    return this.svc.findAll(tenantId, category);
  }

  @Get('categories')
  getCategories(@TenantId() tenantId: string) { return this.svc.getCategories(tenantId); }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.findOne(id, tenantId); }

  @Post()
  create(@Body() dto: any, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.create(dto, tenantId, req.user?.sub ?? req.user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) { return this.svc.remove(id, tenantId); }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.duplicate(id, tenantId, req.user?.sub ?? req.user?.id);
  }

  @Post(':id/run')
  runPrompt(@Param('id') id: string, @Body() body: any, @TenantId() tenantId: string) {
    return this.svc.runPrompt(id, tenantId, body.variables ?? {}, body.conversationContext);
  }
}
