'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getTeams, createTeam, updateTeam, deleteTeam,
  getTeamMembers, getAvailableUsersForTeam, addTeamMember, removeTeamMember,
  Team, TeamMember,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

// ── Team Modal ────────────────────────────────────────────────────────────────

function TeamModal({ team, onSave, onClose }: {
  team: Team | null;
  onSave: (data: { name: string; description: string; color: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [color, setColor] = useState(team?.color ?? '#6366f1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(i.nameRequired); return; }
    setSaving(true); setError('');
    try { await onSave({ name, description, color }); onClose(); }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{team ? i.editTeam : i.newTeam}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.name} *</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.descOptional}</label>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${color === c ? '#fff' : c}`, outline: color === c ? `2px solid ${c}` : 'none', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? i.saving : i.save}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Team Detail Drawer ────────────────────────────────────────────────────────

function TeamDetail({ team, onClose, onRefresh }: { team: Team; onClose: () => void; onRefresh: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [tab, setTab] = useState<'members' | 'add'>('members');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const ROLE_CFG: Record<string, { label: string; bg: string; color: string }> = {
    supervisor: { label: i.roleSupervisor, bg: '#ede9fe', color: '#7c3aed' },
    agent: { label: i.roleAgent, bg: '#dbeafe', color: '#1d4ed8' },
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([getTeamMembers(team.id), getAvailableUsersForTeam(team.id)]);
      setMembers(m); setAvailable(a);
    } finally { setLoading(false); }
  }, [team.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(userId: string, role: string) {
    setAdding(true);
    try { await addTeamMember(team.id, userId, role); await load(); onRefresh(); }
    finally { setAdding(false); }
  }

  async function handleRemove(userId: string) {
    await removeTeamMember(team.id, userId); await load(); onRefresh();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ width: 480, background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 18 }}>{team.name}</span>
            </div>
            {team.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{team.description}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {members.length} {members.length !== 1 ? i.memberPlural : i.memberSingular}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {[{ key: 'members', label: `${i.membersTab} (${members.length})` }, { key: 'add', label: i.addMemberTab }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent', color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'members' && (
            loading ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>{i.loading}</div>
            : members.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
                {i.noMembers}
                <div style={{ marginTop: 10 }}><button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setTab('add')}>{i.addMemberTab}</button></div>
              </div>
            ) : members.map((m) => {
              const rc = ROLE_CFG[m.role] ?? { label: m.role, bg: '#f3f4f6', color: '#6b7280' };
              return (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', marginBottom: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: team.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {(m.full_name || m.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email}</div>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.color }}>{rc.label}</span>
                  <button className="btn btn-ghost" style={{ padding: '3px 7px', fontSize: 12, color: 'var(--danger)', flexShrink: 0 }} onClick={() => handleRemove(m.user_id)}>✕</button>
                </div>
              );
            })
          )}

          {tab === 'add' && (
            <div>
              {available.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30, fontSize: 13 }}>{i.allMembersAdded}</div>
              ) : available.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', marginBottom: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {(u.full_name || u.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{u.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} disabled={adding} onClick={() => handleAdd(u.id, 'agent')}>{i.addAgent}</button>
                    <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 11 }} disabled={adding} onClick={() => handleAdd(u.id, 'supervisor')}>{i.addSupervisor}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [detail, setDetail] = useState<Team | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTeams(await getTeams()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(data: { name: string; description: string; color: string }) {
    if (editing) await updateTeam(editing.id, data);
    else await createTeam(data);
    await load();
  }

  async function handleDelete(t: Team) {
    if (!confirm(`${i.delete} "${t.name}"?`)) return;
    await deleteTeam(t.id);
    setTeams((p) => p.filter((x) => x.id !== t.id));
  }

  async function refreshDetail() {
    const fresh = await getTeams();
    setTeams(fresh);
    if (detail) { const u = fresh.find((t) => t.id === detail.id); if (u) setDetail(u); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.teamsTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.teamsSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ {i.newTeam}</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
      ) : teams.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>👥</div>
          <div style={{ fontSize: 16 }}>{i.noTeamsYet}</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ {i.createFirstTeam}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {teams.map((t) => (
            <div key={t.id} className="card" style={{ cursor: 'pointer', borderTop: `4px solid ${t.color}` }}
              onClick={() => setDetail(t)}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                  {t.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>}
                </div>
                {!t.isActive && <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>{i.inactive}</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex' }}>
                  {(t.members ?? []).slice(0, 5).map((m, idx) => (
                    <div key={m.user_id} title={m.full_name}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: t.color, border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, marginLeft: idx > 0 ? -8 : 0, zIndex: 5 - idx }}>
                      {(m.full_name || m.email || '?')[0].toUpperCase()}
                    </div>
                  ))}
                  {(t.memberCount ?? 0) > 5 && (
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e5e7eb', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#6b7280', marginLeft: -8 }}>
                      +{(t.memberCount ?? 0) - 5}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.memberCount ?? 0} {(t.memberCount ?? 0) !== 1 ? i.memberPlural : i.memberSingular}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditing(t); setShowModal(true); }}>{i.edit}</button>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(t)}>{i.delete}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <TeamModal team={editing} onSave={handleSave} onClose={() => { setShowModal(false); setEditing(null); }} />}
      {detail && <TeamDetail team={detail} onClose={() => setDetail(null)} onRefresh={refreshDetail} />}
    </div>
  );
}
