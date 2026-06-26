import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Conversations report ──────────────────────────────────────────────────────

  @Get('conversations')
  async conversations(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);

    const [summary, byDay, byChannel, byAgent, byStatus, resolutionTime] = await Promise.all([
      // Summary totals
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'open')::int AS open,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
           ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)::numeric, 1) AS avg_resolution_hours
         FROM conversations
         WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3`,
        [tenantId, f, t],
      ),
      // By day trend
      this.db.query(
        `SELECT TO_CHAR(created_at::date, 'DD/MM') AS day,
                created_at::date AS date,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
         FROM conversations
         WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3
         GROUP BY created_at::date ORDER BY created_at::date`,
        [tenantId, f, t],
      ),
      // By channel
      this.db.query(
        `SELECT channel_type, COUNT(*)::int AS total
         FROM conversations
         WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3
         GROUP BY channel_type ORDER BY total DESC`,
        [tenantId, f, t],
      ),
      // By agent — counts conversations each agent actually ATTENDED (sent at least
      // one human reply), not just ones assigned to them. Bots (sender_type='bot',
      // no sender_id) are excluded. One row per (agent, conversation) via DISTINCT.
      this.db.query(
        `SELECT u.full_name AS agent, u.id AS agent_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE x.status = 'resolved')::int AS resolved,
                ROUND(AVG(x.hours)::numeric, 1) AS avg_hours
         FROM (
           SELECT DISTINCT m.sender_id AS agent_id, m.conversation_id,
                  c.status, EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/3600 AS hours
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE m.tenant_id = $1
             AND m.sender_type = 'agent' AND m.sender_id IS NOT NULL
             AND m.is_private = false AND m.direction = 'outbound'
             AND c.created_at::date BETWEEN $2 AND $3
         ) x
         JOIN users u ON u.id = x.agent_id
         GROUP BY u.id, u.full_name ORDER BY total DESC LIMIT 10`,
        [tenantId, f, t],
      ),
      // By status distribution
      this.db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM conversations WHERE tenant_id = $1
         GROUP BY status`,
        [tenantId],
      ),
      // Resolution time buckets
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (updated_at - created_at)) < 3600)::int AS under_1h,
           COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (updated_at - created_at)) BETWEEN 3600 AND 86400)::int AS one_to_24h,
           COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (updated_at - created_at)) > 86400)::int AS over_24h
         FROM conversations
         WHERE tenant_id = $1 AND status = 'resolved' AND created_at::date BETWEEN $2 AND $3`,
        [tenantId, f, t],
      ),
    ]);

    return { summary: summary[0], byDay, byChannel, byAgent, byStatus, resolutionTime: resolutionTime[0], range: { from: f, to: t } };
  }

  // ── Deals / Sales report ──────────────────────────────────────────────────────

  @Get('deals')
  async deals(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);

    const [summary, byStage, byDay, byAgent, wonByMonth] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status NOT IN ('won','lost'))::int AS active,
           COUNT(*) FILTER (WHERE status = 'won')::int AS won,
           COUNT(*) FILTER (WHERE status = 'lost')::int AS lost,
           COALESCE(SUM(value) FILTER (WHERE status NOT IN ('won','lost')), 0)::numeric AS pipeline_value,
           COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0)::numeric AS won_value,
           COALESCE(SUM(value) FILTER (WHERE status = 'lost'), 0)::numeric AS lost_value,
           ROUND(
             100.0 * COUNT(*) FILTER (WHERE status = 'won') /
             NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')), 0), 1
           )::numeric AS win_rate
         FROM deals WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT ps.name AS stage,
                COUNT(d.id)::int AS count,
                COALESCE(SUM(d.value), 0)::numeric AS value
         FROM pipeline_stages ps
         LEFT JOIN deals d ON d.stage_id = ps.id AND d.tenant_id = $1 AND d.status NOT IN ('won','lost')
         JOIN pipelines p ON p.id = ps.pipeline_id AND p.tenant_id = $1
         GROUP BY ps.id, ps.name, ps.position ORDER BY ps.position`,
        [tenantId],
      ),
      this.db.query(
        `SELECT TO_CHAR(created_at::date, 'DD/MM') AS day,
                COUNT(*)::int AS total,
                COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0)::numeric AS won_value
         FROM deals
         WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3
         GROUP BY created_at::date ORDER BY created_at::date`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT u.full_name AS agent,
                COUNT(d.id)::int AS total,
                COUNT(d.id) FILTER (WHERE d.status = 'won')::int AS won,
                COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0)::numeric AS won_value
         FROM deals d
         JOIN users u ON u.id = d.assigned_to
         WHERE d.tenant_id = $1 AND d.created_at::date BETWEEN $2 AND $3
         GROUP BY u.id, u.full_name ORDER BY won_value DESC LIMIT 10`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YY') AS month,
                COUNT(*) FILTER (WHERE status = 'won')::int AS won,
                COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0)::numeric AS value
         FROM deals WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', created_at) ORDER BY DATE_TRUNC('month', created_at)`,
        [tenantId],
      ),
    ]);

    return { summary: summary[0], byStage, byDay, byAgent, wonByMonth, range: { from: f, to: t } };
  }

  // ── Teams & Queues report ─────────────────────────────────────────────────────

  @Get('teams')
  async teams(@TenantId() tenantId: string) {
    const [teamStats, queueStats, agentLoad] = await Promise.all([
      this.db.query(
        `SELECT t.id, t.name, t.color,
                COUNT(DISTINCT tm.user_id)::int AS member_count,
                COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open')::int AS open_conversations,
                COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'resolved')::int AS resolved_conversations
         FROM teams t
         LEFT JOIN team_members tm ON tm.team_id = t.id
         LEFT JOIN conversations c ON c.team_id = t.id
         WHERE t.tenant_id = $1
         GROUP BY t.id, t.name, t.color ORDER BY open_conversations DESC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT q.id, q.name, q.priority,
                COUNT(c.id) FILTER (WHERE c.status = 'open')::int AS active,
                COUNT(c.id) FILTER (WHERE c.status = 'open' AND c.assigned_to IS NULL)::int AS unassigned,
                q.max_wait_minutes
         FROM queues q
         LEFT JOIN conversations c ON c.queue_id = q.id
         WHERE q.tenant_id = $1 AND q.is_active = true
         GROUP BY q.id, q.name, q.priority, q.max_wait_minutes ORDER BY active DESC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT u.full_name AS agent,
                COUNT(c.id) FILTER (WHERE c.status = 'open')::int AS open,
                COUNT(c.id) FILTER (WHERE c.status = 'pending')::int AS pending,
                COUNT(c.id) FILTER (WHERE c.status = 'resolved')::int AS resolved_today,
                COUNT(c.id)::int AS total
         FROM users u
         LEFT JOIN conversations c ON c.assigned_to = u.id
         WHERE u.tenant_id = $1 AND u.is_active = true
         GROUP BY u.id, u.full_name ORDER BY open DESC LIMIT 15`,
        [tenantId],
      ),
    ]);

    return { teamStats, queueStats, agentLoad };
  }

  // ── Call bots report ─────────────────────────────────────────────────────────

  @Get('calls')
  async calls(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);

    const [summary, byDay, byBot, byOutcome, avgDuration] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
           COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound,
           COUNT(*) FILTER (WHERE outcome = 'handled')::int AS handled,
           COUNT(*) FILTER (WHERE outcome = 'abandoned')::int AS abandoned,
           COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed,
           COALESCE(ROUND(AVG(duration)::numeric, 0), 0)::int AS avg_duration_secs,
           COALESCE(SUM(duration), 0)::int AS total_duration_secs
         FROM call_logs
         WHERE tenant_id = $1 AND started_at::date BETWEEN $2 AND $3`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT TO_CHAR(started_at::date, 'DD/MM') AS day,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE outcome = 'handled')::int AS handled
         FROM call_logs
         WHERE tenant_id = $1 AND started_at::date BETWEEN $2 AND $3
         GROUP BY started_at::date ORDER BY started_at::date`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT cb.name AS bot,
                COUNT(cl.id)::int AS total,
                COUNT(cl.id) FILTER (WHERE cl.outcome = 'handled')::int AS handled,
                COALESCE(ROUND(AVG(cl.duration)::numeric, 0), 0)::int AS avg_duration
         FROM call_logs cl
         JOIN call_bots cb ON cb.id = cl.bot_id
         WHERE cl.tenant_id = $1 AND cl.started_at::date BETWEEN $2 AND $3
         GROUP BY cb.id, cb.name ORDER BY total DESC LIMIT 10`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT outcome, COUNT(*)::int AS count
         FROM call_logs
         WHERE tenant_id = $1 AND started_at::date BETWEEN $2 AND $3
         GROUP BY outcome`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE duration < 60)::int AS under_1min,
           COUNT(*) FILTER (WHERE duration BETWEEN 60 AND 300)::int AS one_to_5min,
           COUNT(*) FILTER (WHERE duration > 300)::int AS over_5min
         FROM call_logs
         WHERE tenant_id = $1 AND started_at::date BETWEEN $2 AND $3`,
        [tenantId, f, t],
      ),
    ]);

    return { summary: summary[0], byDay, byBot, byOutcome, avgDuration: avgDuration[0], range: { from: f, to: t } };
  }

  // ── Contacts report ───────────────────────────────────────────────────────────

  @Get('contacts')
  async contacts(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);

    const [summary, byDay, topTags] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE created_at::date BETWEEN $2 AND $3)::int AS new_in_period,
                COUNT(*) FILTER (WHERE company_id IS NOT NULL)::int AS with_company
         FROM contacts WHERE tenant_id = $1`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT TO_CHAR(created_at::date, 'DD/MM') AS day, COUNT(*)::int AS count
         FROM contacts
         WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3
         GROUP BY created_at::date ORDER BY created_at::date`,
        [tenantId, f, t],
      ),
      this.db.query(
        `SELECT t.name, t.color, COUNT(ct.contact_id)::int AS count
         FROM tags t
         JOIN contact_tags ct ON ct.tag_id = t.id
         WHERE t.tenant_id = $1
         GROUP BY t.id, t.name, t.color ORDER BY count DESC LIMIT 10`,
        [tenantId],
      ),
    ]);

    return { summary: summary[0], byDay, topTags, range: { from: f, to: t } };
  }

  // ── SLA report ────────────────────────────────────────────────────────────────

  @Get('sla')
  async sla(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const t = to || new Date().toISOString().slice(0, 10);

    // First response time = elapsed seconds between conv.created_at and first agent outbound message
    // Resolution time     = elapsed seconds between conv.created_at and when resolved (updated_at when status='resolved')
    const [summary, byDay, byAgent, worst] = await Promise.all([
      this.db.query(
        `WITH frt AS (
           SELECT c.id,
                  EXTRACT(EPOCH FROM (MIN(m.created_at) - c.created_at)) AS first_response_secs,
                  CASE WHEN c.status = 'resolved'
                       THEN EXTRACT(EPOCH FROM (c.updated_at - c.created_at))
                       ELSE NULL END AS resolution_secs
           FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
                           AND m.direction = 'outbound'
                           AND m.sender_type = 'agent'
           WHERE c.tenant_id = $1
             AND c.created_at::date BETWEEN $2 AND $3
           GROUP BY c.id, c.status, c.updated_at, c.created_at
         )
         SELECT
           COUNT(*)::int                                              AS total,
           ROUND(AVG(first_response_secs))::int                      AS avg_first_response_secs,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY first_response_secs))::int AS median_first_response_secs,
           ROUND(AVG(resolution_secs))::int                          AS avg_resolution_secs,
           COUNT(*) FILTER (WHERE first_response_secs <= 300)::int   AS within_5min,
           COUNT(*) FILTER (WHERE first_response_secs <= 3600)::int  AS within_1h,
           COUNT(*) FILTER (WHERE first_response_secs IS NOT NULL)::int AS with_response
         FROM frt`,
        [tenantId, f, t],
      ),
      this.db.query(
        `WITH frt AS (
           SELECT c.id, c.created_at::date AS day,
                  EXTRACT(EPOCH FROM (MIN(m.created_at) - c.created_at)) AS first_response_secs
           FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
                           AND m.direction = 'outbound'
                           AND m.sender_type = 'agent'
           WHERE c.tenant_id = $1
             AND c.created_at::date BETWEEN $2 AND $3
           GROUP BY c.id, c.created_at::date
         )
         SELECT TO_CHAR(day, 'DD/MM') AS day,
                ROUND(AVG(first_response_secs))::int AS avg_secs,
                COUNT(*)::int AS conversations
         FROM frt GROUP BY day ORDER BY day`,
        [tenantId, f, t],
      ),
      this.db.query(
        `WITH frt AS (
           SELECT m.sender_id,
                  EXTRACT(EPOCH FROM (MIN(m.created_at) - c.created_at)) AS first_response_secs
           FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
                           AND m.direction = 'outbound'
                           AND m.sender_type = 'agent'
           WHERE c.tenant_id = $1
             AND c.created_at::date BETWEEN $2 AND $3
           GROUP BY c.id, m.sender_id, c.created_at
         )
         SELECT u.full_name AS agent,
                ROUND(AVG(frt.first_response_secs))::int AS avg_secs,
                COUNT(*)::int AS conversations
         FROM frt
         JOIN users u ON u.id = frt.sender_id
         GROUP BY u.full_name ORDER BY avg_secs LIMIT 10`,
        [tenantId, f, t],
      ),
      this.db.query(
        `WITH frt AS (
           SELECT c.id, c.subject, ct.full_name AS contact_name,
                  EXTRACT(EPOCH FROM (MIN(m.created_at) - c.created_at)) AS first_response_secs
           FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
                           AND m.direction = 'outbound'
                           AND m.sender_type = 'agent'
           LEFT JOIN contacts ct ON ct.id = c.contact_id
           WHERE c.tenant_id = $1
             AND c.created_at::date BETWEEN $2 AND $3
           GROUP BY c.id, c.subject, ct.full_name, c.created_at
         )
         SELECT * FROM frt ORDER BY first_response_secs DESC LIMIT 10`,
        [tenantId, f, t],
      ),
    ]);

    return { summary: summary[0], byDay, byAgent, worst, range: { from: f, to: t } };
  }
}
