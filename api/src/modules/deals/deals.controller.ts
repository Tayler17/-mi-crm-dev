import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DealsService } from './deals.service';
import { CreateDealDto, UpdateDealDto, UpdateDealStageDto } from './dto/deal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(
    private readonly service: DealsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Post()
  create(@Body() dto: CreateDealDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.create(dto as any, tenantId, req.user.id);
  }

  @Get('kanban')
  kanban(@TenantId() tenantId: string, @Query('pipelineId') pipelineId?: string) {
    return this.service.findForKanban(tenantId, pipelineId);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Get(':id/detail')
  async getDealDetail(@Param('id') id: string, @TenantId() tenantId: string) {
    const [deal, tasks, notes, conversations, activities, calls] = await Promise.all([
      this.db.query(
        `SELECT d.*,
           ps.name AS stage_name, p.name AS pipeline_name, p.id AS pipeline_id,
           json_build_object('id', ct.id, 'fullName', ct.full_name, 'email', ct.email, 'phone', ct.phone) AS contact,
           json_build_object('id', comp.id, 'name', comp.name) AS company,
           json_build_object('id', u.id, 'fullName', u.full_name) AS assigned_user
         FROM deals d
         LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
         LEFT JOIN pipelines p ON p.id = ps.pipeline_id
         LEFT JOIN contacts ct ON ct.id = d.contact_id
         LEFT JOIN companies comp ON comp.id = d.company_id
         LEFT JOIN users u ON u.id = d.assigned_to
         WHERE d.id = $1 AND d.tenant_id = $2`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT t.*, u.full_name AS assignee_name
         FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.deal_id = $1 AND t.tenant_id = $2
         ORDER BY t.due_date ASC`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT m.id, m.body, m.created_at, u.full_name AS author
         FROM messages m LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.is_private = true
           AND m.conversation_id IN (
             SELECT id FROM conversations
             WHERE contact_id = (SELECT contact_id FROM deals WHERE id = $1)
               AND tenant_id = $2
           )
         ORDER BY m.created_at DESC LIMIT 20`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT c.id, c.status, c.created_at, c.updated_at,
           json_build_object('id', i.id, 'name', i.name, 'channelType', i.channel_type) AS inbox,
           json_build_object('id', ct.id, 'fullName', ct.full_name) AS contact,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
         FROM conversations c
         LEFT JOIN inboxes i ON i.id = c.inbox_id
         LEFT JOIN contacts ct ON ct.id = c.contact_id
         WHERE c.contact_id = (SELECT contact_id FROM deals WHERE id = $1)
           AND c.tenant_id = $2
         ORDER BY c.updated_at DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT al.id, al.action, al.entity_type, al.created_at, u.full_name AS user_name
         FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.entity_id = $1 AND al.tenant_id = $2
         ORDER BY al.created_at DESC LIMIT 30`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT cl.*, cb.name AS bot_name
         FROM call_logs cl
         LEFT JOIN call_bots cb ON cb.id = cl.bot_id
         WHERE cl.contact_id = (SELECT contact_id FROM deals WHERE id = $1)
           AND cl.tenant_id = $2
         ORDER BY cl.started_at DESC LIMIT 30`,
        [id, tenantId],
      ),
    ]);
    return { deal: deal[0], tasks, notes, conversations, activities, calls };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.update(id, dto as any, tenantId, req.user.id);
  }

  @Patch(':id/stage')
  updateStage(@Param('id') id: string, @Body() dto: UpdateDealStageDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.updateStage(id, dto, tenantId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.remove(id, tenantId, req.user.id);
  }
}
