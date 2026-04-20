import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

/** Public endpoint — no JWT required */
@Controller('plans/public')
export class PlansPublicController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get()
  getPublicPlans() {
    return this.db.query(
      `SELECT * FROM plans WHERE is_active = true AND is_public = true ORDER BY position`,
    );
  }
}

@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Tenant: own plan ───────────────────────────────────────────────────────

  /** Returns current tenant's plan and usage */
  @Get('current')
  async getCurrentPlan(@TenantId() tenantId: string) {
    const [tenant] = await this.db.query(
      `SELECT t.*, p.name AS plan_name, p.slug AS plan_slug,
              p.max_users, p.max_contacts, p.max_inboxes, p.max_campaigns,
              p.max_automations, p.max_flows, p.max_call_bots, p.max_ai_chatbots,
              p.max_messages_month, p.has_call_bots, p.has_ai_chatbots,
              p.has_automations, p.has_flows, p.has_reports, p.has_api_access,
              p.has_webhooks, p.price, p.billing_period, p.color
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );

    const [[users], [contacts], [inboxes], [campaigns], [automations], [flows], [callBots], [aiChatbots]] =
      await Promise.all([
        this.db.query(`SELECT COUNT(*)::int AS count FROM users WHERE tenant_id=$1 AND is_active=true`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM contacts WHERE tenant_id=$1`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM inboxes WHERE tenant_id=$1`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM campaigns WHERE tenant_id=$1`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM automation_rules WHERE tenant_id=$1`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM conversation_flows WHERE tenant_id=$1`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM call_bots WHERE tenant_id=$1`, [tenantId]),
        this.db.query(`SELECT COUNT(*)::int AS count FROM ai_chatbots WHERE tenant_id=$1`, [tenantId]),
      ]);

    return {
      tenant,
      usage: {
        users:       users.count,
        contacts:    contacts.count,
        inboxes:     inboxes.count,
        campaigns:   campaigns.count,
        automations: automations.count,
        flows:       flows.count,
        callBots:    callBots.count,
        aiChatbots:  aiChatbots.count,
      },
    };
  }

  // ── Admin: CRUD plans ──────────────────────────────────────────────────────

  @Get()
  getAllPlans() {
    return this.db.query(`SELECT * FROM plans ORDER BY position, created_at`);
  }

  @Get(':id')
  async getPlan(@Param('id') id: string) {
    const [plan] = await this.db.query(`SELECT * FROM plans WHERE id=$1`, [id]);
    return plan;
  }

  @Post()
  async createPlan(@Body() dto: any) {
    const [plan] = await this.db.query(
      `INSERT INTO plans (name, slug, description, price, currency, billing_period, position, color,
         max_users, max_contacts, max_inboxes, max_campaigns, max_automations, max_flows,
         max_call_bots, max_ai_chatbots, max_messages_month,
         has_call_bots, has_ai_chatbots, has_automations, has_flows, has_reports,
         has_api_access, has_webhooks, is_active, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING *`,
      [
        dto.name, dto.slug, dto.description ?? null, dto.price ?? 0, dto.currency ?? 'USD',
        dto.billingPeriod ?? 'monthly', dto.position ?? 0, dto.color ?? '#6366f1',
        dto.maxUsers ?? 3, dto.maxContacts ?? 1000, dto.maxInboxes ?? 2,
        dto.maxCampaigns ?? 5, dto.maxAutomations ?? 10, dto.maxFlows ?? 5,
        dto.maxCallBots ?? 0, dto.maxAiChatbots ?? 0, dto.maxMessagesMonth ?? 1000,
        dto.hasCallBots ?? false, dto.hasAiChatbots ?? false,
        dto.hasAutomations ?? true, dto.hasFlows ?? true, dto.hasReports ?? false,
        dto.hasApiAccess ?? false, dto.hasWebhooks ?? false,
        dto.isActive ?? true, dto.isPublic ?? true,
      ],
    );
    return plan;
  }

  @Patch(':id')
  async updatePlan(@Param('id') id: string, @Body() dto: any) {
    const fields: string[] = [];
    const values: any[]    = [];
    const map: Record<string, string> = {
      name: 'name', description: 'description', price: 'price', currency: 'currency',
      billingPeriod: 'billing_period', position: 'position', color: 'color',
      maxUsers: 'max_users', maxContacts: 'max_contacts', maxInboxes: 'max_inboxes',
      maxCampaigns: 'max_campaigns', maxAutomations: 'max_automations', maxFlows: 'max_flows',
      maxCallBots: 'max_call_bots', maxAiChatbots: 'max_ai_chatbots',
      maxMessagesMonth: 'max_messages_month', hasCallBots: 'has_call_bots',
      hasAiChatbots: 'has_ai_chatbots', hasAutomations: 'has_automations',
      hasFlows: 'has_flows', hasReports: 'has_reports', hasApiAccess: 'has_api_access',
      hasWebhooks: 'has_webhooks', isActive: 'is_active', isPublic: 'is_public',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { values.push(dto[k]); fields.push(`${col}=$${values.length}`); }
    }
    if (!fields.length) return this.getPlan(id);
    values.push(id);
    const [plan] = await this.db.query(
      `UPDATE plans SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`,
      values,
    );
    return plan;
  }

  @Delete(':id')
  async deletePlan(@Param('id') id: string) {
    await this.db.query(`DELETE FROM plans WHERE id=$1`, [id]);
    return { ok: true };
  }

  // ── Admin: assign plan to tenant ───────────────────────────────────────────

  @Post('assign')
  async assignPlan(@Body() dto: { tenantId: string; planId: string; expiresAt?: string }) {
    await this.db.query(
      `UPDATE tenants SET plan_id=$2, plan_expires_at=$3, plan='custom', updated_at=NOW() WHERE id=$1`,
      [dto.tenantId, dto.planId, dto.expiresAt ?? null],
    );
    return { ok: true };
  }

  // ── Admin: list all tenants with their plans ───────────────────────────────

  @Get('tenants/all')
  getTenantsWithPlans() {
    return this.db.query(
      `SELECT t.id, t.name, t.slug, t.is_active, t.plan, t.plan_expires_at, t.trial_ends_at,
              t.billing_email, t.billing_notes, t.created_at,
              p.id AS plan_id, p.name AS plan_name, p.slug AS plan_slug, p.price, p.color
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       ORDER BY t.created_at DESC`,
    );
  }

  @Patch('tenants/:id')
  async updateTenant(@Param('id') id: string, @Body() dto: any) {
    const fields: string[] = [];
    const values: any[]    = [];
    const map: Record<string, string> = {
      isActive: 'is_active', planExpiresAt: 'plan_expires_at',
      trialEndsAt: 'trial_ends_at', billingEmail: 'billing_email', billingNotes: 'billing_notes',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { values.push(dto[k]); fields.push(`${col}=$${values.length}`); }
    }
    if (!fields.length) return { ok: true };
    values.push(id);
    await this.db.query(
      `UPDATE tenants SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${values.length}`,
      values,
    );
    return { ok: true };
  }
}
