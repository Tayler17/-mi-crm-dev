import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto, UpdatePipelineDto, CreateStageDto, UpdateStageDto } from './dto/pipeline.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('pipelines')
@UseGuards(JwtAuthGuard)
export class PipelinesController {
  constructor(private readonly service: PipelinesService) {}

  @Post()
  create(@Body() dto: CreatePipelineDto, @TenantId() tenantId: string, @Request() req: any) {
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
  update(@Param('id') id: string, @Body() dto: UpdatePipelineDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.update(id, dto as any, tenantId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.remove(id, tenantId, req.user.id);
  }

  // ── Stages ──────────────────────────────────────────────────────────────────

  @Get(':id/stages')
  getStages(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.findStages(id, tenantId);
  }

  @Post(':id/stages')
  createStage(@Param('id') id: string, @Body() dto: CreateStageDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.createStage(id, dto, tenantId, req.user.id);
  }

  @Patch(':id/stages/:stageId')
  updateStage(@Param('id') id: string, @Param('stageId') stageId: string, @Body() dto: UpdateStageDto, @TenantId() tenantId: string) {
    return this.service.updateStage(id, stageId, dto, tenantId);
  }

  @Delete(':id/stages/:stageId')
  deleteStage(@Param('id') id: string, @Param('stageId') stageId: string, @TenantId() tenantId: string) {
    return this.service.deleteStage(id, stageId, tenantId);
  }
}
