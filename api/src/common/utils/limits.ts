import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type Resource = 'users' | 'contacts' | 'inboxes' | 'call_minutes' | 'ai_chatbots' | 'call_bots' | 'campaigns' | 'automations' | 'flows';

export async function checkPlanLimit(
  db: DataSource,
  tenantId: string,
  resource: Resource,
): Promise<void> {
  // Use ::text casts on ALL tenant_id/id columns so PostgreSQL always compares
  // text=text regardless of whether the column is uuid or varchar in each table.
  const [row] = await db.query(
    `SELECT
       p.max_users, p.max_contacts, p.max_inboxes, p.max_call_minutes,
       p.max_ai_chatbots, p.max_call_bots, p.max_campaigns, p.max_automations, p.max_flows,
       p.allow_overage,
       t.stripe_subscription_status, t.plan_expires_at,
       (SELECT COUNT(*)::int FROM users            WHERE tenant_id::text=$1 AND is_active=true)  AS users_count,
       (SELECT COUNT(*)::int FROM contacts         WHERE tenant_id::text=$1)                     AS contacts_count,
       (SELECT COUNT(*)::int FROM inboxes          WHERE tenant_id::text=$1)                     AS inboxes_count,
       (SELECT COUNT(*)::int FROM ai_chatbots      WHERE tenant_id::text=$1)                     AS ai_chatbots_count,
       (SELECT COUNT(*)::int FROM call_bots        WHERE tenant_id::text=$1)                     AS call_bots_count,
       (SELECT COUNT(*)::int FROM campaigns        WHERE tenant_id::text=$1)                     AS campaigns_count,
       (SELECT COUNT(*)::int FROM automation_rules WHERE tenant_id::text=$1)                     AS automations_count,
       (SELECT COUNT(*)::int FROM conversation_flows WHERE tenant_id::text=$1)                   AS flows_count,
       COALESCE((
         SELECT SUM(duration)::int FROM call_logs
         WHERE tenant_id::text=$1 AND created_at >= date_trunc('month', NOW())
       ), 0) AS call_seconds_count
     FROM tenants t
     LEFT JOIN plans p ON p.id = t.plan_id
     WHERE t.id::text = $1`,
    [tenantId],
  );

  if (!row) return;

  // If plan allows overage (pay-as-you-go), never block resource creation
  if (row.allow_overage) return;

  // If plan is expired or subscription is not active, apply FREE plan limits
  const subStatus = row.stripe_subscription_status ?? 'none';
  const planExpiry = row.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const isExpired  = planExpiry ? planExpiry < new Date() : false;
  const isActive   = ['active', 'trialing'].includes(subStatus);
  const useFree    = isExpired && !isActive;

  // Safety net: if tenant has no plan assigned (plan_id NULL), apply FREE plan limits
  const FREE: Record<string, number> = {
    max_users: 2, max_contacts: 500, max_inboxes: 1,
    max_ai_chatbots: 0, max_call_bots: 0, max_call_minutes: 0,
    max_campaigns: 2, max_automations: 5, max_flows: 2,
  };
  const lim = (col: string, fallback: number) =>
    useFree ? (FREE[col] ?? fallback) : (row[col] != null ? Number(row[col]) : (FREE[col] ?? fallback));

  const checks: Record<Resource, { limit: number; count: number; label: string }> = {
    users:        { limit: lim('max_users', 2),         count: row.users_count,                        label: 'usuarios' },
    contacts:     { limit: lim('max_contacts', 500),    count: row.contacts_count,                     label: 'contactos' },
    inboxes:      { limit: lim('max_inboxes', 1),       count: row.inboxes_count,                      label: 'inboxes' },
    ai_chatbots:  { limit: lim('max_ai_chatbots', 0),   count: row.ai_chatbots_count,                  label: 'AI chatbots' },
    call_bots:    { limit: lim('max_call_bots', 0),     count: row.call_bots_count,                    label: 'call bots' },
    campaigns:    { limit: lim('max_campaigns', 2),     count: row.campaigns_count,                    label: 'campañas' },
    automations:  { limit: lim('max_automations', 5),   count: row.automations_count,                  label: 'automatizaciones' },
    flows:        { limit: lim('max_flows', 2),         count: row.flows_count,                        label: 'flujos de conversación' },
    call_minutes: { limit: lim('max_call_minutes', 0),  count: Math.ceil(row.call_seconds_count / 60), label: 'minutos de llamada este mes' },
  };

  const { limit, count, label } = checks[resource];
  if (limit > 0 && count >= limit) {
    throw new ForbiddenException(
      `Has alcanzado el límite de ${limit} ${label} de tu plan. Actualiza tu plan para continuar.`,
    );
  }
}

export interface OverageResult {
  extraMessages: number;
  extraMessageCost: number;
  extraMinutes: number;
  extraMinuteCost: number;
  totalOverageCost: number;
  allowOverage: boolean;
}

export function calculateOverage(
  usage: { aiMessagesMonth: number; callMinutesMonth: number },
  plan: {
    max_messages_month: number;
    max_call_minutes: number;
    extra_message_price: number;
    extra_call_minute_price: number;
    allow_overage: boolean;
  },
): OverageResult {
  const extraMessages = Math.max(0, (usage.aiMessagesMonth ?? 0) - (plan.max_messages_month ?? 0));
  const extraMessageCost = plan.extra_message_price > 0
    ? Math.ceil(extraMessages / 1000) * Number(plan.extra_message_price)
    : 0;

  const extraMinutes = Math.max(0, (usage.callMinutesMonth ?? 0) - (plan.max_call_minutes ?? 0));
  const extraMinuteCost = plan.extra_call_minute_price > 0
    ? extraMinutes * Number(plan.extra_call_minute_price)
    : 0;

  return {
    extraMessages,
    extraMessageCost,
    extraMinutes,
    extraMinuteCost,
    totalOverageCost: extraMessageCost + extraMinuteCost,
    allowOverage: plan.allow_overage ?? false,
  };
}
