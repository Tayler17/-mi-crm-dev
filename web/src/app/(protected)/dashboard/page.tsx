'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardStats, DashboardStats } from '@/lib/api';

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
const STATUS_LABEL: Record<string, string> = {
  open: 'Abiertas', pending: 'En espera', resolved: 'Resueltas',
};
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const user = getStoredUser();

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Buenos días' : greetingHour < 18 ? 'Buenas tardes' : 'Buenas noches';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', fontSize: 16 }}>
      Cargando métricas…
    </div>
  );

  if (error) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 12 }}>No se pudieron cargar las métricas: {error}</div>
      <button className="btn btn-primary" onClick={() => { setError(''); setLoading(true); getDashboardStats().then(setStats).catch((e) => setError(e.message)).finally(() => setLoading(false)); }}>Reintentar</button>
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

      {/* KPI row — principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Contactos"          value={s.contacts.total}          icon="👥" color="#6366f1" onClick={() => router.push('/contacts')} />
        <StatCard label="Conversaciones"     value={c.total}    sub={`${c.today} hoy`} icon="💬" color="#3b82f6" onClick={() => router.push('/inbox')} />
        <StatCard label="Deals Activos"      value={s.deals.active} sub={currency(s.deals.pipeline_value)} icon="💼" color="#f59e0b" onClick={() => router.push('/kanban')} />
        <StatCard label="Deals Ganados"      value={s.deals.won}   sub={currency(s.deals.won_value)} icon="🏆" color="#10b981" />
        <StatCard label="Tareas Pendientes"  value={s.tasks.total - s.tasks.completed} sub={s.tasks.overdue > 0 ? `⚠ ${s.tasks.overdue} vencidas` : 'Al día'} icon="✓" color={s.tasks.overdue > 0 ? '#ef4444' : '#10b981'} onClick={() => router.push('/tasks')} />
        <StatCard label="Campañas Activas"   value={s.campaigns.active} sub={`${s.campaigns.total_sent} enviados`} icon="📣" color="#8b5cf6" onClick={() => router.push('/campaigns')} />
      </div>

      {/* KPI row — secundaria */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard
          label="Empresas" value={s.companies?.total ?? 0}
          sub={`${s.companies?.with_deals ?? 0} con deals`}
          icon="🏢" color="#0891b2"
          onClick={() => router.push('/companies')}
        />
        <StatCard
          label="Conexiones" value={s.connections?.active ?? 0}
          sub={s.connections?.errors > 0 ? `⚠ ${s.connections.errors} con error` : `${s.connections?.total ?? 0} total`}
          icon="🔌" color={s.connections?.errors > 0 ? '#ef4444' : '#10b981'}
          onClick={() => router.push('/connections')}
        />
        <StatCard
          label="Automatizaciones" value={s.automations?.active ?? 0}
          sub={`${s.automations?.total_executions ?? 0} ejecuciones`}
          icon="⚡" color="#f59e0b"
          onClick={() => router.push('/automations')}
        />
        <StatCard
          label="Flujos Activos" value={s.flows?.active ?? 0}
          sub={`${s.flows?.running_sessions ?? 0} sesiones abiertas`}
          icon="🔀" color="#8b5cf6"
          onClick={() => router.push('/flows')}
        />
      </div>

      {/* Middle 3-col row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Conversations */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Conversaciones</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/inbox')}>Ver →</button>
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
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Últimos 7 días</div>
              <BarChart data={s.conversationsTrend} />
            </div>
          )}
        </div>

        {/* Pipeline funnel */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Pipeline</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/kanban')}>Kanban →</button>
          </div>
          <FunnelChart stages={s.dealsByStage} />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>{currency(s.deals.pipeline_value)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>En pipeline</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{currency(s.deals.won_value)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ganados</div>
            </div>
          </div>
        </div>

        {/* Tasks + System health */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Tareas</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/tasks')}>Ver →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Para hoy',    value: s.tasks.due_today,  color: '#6366f1', icon: '📅' },
              { label: 'Vencidas',    value: s.tasks.overdue,    color: '#ef4444', icon: '⚠' },
              { label: 'Completadas', value: s.tasks.completed,  color: '#10b981', icon: '✅' },
              { label: 'Total',       value: s.tasks.total,      color: 'var(--text)', icon: '📋' },
            ].map((t) => (
              <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                <span style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><span>{t.icon}</span>{t.label}</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: t.color }}>{t.value}</span>
              </div>
            ))}
          </div>

          {/* System health divider */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Estado del sistema</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Conexiones activas', value: `${s.connections?.active ?? 0}/${s.connections?.total ?? 0}`, ok: (s.connections?.errors ?? 0) === 0 },
                { label: 'Automatizaciones', value: `${s.automations?.active ?? 0} activas`, ok: true },
                { label: 'Flujos corriendo', value: `${s.flows?.running_sessions ?? 0} sesiones`, ok: true },
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
          <span>Conversaciones Recientes</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/inbox')}>Ver Inbox →</button>
        </div>
        {s.recentConversations.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No hay conversaciones aún</div>
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
                      {conv.contact?.fullName || conv.contact?.email || 'Sin contacto'}
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
