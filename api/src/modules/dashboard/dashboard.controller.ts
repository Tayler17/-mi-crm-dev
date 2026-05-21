import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get('stats')
  async getStats(
    @TenantId() tenantId: string,
    @Query('from') fromQ?: string,
    @Query('to')   toQ?:   string,
  ) {
    // Default range: last 30 days
    const from = fromQ ? new Date(fromQ) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to   = toQ   ? new Date(toQ)   : new Date();
    // Set to end of day for "to"
    to.setHours(23, 59, 59, 999);

    // Derive trend bucket size from range length
    const rangeDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const trendBucket = rangeDays <= 14 ? 'day' : rangeDays <= 90 ? 'week' : 'month';
    const trendFmt    = trendBucket === 'day' ? 'DD/MM' : trendBucket === 'week' ? 'IW/IYYY' : 'MM/YYYY';

    const [
      contacts,
      conversations,
      deals,
      tasks,
      campaigns,
      recentConversations,
      dealsByStage,
      conversationsTrend,
      companies,
      connections,
      automations,
      flows,
      announcements,
    ] = await Promise.all([
      // Contacts — all-time total
      this.db.query(
        `SELECT COUNT(*)::int AS total FROM contacts WHERE tenant_id = $1`,
        [tenantId],
      ),
      // Conversations — filtered by date range
      this.db.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
          COUNT(*) FILTER (WHERE created_at >= $2 AND created_at <= $3)::int AS in_range
         FROM conversations WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [tenantId, from, to],
      ),
      // Deals — won/lost/active in range; pipeline = current active
      this.db.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'won')::int AS won,
          COUNT(*) FILTER (WHERE status = 'lost')::int AS lost,
          COUNT(*) FILTER (WHERE status NOT IN ('won','lost'))::int AS active,
          COALESCE(SUM(value) FILTER (WHERE status NOT IN ('won','lost')), 0)::numeric AS pipeline_value,
          COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0)::numeric AS won_value
         FROM deals WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [tenantId, from, to],
      ),
      // Tasks — in range
      this.db.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status != 'completed' AND due_date < NOW())::int AS overdue,
          COUNT(*) FILTER (WHERE status != 'completed' AND due_date::date = CURRENT_DATE)::int AS due_today,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM tasks WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [tenantId, from, to],
      ),
      // Campaigns — in range
      this.db.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'running')::int AS active,
          COALESCE(SUM(sent_count), 0)::int AS total_sent
         FROM campaigns WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [tenantId, from, to],
      ),
      // Recent conversations (last 8, within range)
      this.db.query(
        `SELECT c.id, c.status, c.subject, c.created_at, c.updated_at,
           json_build_object('id', ct.id, 'fullName', ct.full_name, 'email', ct.email) AS contact,
           json_build_object('id', i.id, 'name', i.name, 'channelType', i.channel_type) AS inbox,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
         FROM conversations c
         LEFT JOIN contacts ct ON ct.id = c.contact_id
         LEFT JOIN inboxes i ON i.id = c.inbox_id
         WHERE c.tenant_id = $1 AND c.created_at >= $2 AND c.created_at <= $3
         ORDER BY c.updated_at DESC
         LIMIT 8`,
        [tenantId, from, to],
      ),
      // Deals by pipeline stage — always current active (no date filter)
      this.db.query(
        `SELECT ps.name, COUNT(d.id)::int AS count, COALESCE(SUM(d.value), 0)::numeric AS value
         FROM pipeline_stages ps
         LEFT JOIN deals d ON d.stage_id = ps.id AND d.tenant_id = $1 AND d.status NOT IN ('won','lost')
         JOIN pipelines p ON p.id = ps.pipeline_id AND p.tenant_id = $1 AND p.is_default = true
         GROUP BY ps.id, ps.name, ps.position
         ORDER BY ps.position`,
        [tenantId],
      ),
      // Conversations trend — bucketed by day/week/month based on range
      this.db.query(
        `SELECT
           TO_CHAR(DATE_TRUNC($4, created_at), '${trendFmt}') AS day,
           COUNT(*)::int AS count
         FROM conversations
         WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
         GROUP BY DATE_TRUNC($4, created_at)
         ORDER BY DATE_TRUNC($4, created_at)`,
        [tenantId, from, to, trendBucket],
      ),
      // Companies — all-time
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT company_id FROM contacts WHERE company_id IS NOT NULL AND tenant_id = $1))::int AS with_contacts,
           COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT company_id FROM deals WHERE company_id IS NOT NULL AND tenant_id = $1))::int AS with_deals
         FROM companies WHERE tenant_id = $1`,
        [tenantId],
      ),
      // Connections — current state
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'connected')::int AS active,
           COUNT(*) FILTER (WHERE status = 'error')::int AS errors
         FROM channel_connections WHERE tenant_id = $1`,
        [tenantId],
      ),
      // Automations — current state
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_active = true)::int AS active,
           COALESCE((SELECT COUNT(*)::int FROM automation_executions ae JOIN automation_rules ar ON ar.id = ae.rule_id WHERE ar.tenant_id = $1), 0) AS total_executions
         FROM automation_rules WHERE tenant_id = $1`,
        [tenantId],
      ),
      // Flows — current state
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_active = true)::int AS active,
           COALESCE((SELECT COUNT(*)::int FROM flow_sessions fs JOIN conversation_flows cf ON cf.id = fs.flow_id WHERE cf.tenant_id = $1 AND fs.status = 'active'), 0) AS running_sessions
         FROM conversation_flows WHERE tenant_id = $1`,
        [tenantId],
      ),
      // Active announcements
      this.db.query(
        `SELECT id, title, type, body, expires_at, created_at
         FROM announcements
         WHERE tenant_id = $1
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 5`,
        [tenantId],
      ),
    ]);

    return {
      contacts: contacts[0],
      conversations: conversations[0],
      deals: deals[0],
      tasks: tasks[0],
      campaigns: campaigns[0],
      recentConversations,
      dealsByStage,
      conversationsTrend,
      companies: companies[0],
      connections: connections[0],
      automations: automations[0],
      flows: flows[0],
      announcements,
      dateRange: { from: from.toISOString(), to: to.toISOString(), rangeDays },
    };
  }
}
