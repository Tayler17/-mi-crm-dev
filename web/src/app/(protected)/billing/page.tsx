'use client';

import { useEffect, useState } from 'react';
import { getCurrentPlan } from '@/lib/api';

interface PlanData {
  tenant: {
    name: string;
    plan: string;
    plan_name: string;
    plan_slug: string;
    plan_expires_at: string | null;
    trial_ends_at: string | null;
    stripe_subscription_status: string | null;
    billing_email: string | null;
    billing_notes: string | null;
    price: number;
    billing_period: string;
    color: string;
    max_users: number;
    max_contacts: number;
    max_inboxes: number;
    max_campaigns: number;
    max_automations: number;
    max_flows: number;
    max_call_bots: number;
    max_ai_chatbots: number;
    max_messages_month: number;
    max_call_minutes: number;
    allow_own_api_keys: boolean;
    allow_overage: boolean;
    extra_message_price: number;
    extra_call_minute_price: number;
    has_call_bots: boolean;
    has_ai_chatbots: boolean;
    has_automations: boolean;
    has_flows: boolean;
    has_reports: boolean;
    has_api_access: boolean;
    has_webhooks: boolean;
  };
  usage: {
    users: number;
    contacts: number;
    inboxes: number;
    campaigns: number;
    automations: number;
    flows: number;
    callBots: number;
    aiChatbots: number;
    aiMessagesMonth: number;
    callsMonth: number;
    callMinutesMonth: number;
  };
  overage: {
    extraMessages: number;
    extraMessageCost: number;
    extraMinutes: number;
    extraMinuteCost: number;
    totalOverageCost: number;
    allowOverage: boolean;
  } | null;
}

function UsageBar({ label, used, max, color = '#6366f1' }: { label: string; used: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const warn = pct >= 90;
  const barColor = warn ? '#ef4444' : pct >= 70 ? '#f59e0b' : color;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: warn ? '#ef4444' : 'var(--muted)' }}>
          {(used ?? 0).toLocaleString()} / {max === -1 ? '∞' : (max ?? 0).toLocaleString()}
          {max > 0 && ` (${pct}%)`}
        </span>
      </div>
      {max > 0 && (
        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 24px', flex: '1 1 160px', minWidth: 0,
    }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)' }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Feature({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 0' }}>
      <span style={{ color: enabled ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{enabled ? '✓' : '✕'}</span>
      <span style={{ color: enabled ? 'var(--fg)' : 'var(--muted)' }}>{label}</span>
    </div>
  );
}

export default function BillingPage() {
  const [data, setData]     = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    getCurrentPlan()
      .then((d) => setData(d as unknown as PlanData))
      .catch(() => setError('No se pudo cargar la información del plan.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Cargando...</div>;
  if (error)   return <div style={{ padding: 32, color: '#ef4444' }}>{error}</div>;
  if (!data)   return null;

  const { tenant, usage } = data;
  const planColor    = tenant.color ?? '#6366f1';
  const planName     = tenant.plan_name ?? tenant.plan ?? 'Sin plan';
  const expiresAt    = tenant.plan_expires_at ? new Date(tenant.plan_expires_at) : null;
  const trialEndsAt  = tenant.trial_ends_at   ? new Date(tenant.trial_ends_at)   : null;
  const stripeSub    = tenant.stripe_subscription_status ?? null;
  const now          = new Date();
  const daysLeft     = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000) : null;
  const trialLeft    = trialEndsAt ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000) : null;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Mi Plan & Uso</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        Monitorea el uso de tu workspace y los límites de tu plan actual.
      </p>

      {/* Plan header */}
      <div style={{
        background: 'var(--card)', border: `2px solid ${planColor}`, borderRadius: 14,
        padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20,
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: 12, background: planColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, flexShrink: 0,
        }}>🏆</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{planName}</span>
            {tenant.billing_period && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: planColor + '22', color: planColor, textTransform: 'uppercase',
              }}>{tenant.billing_period}</span>
            )}
          </div>
          {tenant.price != null && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              ${Number(tenant.price).toFixed(2)} / mes
            </div>
          )}
          {tenant.billing_email && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              📧 {tenant.billing_email}
            </div>
          )}
        </div>

        {/* Expiry / trial / Stripe badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {expiresAt && (
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: (daysLeft ?? 99) < 7 ? '#fef2f2' : '#fef9ee',
              color: (daysLeft ?? 99) < 7 ? '#dc2626' : '#92400e',
              border: `1px solid ${(daysLeft ?? 99) < 7 ? '#fca5a5' : '#fcd34d'}`,
            }}>
              {(daysLeft ?? 0) < 0 ? '⚠️ Plan vencido' : `⏳ Vence el ${expiresAt.toLocaleDateString()} (${daysLeft}d)`}
            </span>
          )}
          {trialEndsAt && !expiresAt && (
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: '#f0fdf4', color: '#166534', border: '1px solid #86efac',
            }}>
              🎁 Trial — {(trialLeft ?? 0) < 0 ? 'vencido' : `hasta ${trialEndsAt.toLocaleDateString()} (${trialLeft}d)`}
            </span>
          )}
          {!expiresAt && !trialEndsAt && stripeSub && (
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: stripeSub === 'active' ? '#f0fdf4' : stripeSub === 'trialing' ? '#eff6ff' : '#fef2f2',
              color: stripeSub === 'active' ? '#166534' : stripeSub === 'trialing' ? '#1e40af' : '#dc2626',
              border: `1px solid ${stripeSub === 'active' ? '#86efac' : stripeSub === 'trialing' ? '#93c5fd' : '#fca5a5'}`,
            }}>
              💳 Stripe: {stripeSub === 'active' ? '✅ Activo' : stripeSub === 'trialing' ? '🎁 Trial' : stripeSub === 'past_due' ? '⚠️ Pago pendiente' : stripeSub === 'canceled' ? '❌ Cancelado' : stripeSub}
            </span>
          )}
          {!expiresAt && !trialEndsAt && !stripeSub && (
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: '#f0fdf4', color: '#166534', border: '1px solid #86efac',
            }}>✅ Activo</span>
          )}
        </div>
      </div>

      {/* AI & Calls stat cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard
          icon="🧠"
          label="Mensajes IA este mes"
          value={(usage.aiMessagesMonth ?? 0).toLocaleString()}
          sub={(tenant.max_messages_month ?? 0) > 0 ? `Límite: ${Number(tenant.max_messages_month).toLocaleString()}` : undefined}
        />
        <StatCard
          icon="📞"
          label="Minutos de llamada este mes"
          value={(usage.callMinutesMonth ?? 0).toLocaleString()}
          sub={(tenant.max_call_minutes ?? 0) > 0 ? `Límite: ${tenant.max_call_minutes} min · ${usage.callsMonth ?? 0} llamadas` : `${usage.callsMonth ?? 0} llamadas`}
        />
        <StatCard
          icon="👥"
          label="Usuarios activos"
          value={usage.users ?? 0}
          sub={`Límite: ${tenant.max_users ?? '—'}`}
        />
        <StatCard
          icon="📇"
          label="Contactos totales"
          value={(usage.contacts ?? 0).toLocaleString()}
          sub={`Límite: ${Number(tenant.max_contacts ?? 0).toLocaleString()}`}
        />
      </div>

      {/* Usage bars */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px', marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Uso del plan</h2>

        <UsageBar label="Usuarios"        used={usage.users ?? 0}      max={tenant.max_users ?? 0}          color={planColor} />
        <UsageBar label="Contactos"       used={usage.contacts ?? 0}   max={tenant.max_contacts ?? 0}       color={planColor} />
        <UsageBar label="Inboxes"         used={usage.inboxes ?? 0}    max={tenant.max_inboxes ?? 0}        color={planColor} />
        <UsageBar label="Campañas"        used={usage.campaigns ?? 0}  max={tenant.max_campaigns ?? 0}      color={planColor} />

        {tenant.has_automations && (
          <UsageBar label="Automatizaciones" used={usage.automations ?? 0} max={tenant.max_automations ?? 0} color={planColor} />
        )}
        {tenant.has_flows && (
          <UsageBar label="Flujos de conversación" used={usage.flows ?? 0} max={tenant.max_flows ?? 0}      color={planColor} />
        )}
        {tenant.has_ai_chatbots && (
          <UsageBar label="AI Chatbots"     used={usage.aiChatbots ?? 0}  max={tenant.max_ai_chatbots ?? 0} color={planColor} />
        )}
        {tenant.has_call_bots && (
          <UsageBar label="Call Bots"       used={usage.callBots ?? 0}    max={tenant.max_call_bots ?? 0}   color={planColor} />
        )}
        {(tenant.max_messages_month ?? 0) > 0 && (
          <UsageBar label="Mensajes IA / mes"    used={usage.aiMessagesMonth ?? 0}  max={tenant.max_messages_month ?? 0} color={planColor} />
        )}
        {(tenant.max_call_minutes ?? 0) > 0 && (
          <UsageBar label="Minutos llamada / mes" used={usage.callMinutesMonth ?? 0} max={tenant.max_call_minutes ?? 0}   color={planColor} />
        )}
      </div>

      {/* Overage / uso extra */}
      {data.overage && (data.overage.extraMessages > 0 || data.overage.extraMinutes > 0) && (
        <div style={{
          background: 'var(--card)', borderRadius: 14, marginBottom: 16,
          border: `2px solid ${data.overage.allowOverage ? '#f59e0b' : '#ef4444'}`,
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {data.overage.allowOverage ? '📈 Uso extra este mes' : '⚠️ Límites superados'}
            </h2>
            {data.overage.allowOverage && data.overage.totalOverageCost > 0 && (
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>
                Total: ${data.overage.totalOverageCost.toFixed(2)}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.overage.extraMessages > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>🧠 Mensajes IA extra</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                    {data.overage.extraMessages.toLocaleString()} msgs
                    {tenant.extra_message_price > 0 && ` (${Math.ceil(data.overage.extraMessages / 1000)} bloques de 1,000)`}
                  </span>
                </div>
                {tenant.extra_message_price > 0 ? (
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>${data.overage.extraMessageCost.toFixed(2)}</span>
                ) : (
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Sin precio configurado</span>
                )}
              </div>
            )}
            {data.overage.extraMinutes > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>📞 Minutos de llamada extra</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                    {data.overage.extraMinutes} min
                  </span>
                </div>
                {tenant.extra_call_minute_price > 0 ? (
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>${data.overage.extraMinuteCost.toFixed(2)}</span>
                ) : (
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Sin precio configurado</span>
                )}
              </div>
            )}
          </div>

          {!data.overage.allowOverage && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#ef4444' }}>
              Tu plan no permite uso extra. Algunas funcionalidades pueden estar bloqueadas.
            </div>
          )}
        </div>
      )}

      {/* Features included */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Funcionalidades incluidas</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 24px' }}>
          <Feature label="Automatizaciones"      enabled={tenant.has_automations} />
          <Feature label="Flujos de conversación" enabled={tenant.has_flows} />
          <Feature label="AI Chatbots"           enabled={tenant.has_ai_chatbots} />
          <Feature label="Call Bots"             enabled={tenant.has_call_bots} />
          <Feature label="Reportes avanzados"    enabled={tenant.has_reports} />
          <Feature label="Acceso a API"          enabled={tenant.has_api_access} />
          <Feature label="Webhooks"              enabled={tenant.has_webhooks} />
          <Feature label="API Keys propias"      enabled={tenant.allow_own_api_keys} />
          <Feature label="Uso adicional permitido" enabled={tenant.allow_overage} />
        </div>
      </div>

      {tenant.billing_notes && (
        <div style={{
          marginTop: 16, padding: '12px 16px', background: '#fef9ee',
          border: '1px solid #fcd34d', borderRadius: 10, fontSize: 13, color: '#92400e',
        }}>
          📝 {tenant.billing_notes}
        </div>
      )}
    </div>
  );
}
