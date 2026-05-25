import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('csat')
export class CsatController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Request CSAT for a resolved conversation (agent-triggered) ────────────

  @Post('request/:conversationId')
  @UseGuards(JwtAuthGuard)
  async requestCsat(
    @Param('conversationId') conversationId: string,
    @TenantId() tenantId: string,
  ) {
    const token = randomBytes(32).toString('hex');
    const [row] = await this.db.query(
      `INSERT INTO csat_responses (tenant_id, conversation_id, contact_id, token, created_at)
       SELECT $1, $2, contact_id, $3, NOW()
       FROM conversations WHERE id=$2 AND tenant_id=$1
       RETURNING id, token`,
      [tenantId, conversationId, token],
    );
    if (!row) return { error: 'Conversation not found' };
    await this.db.query(
      `UPDATE conversations SET csat_requested_at=NOW() WHERE id=$1 AND tenant_id=$2`,
      [conversationId, tenantId],
    );
    // Emit SSE so inbox shows survey pill
    this.notifications.emit({
      tenantId, type: 'csat_requested',
      payload: { conversationId, token, surveyUrl: `/survey/${token}` },
    });
    return { token, surveyUrl: `/survey/${token}` };
  }

  // ── Public: submit rating (no auth — anyone with the token can rate) ──────

  @Post('submit/:token')
  async submitCsat(
    @Param('token') token: string,
    @Body() body: { score: number; comment?: string },
  ) {
    const score = Math.min(5, Math.max(1, Math.round(Number(body.score))));
    if (!score) return { error: 'Invalid score' };
    const [row] = await this.db.query(
      `UPDATE csat_responses
       SET score=$1, comment=$2, submitted_at=NOW()
       WHERE token=$3 AND submitted_at IS NULL
       RETURNING id, tenant_id, conversation_id`,
      [score, body.comment?.slice(0, 500) ?? null, token],
    );
    if (!row) return { error: 'Token inválido o ya enviado' };
    // Emit SSE for realtime update in reports/inbox
    this.notifications.emit({
      tenantId: row.tenant_id, type: 'csat_submitted',
      payload: { conversationId: row.conversation_id, score },
    });
    return { ok: true };
  }

  // ── Reports: aggregated CSAT data ─────────────────────────────────────────

  @Get('report')
  @UseGuards(JwtAuthGuard)
  async getReport(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ?? new Date(Date.now() - 30 * 86400_000).toISOString();
    const toDate   = to   ?? new Date().toISOString();

    const [summary] = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)::int AS total_responses,
         COUNT(*) FILTER (WHERE submitted_at IS NULL)::int     AS pending,
         ROUND(AVG(score) FILTER (WHERE submitted_at IS NOT NULL), 2) AS avg_score,
         COUNT(*) FILTER (WHERE score = 5 AND submitted_at IS NOT NULL)::int AS five_star,
         COUNT(*) FILTER (WHERE score = 4 AND submitted_at IS NOT NULL)::int AS four_star,
         COUNT(*) FILTER (WHERE score = 3 AND submitted_at IS NOT NULL)::int AS three_star,
         COUNT(*) FILTER (WHERE score = 2 AND submitted_at IS NOT NULL)::int AS two_star,
         COUNT(*) FILTER (WHERE score = 1 AND submitted_at IS NOT NULL)::int AS one_star
       FROM csat_responses
       WHERE tenant_id=$1 AND created_at BETWEEN $2 AND $3`,
      [tenantId, fromDate, toDate],
    );

    const byDay = await this.db.query(
      `SELECT DATE_TRUNC('day', submitted_at)::date AS day,
              ROUND(AVG(score), 2) AS avg_score, COUNT(*)::int AS count
       FROM csat_responses
       WHERE tenant_id=$1 AND submitted_at BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 1`,
      [tenantId, fromDate, toDate],
    );

    const recent = await this.db.query(
      `SELECT cr.id, cr.score, cr.comment, cr.submitted_at,
              c.full_name AS contact_name, conv.subject
       FROM csat_responses cr
       LEFT JOIN contacts c ON c.id = cr.contact_id
       LEFT JOIN conversations conv ON conv.id = cr.conversation_id
       WHERE cr.tenant_id=$1 AND cr.submitted_at IS NOT NULL
       ORDER BY cr.submitted_at DESC LIMIT 20`,
      [tenantId],
    );

    return { summary, byDay, recent };
  }

  // ── List for a specific conversation ─────────────────────────────────────

  @Get('conversation/:conversationId')
  @UseGuards(JwtAuthGuard)
  async getForConversation(
    @Param('conversationId') conversationId: string,
    @TenantId() tenantId: string,
  ) {
    return this.db.query(
      `SELECT id, score, comment, submitted_at, token
       FROM csat_responses
       WHERE conversation_id=$1 AND tenant_id=$2
       ORDER BY created_at DESC`,
      [conversationId, tenantId],
    );
  }
}
