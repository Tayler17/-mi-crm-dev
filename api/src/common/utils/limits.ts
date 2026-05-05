import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type Resource = 'users' | 'contacts' | 'inboxes' | 'call_minutes' | 'ai_chatbots' | 'call_bots';

export async function checkPlanLimit(
  db: DataSource,
  tenantId: string,
  resource: Resource,
): Promise<void> {
  const [row] = await db.query(
    `SELECT
       p.max_users, p.max_contacts, p.max_inboxes, p.max_call_minutes,
       p.max_ai_chatbots, p.max_call_bots, p.allow_overage,
       (SELECT COUNT(*)::int FROM users       WHERE tenant_id=$1 AND is_active=true)  AS users_count,
       (SELECT COUNT(*)::int FROM contacts    WHERE tenant_id=$1)                     AS contacts_count,
       (SELECT COUNT(*)::int FROM inboxes     WHERE tenant_id=$1)                     AS inboxes_count,
       (SELECT COUNT(*)::int FROM ai_chatbots WHERE tenant_id::text=$1::text)           AS ai_chatbots_count,
       (SELECT COUNT(*)::int FROM call_bots   WHERE tenant_id::text=$1::text)           AS call_bots_count,
       COALESCE((
         SELECT SUM(duration)::int FROM call_logs
         WHERE tenant_id::text=$1::text AND created_at >= date_trunc('month', NOW())
       ), 0) AS call_seconds_count
     FROM tenants t
     LEFT JOIN plans p ON p.id = t.plan_id
     WHERE t.id = $1`,
    [tenantId],
  );

  if (!row) return;

  // If plan allows overage (pay-as-you-go), never block resource creation
  if (row.allow_overage) return;

  // Safety net: if tenant has no plan assigned (plan_id NULL), apply FREE plan limits
  const FREE: Record<string, number> = {
    max_users: 2, max_contacts: 500, max_inboxes: 1,
    max_ai_chatbots: 0, max_call_bots: 0, max_call_minutes: 0,
  };
  const lim = (col: string, fallback: number) =>
    row[col] != null ? Number(row[col]) : (FREE[col] ?? fallback);

  const checks: Record<Resource, { limit: number; count: number; label: string }> = {
    users:        { limit: lim('max_users', 2),         count: row.users_count,                        label: 'usuarios' },
    contacts:     { limit: lim('max_contacts', 500),    count: row.contacts_count,                     label: 'contactos' },
    inboxes:      { limit: lim('max_inboxes', 1),       count: row.inboxes_count,                      label: 'inboxes' },
    ai_chatbots:  { limit: lim('max_ai_chatbots', 0),   count: row.ai_chatbots_count,                  label: 'AI chatbots' },
    call_bots:    { limit: lim('max_call_bots', 0),     count: row.call_bots_count,                    label: 'call bots' },
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
