import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get()
  async search(@Query('q') q: string, @TenantId() tenantId: string) {
    if (!q || q.trim().length < 2) return { contacts: [], conversations: [], deals: [] };
    const term = `%${q.trim().toLowerCase()}%`;

    const [contacts, conversations, deals] = await Promise.all([
      this.db.query(
        `SELECT id, full_name, email, phone
         FROM contacts
         WHERE tenant_id = $1
           AND (LOWER(full_name) LIKE $2 OR LOWER(email) LIKE $2 OR phone LIKE $2)
         ORDER BY full_name
         LIMIT 8`,
        [tenantId, term],
      ),
      this.db.query(
        `SELECT c.id, c.subject, c.status, c.channel_type,
                ct.full_name AS contact_name
         FROM conversations c
         LEFT JOIN contacts ct ON ct.id = c.contact_id
         WHERE c.tenant_id = $1
           AND (LOWER(c.subject) LIKE $2 OR LOWER(ct.full_name) LIKE $2 OR LOWER(ct.email) LIKE $2)
         ORDER BY c.last_message_at DESC NULLS LAST
         LIMIT 8`,
        [tenantId, term],
      ),
      this.db.query(
        `SELECT d.id, d.title, d.value, d.currency, d.status,
                ct.full_name AS contact_name
         FROM deals d
         LEFT JOIN contacts ct ON ct.id = d.contact_id
         WHERE d.tenant_id = $1
           AND (LOWER(d.title) LIKE $2 OR LOWER(ct.full_name) LIKE $2)
         ORDER BY d.updated_at DESC
         LIMIT 8`,
        [tenantId, term],
      ),
    ]);

    return { contacts, conversations, deals };
  }
}
