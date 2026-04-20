import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private readonly service: ContactsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Post()
  create(@Body() dto: CreateContactDto, @TenantId() tenantId: string, @Request() req: any) {
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

  @Get(':id/profile')
  async getProfile(@Param('id') id: string, @TenantId() tenantId: string) {
    const [contact, deals, conversations, tags, notes, activities] = await Promise.all([
      this.db.query(
        `SELECT c.*, comp.name AS company_name
         FROM contacts c LEFT JOIN companies comp ON comp.id = c.company_id
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT d.*, ps.name AS stage_name, p.name AS pipeline_name
         FROM deals d
         LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
         LEFT JOIN pipelines p ON p.id = ps.pipeline_id
         WHERE d.contact_id = $1 AND d.tenant_id = $2
         ORDER BY d.created_at DESC`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT c.id, c.status, c.created_at, c.updated_at,
           json_build_object('id', i.id, 'name', i.name, 'channelType', i.channel_type) AS inbox,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
         FROM conversations c LEFT JOIN inboxes i ON i.id = c.inbox_id
         WHERE c.contact_id = $1 AND c.tenant_id = $2
         ORDER BY c.updated_at DESC LIMIT 20`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT t.id, t.name, t.color FROM tags t
         JOIN contact_tags ct ON ct.tag_id = t.id
         WHERE ct.contact_id = $1 AND t.tenant_id = $2`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT m.id, m.body, m.created_at, u.full_name AS author
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id IN (
           SELECT id FROM conversations WHERE contact_id = $1 AND tenant_id = $2
         ) AND m.is_private = true
         ORDER BY m.created_at DESC LIMIT 20`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT al.id, al.action, al.entity_type, al.new_values, al.old_values, al.created_at, u.full_name AS user_name
         FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.entity_id = $1 AND al.tenant_id = $2
         ORDER BY al.created_at DESC LIMIT 30`,
        [id, tenantId],
      ),
    ]);
    return { contact: contact[0], deals, conversations, tags, notes, activities };
  }

  @Post(':id/tags/:tagId')
  async addTag(@Param('id') contactId: string, @Param('tagId') tagId: string) {
    await this.db.query(
      `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [contactId, tagId],
    );
    return { ok: true };
  }

  @Delete(':id/tags/:tagId')
  async removeTag(@Param('id') contactId: string, @Param('tagId') tagId: string) {
    await this.db.query(
      `DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, tagId],
    );
    return { ok: true };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.update(id, dto as any, tenantId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.remove(id, tenantId, req.user.id);
  }
}
