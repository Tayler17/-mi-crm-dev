import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto, UpdateConversationDto } from './dto/conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly service: ConversationsService,
    private readonly events: EventEmitter2,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Post()
  async create(@Body() dto: CreateConversationDto, @TenantId() tenantId: string, @Request() req: any) {
    const conv = await this.service.create(dto as any, tenantId, req.user.id);
    this.events.emit('conversation.created', { tenantId, conversationId: conv.id, conversation: conv });
    return conv;
  }

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Request() req: any,
    @Query('status')     status?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('inboxId')    inboxId?: string,
    @Query('tagId')      tagId?: string,
    @Query('queueId')    queueId?: string,
  ) {
    const viewer = req?.user ? { id: req.user.id, role: req.user.role ?? 'agent' } : undefined;
    return this.service.findAllEnriched(tenantId, status, assignedTo, inboxId, tagId, queueId, viewer);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    const conv = await this.service.update(id, dto as any, tenantId, req.user.id);
    const d = dto as any;
    if (d.status === 'resolved') this.events.emit('conversation.resolved', { tenantId, conversationId: id, conversation: conv });
    else if (d.status === 'open')  this.events.emit('conversation.reopened', { tenantId, conversationId: id, conversation: conv });
    if (d.assignedTo)              this.events.emit('conversation.assigned',  { tenantId, conversationId: id, conversation: conv });
    return conv;
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.remove(id, tenantId, req.user.id);
  }

  // ── Conversation tags ─────────────────────────────────────────────────────

  @Get(':id/tags')
  async getTags(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.db.query(
      `SELECT t.id, t.name, t.color FROM conversation_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.conversation_id = $1 AND ct.tenant_id = $2`,
      [id, tenantId],
    );
  }

  @Post(':id/tags/:tagId')
  async addTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @TenantId() tenantId: string,
  ) {
    await this.db.query(
      `INSERT INTO conversation_tags (conversation_id, tag_id, tenant_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [id, tagId, tenantId],
    );
    return { success: true };
  }

  @Delete(':id/tags/:tagId')
  async removeTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @TenantId() tenantId: string,
  ) {
    await this.db.query(
      `DELETE FROM conversation_tags WHERE conversation_id=$1 AND tag_id=$2 AND tenant_id=$3`,
      [id, tagId, tenantId],
    );
    return { success: true };
  }

  // ── Bot session management ────────────────────────────────────────────────

  /** Returns the active bot session for this conversation (if any) */
  @Get(':id/bot-session')
  async getBotSession(@Param('id') id: string, @TenantId() tenantId: string) {
    const [session] = await this.db.query(
      `SELECT s.id, s.status, s.handed_off_at, s.chatbot_id,
              b.name AS bot_name
       FROM ai_chatbot_sessions s
       JOIN ai_chatbots b ON b.id = s.chatbot_id
       WHERE s.conversation_id = $1 AND s.tenant_id = $2
         AND s.status IN ('active', 'handed_off')
       ORDER BY s.created_at DESC LIMIT 1`,
      [id, tenantId],
    );
    return session ?? null;
  }

  /** Agent takes over (pauses bot) or restores bot control */
  @Patch(':id/bot-session')
  async updateBotSession(
    @Param('id') id: string,
    @Body() body: { action: 'take_over' | 'restore_bot' },
    @TenantId() tenantId: string,
  ) {
    if (body.action === 'take_over') {
      await this.db.query(
        `UPDATE ai_chatbot_sessions
         SET status = 'handed_off', handed_off_at = NOW()
         WHERE conversation_id = $1 AND tenant_id = $2 AND status = 'active'`,
        [id, tenantId],
      );
      await this.db.query(
        `UPDATE ai_chatbots SET handoff_count = handoff_count + 1
         WHERE id IN (SELECT chatbot_id FROM ai_chatbot_sessions WHERE conversation_id = $1 AND tenant_id = $2)`,
        [id, tenantId],
      );
    } else if (body.action === 'restore_bot') {
      await this.db.query(
        `UPDATE ai_chatbot_sessions
         SET status = 'active', handed_off_at = NULL
         WHERE conversation_id = $1 AND tenant_id = $2 AND status = 'handed_off'`,
        [id, tenantId],
      );
    }
    return this.getBotSession(id, tenantId);
  }
}
