'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getConversationsReport, getDealsReport, getTeamsReport, getContactsReport,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function currency(v: any) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v) || 0);
}

function pct(a: number, b: number) {
  if (!b) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: '📱', whatsapp_web: '🔗', facebook: '👤',
  instagram: '📷', telegram: '✈️', email: '📧', chat: '💬', webchat: '💬',
};

// ── Mini bar chart ────────────────────────────────────────────────────────────

function BarChart({ data, valueKey = 'count', labelKey = 'day', color = 'var(--primary)', height = 56 }: {
  data: any[]; valueKey?: string; labelKey?: string; color?: string; height?: number;
}) {
  if (!data?.length) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Sin datos</div>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
          <div
            style={{ width: '100%', background: color, opacity: 0.85, borderRadius: '3px 3px 0 0', transition: 'height .3s', height: `${Math.max((Number(d[valueKey]) / max) * (height - 14), Number(d[valueKey]) > 0 ? 3 : 0)}px` }}
            title={`${d[labelKey]}: ${d[valueKey]}`}
          />
          {data.length <= 14 && <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{d[labelKey]}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '14px 18px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, children, cols = 1 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>{title}</div>
      <div style={cols > 1 ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 } : {}}>
        {children}
      </div>
    </div>
  );
}

// ── Date range picker ─────────────────────────────────────────────────────────

function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  const presets = [
    { label: '7d', days: 7 }, { label: '30d', days: 30 },
    { label: '90d', days: 90 }, { label: '6m', days: 180 },
  ];
  function applyPreset(days: number) {
    const t = new Date().toISOString().slice(0, 10);
    const f = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    onChange(f, t);
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {presets.map((p) => (
        <button key={p.label} className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => applyPreset(p.days)}>{p.label}</button>
      ))}
      <input type="date" className="form-input" style={{ fontSize: 12, width: 140 }} value={from} onChange={(e) => onChange(e.target.value, to)} />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      <input type="date" className="form-input" style={{ fontSize: 12, width: 140 }} value={to} onChange={(e) => onChange(from, e.target.value)} />
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabKey = 'conversations' | 'deals' | 'teams' | 'contacts';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('conversations');
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<TabKey, any>>({ conversations: null, deals: null, teams: null, contacts: null });
  const [loading, setLoading] = useState(false);

  const loadTab = useCallback(async (t: TabKey, f: string, toDate: string) => {
    setLoading(true);
    try {
      let result: any;
      if (t === 'conversations') result = await getConversationsReport(f, toDate);
      else if (t === 'deals') result = await getDealsReport(f, toDate);
      else if (t === 'teams') result = await getTeamsReport();
      else if (t === 'contacts') result = await getContactsReport(f, toDate);
      setData((p) => ({ ...p, [t]: result }));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTab(tab, from, to); }, [tab, from, to, loadTab]);

  const d = data[tab];

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'conversations', label: 'Conversaciones', icon: '💬' },
    { key: 'deals',         label: 'Ventas / Deals',  icon: '💼' },
    { key: 'teams',         label: 'Equipos & Colas', icon: '🏆' },
    { key: 'contacts',      label: 'Contactos',       icon: '👥' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes & Analytics</h1>
          <p className="page-subtitle">Métricas detalladas de todos los módulos del CRM</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none', marginBottom: -1,
            borderBottom: `2px solid ${tab === t.key ? 'var(--primary)' : 'transparent'}`,
            color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Date range (not for teams) */}
      {tab !== 'teams' && (
        <div style={{ marginBottom: 20 }}>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando reporte...</div>}

      {/* ── Conversations Tab ──────────────────────────────────────────────── */}
      {!loading && tab === 'conversations' && d && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat label="Total" value={d.summary.total} color="#3b82f6" />
            <Stat label="Abiertas" value={d.summary.open} color="#6366f1" />
            <Stat label="En espera" value={d.summary.pending} color="#f59e0b" />
            <Stat label="Resueltas" value={d.summary.resolved} color="#22c55e" />
            <Stat label="Tiempo prom. resolución" value={`${d.summary.avg_resolution_hours ?? '—'}h`} color="#8b5cf6" sub="en horas" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Trend */}
            <Section title="Conversaciones por día">
              <BarChart data={d.byDay} valueKey="total" labelKey="day" color="#3b82f6" height={80} />
            </Section>

            {/* By channel */}
            <Section title="Por canal">
              {d.byChannel.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin datos</div>
                : d.byChannel.map((c: any) => (
                  <div key={c.channel_type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13 }}>{CHANNEL_ICONS[c.channel_type] ?? '💬'} {c.channel_type}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: pct(c.total, d.summary.total), height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 24, textAlign: 'right' }}>{c.total}</span>
                    </div>
                  </div>
                ))
              }
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Resolution time */}
            <Section title="Tiempo de resolución">
              {[
                { label: '< 1 hora', value: d.resolutionTime.under_1h, color: '#22c55e' },
                { label: '1h – 24h', value: d.resolutionTime.one_to_24h, color: '#f59e0b' },
                { label: '> 24 horas', value: d.resolutionTime.over_24h, color: '#ef4444' },
              ].map((r) => {
                const total = d.summary.resolved || 1;
                return (
                  <div key={r.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: r.color, fontWeight: 600 }}>{r.label}</span>
                      <span>{r.value} <span style={{ color: 'var(--text-muted)' }}>({pct(r.value, total)})</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                      <div style={{ width: pct(r.value, total), height: '100%', background: r.color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* By agent */}
            <Section title="Rendimiento por agente">
              {d.byAgent.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin datos — asigna conversaciones a agentes</div>
                : d.byAgent.map((a: any) => (
                  <div key={a.agent_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{a.agent}</span>
                    <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
                      <span title="Total">{a.total} total</span>
                      <span style={{ color: '#22c55e' }} title="Resueltas">✓ {a.resolved}</span>
                      <span title="Prom. horas">{a.avg_hours}h</span>
                    </div>
                  </div>
                ))
              }
            </Section>
          </div>
        </>
      )}

      {/* ── Deals Tab ──────────────────────────────────────────────────────── */}
      {!loading && tab === 'deals' && d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat label="Pipeline activo" value={currency(d.summary.pipeline_value)} color="#f59e0b" />
            <Stat label="Ganados" value={currency(d.summary.won_value)} color="#22c55e" sub={`${d.summary.won} deals`} />
            <Stat label="Tasa de cierre" value={`${d.summary.win_rate ?? 0}%`} color="#6366f1" sub={`${d.summary.won}W / ${d.summary.lost}L`} />
            <Stat label="Total deals" value={d.summary.total} color="#3b82f6" sub={`${d.summary.active} activos`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
            <Section title="Deals creados por día">
              <BarChart data={d.byDay} valueKey="total" labelKey="day" color="#f59e0b" height={80} />
            </Section>

            <Section title="Funnel por etapa">
              {d.byStage.map((s: any) => (
                <div key={s.stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span>{s.stage}</span>
                  <div style={{ display: 'flex', gap: 10, color: 'var(--text-muted)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.count}</span>
                    <span style={{ color: '#f59e0b' }}>{currency(s.value)}</span>
                  </div>
                </div>
              ))}
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Won by month */}
            <Section title="Deals ganados — últimos 6 meses">
              <BarChart data={d.wonByMonth} valueKey="won" labelKey="month" color="#22c55e" height={72} />
            </Section>

            {/* By agent */}
            <Section title="Top agentes por ventas">
              {d.byAgent.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin datos</div>
                : d.byAgent.map((a: any, i: number) => (
                  <div key={a.agent} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: i === 0 ? '#f59e0b' : 'var(--text-muted)', fontSize: 14 }}>#{i + 1}</span>
                      <span style={{ fontWeight: 600 }}>{a.agent}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
                      <span style={{ color: '#22c55e', fontWeight: 700 }}>{currency(a.won_value)}</span>
                      <span>{a.won} ganados</span>
                    </div>
                  </div>
                ))
              }
            </Section>
          </div>
        </>
      )}

      {/* ── Teams Tab ──────────────────────────────────────────────────────── */}
      {!loading && tab === 'teams' && d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Teams */}
            <Section title="Equipos — conversaciones activas">
              {d.teamStats.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin equipos configurados</div>
                : d.teamStats.map((t: any) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color ?? '#6366f1', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.member_count} miembros</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                      <span style={{ color: '#3b82f6', fontWeight: 700 }}>{t.open_conversations} abiertas</span>
                      <span style={{ color: '#22c55e' }}>✓ {t.resolved_conversations}</span>
                    </div>
                  </div>
                ))
              }
            </Section>

            {/* Queues */}
            <Section title="Colas — estado actual">
              {d.queueStats.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin colas activas</div>
                : d.queueStats.map((q: any) => (
                  <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{q.name}</span>
                      <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                        <span style={{ color: '#3b82f6', fontWeight: 700 }}>{q.active} activas</span>
                        {q.unassigned > 0 && <span style={{ color: '#f59e0b' }}>⚠ {q.unassigned} sin asignar</span>}
                      </div>
                    </div>
                    {q.active > 0 && (
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{
                          width: `${Math.min((q.unassigned / Math.max(q.active, 1)) * 100, 100)}%`,
                          height: '100%', background: '#f59e0b', borderRadius: 2,
                        }} />
                      </div>
                    )}
                  </div>
                ))
              }
            </Section>
          </div>

          {/* Agent load */}
          <Section title="Carga por agente">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Agente', 'Abiertas', 'En espera', 'Total', 'Carga'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Agente' ? 'left' : 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.agentLoad.map((a: any) => {
                    const maxTotal = Math.max(...d.agentLoad.map((x: any) => x.total), 1);
                    return (
                      <tr key={a.agent} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.agent}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#3b82f6', fontWeight: 700 }}>{a.open}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#f59e0b' }}>{a.pending}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{a.total}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, width: 80 }}>
                            <div style={{ width: `${(a.open / maxTotal) * 100}%`, height: '100%', background: '#6366f1', borderRadius: 3 }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {/* ── Contacts Tab ──────────────────────────────────────────────────── */}
      {!loading && tab === 'contacts' && d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat label="Total contactos" value={d.summary.total} color="#6366f1" />
            <Stat label="Nuevos en el período" value={d.summary.new_in_period} color="#3b82f6" />
            <Stat label="Con empresa vinculada" value={d.summary.with_company} color="#22c55e" sub={pct(d.summary.with_company, d.summary.total)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Section title="Nuevos contactos por día">
              <BarChart data={d.byDay} valueKey="count" labelKey="day" color="#6366f1" height={80} />
            </Section>

            <Section title="Tags más usados">
              {d.topTags.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin tags asignados</div>
                : d.topTags.map((t: any) => (
                  <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color ?? '#6366f1', display: 'inline-block' }} />
                      {t.name}
                    </span>
                    <span style={{ fontWeight: 700, color: '#6366f1' }}>{t.count}</span>
                  </div>
                ))
              }
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
