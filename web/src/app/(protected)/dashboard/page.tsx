'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardStats, DashboardStats, getCurrentPlan } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

function currency(val: string | number) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(val) || 0);
}

function timeAgo(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_COLOR: Record<string, string> = {
  open: '#6366f1', pending: '#f59e0b', resolved: '#10b981',
};
// STATUS_LABEL is now built dynamically from APP dict inside the component
const CHANNEL_ICON: Record<string, string> = {
  whatsapp: '💬', email: '📧', web: '🌐', api: '🔌',
};
const ANNOUNCEMENT_META: Record<string, { color: string; bg: string; icon: string }> = {
  info:    { color: '#0369a1', bg: '#e0f2fe', icon: 'ℹ' },
  warning: { color: '#92400e', bg: '#fef3c7', icon: '⚠' },
  success: { color: '#065f46', bg: '#d1fae5', icon: '✓' },
  urgent:  { color: '#991b1b', bg: '#fee2e2', icon: '🔔' },
};

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60, paddingTop: 4 }}>
      {data.map((d) => (
        <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div
            style={{
              width: '100%', background: 'var(--primary)',
              height: `${Math.max((d.count / max) * 52, 4)}px`,
              borderRadius: '3px 3px 0 0', opacity: 0.85,
            }}
            title={`${d.day}: ${d.count}`}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.day}</span>
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ stages }: { stages: { name: string; count: number; value: string }[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stages.map((s, i) => (
        <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 90, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
          <div style={{ flex: 1, height: 20, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max((s.count / maxCount) * 100, s.count > 0 ? 8 : 0)}%`,
              height: '100%', background: colors[i % colors.length], borderRadius: 4,
              display: 'flex', alignItems: 'center', paddingLeft: 6, transition: 'width 0.5s',
            }}>
              {s.count > 0 && <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>{s.count}</span>}
            </div>
          </div>
          <div style={{ width: 70, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>{currency(s.value)}</div>
        </div>
      ))}
      {stages.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Sin pipeline predeterminado</div>}
    </div>
  );
}

function StatCard({
  label, value, sub, color, icon, onClick,
}: {
  label: string; value: string | number; sub?: string; color?: string; icon: string; onClick?: () => void;
}) {
  return (
    <div
      className="card"
      style={{ padding: '16px 20px', cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onClick={onClick}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, color: 'var(--text)' }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>{icon}</div>
      </div>
    </div>
  );
}

function AnnouncementBanner({ announcements, onDismiss }: {
  announcements: DashboardStats['announcements'];
  onDismiss: (id: string) => void;
}) {
  if (announcements.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
      {announcements.map((a) => {
        const meta = ANNOUNCEMENT_META[a.type] ?? ANNOUNCEMENT_META.info;
        return (
          <div
            key={a.id}
            style={{
              background: meta.bg, borderLeft: `4px solid ${meta.color}`,
              borderRadius: 8, padding: '10px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: meta.color }}>{a.title}</div>
              <div style={{ fontSize: 12, color: meta.color, opacity: 0.85, marginTop: 2 }}>{a.body}</div>
            </div>
            <button
              onClick={() => onDismiss(a.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: meta.color, fontSize: 16, opacity: 0.6, padding: 0, flexShrink: 0 }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

function usageColor(pct: number) {
  if (pct >= 100) return '#ef4444';
  if (pct >= 70)  return '#f59e0b';
  return '#10b981';
}

function usageEmoji(pct: number) {
  if (pct >= 100) return '🔴';
  if (pct >= 70)  return '🟡';
  return '🟢';
}

function PlanUsageWidget({ plan }: {
  plan: { tenant: any; usage: Record<string, number>; overage?: { totalOverageCost: number; allowOverage: boolean } | null }
}) {
  const [dismissed, setDismissed] = useState(false);
  const { tenant, usage, overage } = plan;
  if (!tenant) return null;

  const limitedItems = [
    { label: 'Usuarios',    used: usage.users            ?? 0, max: tenant.max_users           ?? 0 },
    { label: 'Contactos',   used: usage.contacts          ?? 0, max: tenant.max_contacts         ?? 0 },
    { label: 'Inboxes',     used: usage.inboxes           ?? 0, max: tenant.max_inboxes          ?? 0 },
    { label: 'Msgs IA/mes', used: usage.aiMessagesMonth   ?? 0, max: tenant.max_messages_month   ?? 0 },
    { label: 'Min tel/mes', used: usage.callMinutesMonth  ?? 0, max: tenant.max_call_minutes     ?? 0 },
  ].filter((item) => item.max > 0);

  const worstPct  = limitedItems.length > 0 ? Math.max(...limitedItems.map((i) => Math.round((i.used / i.max) * 100))) : 0;
  const isOver    = worstPct >= 100;
  const isWarn    = !isOver && worstPct >= 80;
  const extraCost = overage?.totalOverageCost ?? 0;
  const planName  = tenant.plan_name ?? tenant.plan ?? 'Plan';
  const planPrice = Number(tenant.price ?? 0);

  // Only show when approaching or over limit, and not dismissed by admin
  if ((!isOver && !isWarn) || dismissed) return null;

  const worstItem = limitedItems.reduce((a, b) =>
    Math.round((a.used / a.max) * 100) >= Math.round((b.used / b.max) * 100) ? a : b
  );
  const worstItemPct = Math.round((worstItem.used / worstItem.max) * 100);

  return (
    <div style={{
      marginBottom: 20, padding: '12px 16px', borderRadius: 10,
      background: isOver ? '#fef2f2' : '#fffbeb',
      border: `1px solid ${isOver ? '#fca5a5' : '#fcd34d'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ fontSize: 13, flex: 1 }}>
        <span style={{ fontWeight: 700, color: isOver ? '#dc2626' : '#92400e' }}>
          {isOver ? '🚨 Has superado el límite de tu plan' : `⚠️ ${worstItem.label} al ${worstItemPct}% — cerca del límite`}
        </span>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Plan {planName} · {worstItem.used.toLocaleString()} / {worstItem.max.toLocaleString()} {worstItem.label.toLowerCase()}
        </span>
        {isOver && extraCost > 0 && (
          <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 600 }}>— Coste extra: ${extraCost.toFixed(2)}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <a href="/billing" style={{
          fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 6,
          background: isOver ? '#dc2626' : '#f59e0b', color: '#fff', textDecoration: 'none',
        }}>
          {isOver ? 'Ver detalles' : 'Upgrade'}
        </a>
        <button onClick={() => setDismissed(true)} style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 16, color: 'var(--text-muted)', lineHeight: 1, padding: '2px 4px',
        }} title="Cerrar">✕</button>
      </div>
    </div>
  );
}

function MiniStatRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8, marginTop: 12 }}>
      {items.map((i) => (
        <div key={i.label} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: i.color ?? 'var(--text)' }}>{i.value}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{i.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [planData, setPlanData] = useState<{ tenant: any; usage: Record<string, number> } | null>(null);
  const user = getStoredUser();

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    getCurrentPlan().then(setPlanData).catch(() => {});
  }, []);

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? i.greeting_morning : greetingHour < 18 ? i.greeting_afternoon : i.greeting_evening;

  const STATUS_LABEL: Record<string, string> = { open: i.open, pending: i.pending, resolved: i.resolved };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', fontSize: 16 }}>
      {i.loadingMetrics}
    </div>
  );

  if (error) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 12 }}>{i.errorMetrics}: {error}</div>
      <button className="btn btn-primary" onClick={() => { setError(''); setLoading(true); getDashboardStats().then(setStats).catch((e) => setError(e.message)).finally(() => setLoading(false)); }}>{i.retry}</button>
    </div>
  );

  const s = stats!;
  const c = s.conversations;
  const convTotal = (c.open + c.pending + c.resolved) || 1;
  const activeAnnouncements = (s.announcements ?? []).filter((a) => !dismissed.has(a.id));

  return (
    <div style={{ padding: 24, maxWidth: 1300 }}>
      {/* Announcements banner */}
      <AnnouncementBanner
        announcements={activeAnnouncements}
        onDismiss={(id) => setDismissed((prev) => new Set([...prev, id]))}
      />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          {greeting}, {user?.fullName?.split(' ')[0] || 'usuario'} 👋
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Plan usage widget */}
      {planData && <PlanUsageWidget plan={planData as any} />}

      {/* KPI row — principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label={i.contacts}        value={s.contacts.total}          icon="👥" color="#6366f1" onClick={() => router.push('/contacts')} />
        <StatCard label={i.conversations}   value={c.total}    sub={`${c.today} ${i.today_suffix}`} icon="💬" color="#3b82f6" onClick={() => router.push('/inbox')} />
        <StatCard label={i.activeDeals}     value={s.deals.active} sub={currency(s.deals.pipeline_value)} icon="💼" color="#f59e0b" onClick={() => router.push('/kanban')} />
        <StatCard label={i.wonDeals}        value={s.deals.won}   sub={currency(s.deals.won_value)} icon="🏆" color="#10b981" />
        <StatCard label={i.pendingTasks}    value={s.tasks.total - s.tasks.completed} sub={s.tasks.overdue > 0 ? `⚠ ${s.tasks.overdue} ${i.overdue.toLowerCase()}` : 'Al día'} icon="✓" color={s.tasks.overdue > 0 ? '#ef4444' : '#10b981'} onClick={() => router.push('/tasks')} />
        <StatCard label={i.activeCampaigns} value={s.campaigns.active} sub={`${s.campaigns.total_sent} enviados`} icon="📣" color="#8b5cf6" onClick={() => router.push('/campaigns')} />
      </div>

      {/* KPI row — secundaria */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard
          label={i.companies} value={s.companies?.total ?? 0}
          sub={`${s.companies?.with_deals ?? 0} con deals`}
          icon="🏢" color="#0891b2"
          onClick={() => router.push('/companies')}
        />
        <StatCard
          label={i.connections} value={s.connections?.active ?? 0}
          sub={s.connections?.errors > 0 ? `⚠ ${s.connections.errors} con error` : `${s.connections?.total ?? 0} total`}
          icon="🔌" color={s.connections?.errors > 0 ? '#ef4444' : '#10b981'}
          onClick={() => router.push('/connections')}
        />
        <StatCard
          label={i.automations} value={s.automations?.active ?? 0}
          sub={`${s.automations?.total_executions ?? 0} ejecuciones`}
          icon="⚡" color="#f59e0b"
          onClick={() => router.push('/automations')}
        />
        <StatCard
          label={i.activeFlows} value={s.flows?.active ?? 0}
          sub={`${s.flows?.running_sessions ?? 0} ${i.runningSessions}`}
          icon="🔀" color="#8b5cf6"
          onClick={() => router.push('/flows')}
        />
      </div>

      {/* Middle 3-col row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Conversations */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{i.conversations}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/inbox')}>{i.view}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['open', 'pending', 'resolved'] as const).map((st) => {
              const val = c[st];
              const pct = Math.round((val / convTotal) * 100);
              return (
                <div key={st}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: STATUS_COLOR[st], fontWeight: 500 }}>{STATUS_LABEL[st]}</span>
                    <span style={{ fontWeight: 600 }}>{val} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: STATUS_COLOR[st], borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
          {s.conversationsTrend.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.last7days}</div>
              <BarChart data={s.conversationsTrend} />
            </div>
          )}
        </div>

        {/* Pipeline funnel */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{i.pipeline}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/kanban')}>{i.kanban} →</button>
          </div>
          <FunnelChart stages={s.dealsByStage} />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>{currency(s.deals.pipeline_value)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{i.inPipeline}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{currency(s.deals.won_value)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{i.won}</div>
            </div>
          </div>
        </div>

        {/* Tasks + System health */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{i.tasks}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/tasks')}>{i.view}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: i.dueToday,   value: s.tasks.due_today,  color: '#6366f1', icon: '📅' },
              { label: i.overdue,    value: s.tasks.overdue,    color: '#ef4444', icon: '⚠' },
              { label: i.completed,  value: s.tasks.completed,  color: '#10b981', icon: '✅' },
              { label: i.total,      value: s.tasks.total,      color: 'var(--text)', icon: '📋' },
            ].map((t) => (
              <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                <span style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><span>{t.icon}</span>{t.label}</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: t.color }}>{t.value}</span>
              </div>
            ))}
          </div>

          {/* System health divider */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{i.systemHealth}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: i.activeConnections, value: `${s.connections?.active ?? 0}/${s.connections?.total ?? 0}`, ok: (s.connections?.errors ?? 0) === 0 },
                { label: i.automations, value: `${s.automations?.active ?? 0} ${i.active.toLowerCase()}`, ok: true },
                { label: i.activeFlows, value: `${s.flows?.running_sessions ?? 0} ${i.runningSessions}`, ok: true },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: row.ok ? '#10b981' : '#ef4444', flexShrink: 0, display: 'inline-block' }} />
                    {row.label}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent conversations */}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{i.recentConversations}</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/inbox')}>{i.viewInbox}</button>
        </div>
        {s.recentConversations.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{i.noConversations}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {s.recentConversations.map((conv: any) => {
              const statusColor = STATUS_COLOR[conv.status] ?? '#6b7280';
              return (
                <div
                  key={conv.id}
                  onClick={() => router.push('/inbox')}
                  style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, cursor: 'pointer', borderLeft: `3px solid ${statusColor}`, transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {conv.contact?.fullName || conv.contact?.email || i.noContact}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6 }}>{timeAgo(conv.updated_at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 11 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{conv.inbox?.name ?? '—'}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{STATUS_LABEL[conv.status] ?? conv.status}</span>
                  </div>
                  {conv.last_message && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.last_message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
