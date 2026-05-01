'use client';

import { useEffect, useState, useMemo } from 'react';
import { getTasks, createTask, updateTask, deleteTask, getContacts, getDeals, type Task, type Contact, type Deal } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function today() { return toDateStr(new Date()); }
function weekEnd() {
  const d = new Date(); d.setDate(d.getDate() + 7); return toDateStr(d);
}

// ── calendar helpers ──────────────────────────────────────────────────────────

function calendarDays(year: number, month: number): (Date | null)[] {
  const first    = new Date(year, month, 1);
  const last     = new Date(year, month + 1, 0);
  const startDay = first.getDay(); // 0=Sun
  const days: (Date | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

// ── component ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const PRIORITY_LABEL: Record<string, string> = { low: i.priorityLow, medium: i.priorityMedium, high: i.priorityHigh };
  const STATUS_LABEL: Record<string, string>   = { pending: i.taskPending, completed: i.taskCompleted, cancelled: i.taskCancelled };
  const MONTH_NAMES = Array.from({ length: 12 }, (_, m) => {
    const s = new Intl.DateTimeFormat(i.locale, { month: 'long' }).format(new Date(2024, m, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  // Jan 7 2024 = Sunday (getDay()=0), Jan 8 = Monday, …, Jan 13 = Saturday
  const DAY_NAMES = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(i.locale, { weekday: 'short' }).format(new Date(2024, 0, d + 7)).replace(/\.$/, '')
  );

  // ─── data
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals]       = useState<Deal[]>([]);

  // ─── view & filters
  const [view, setView]             = useState<'list' | 'calendar'>('list');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDue, setFilterDue]       = useState('all');
  const [calYear, setCalYear]           = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]         = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay]   = useState<string>('');

  // ─── modals / form
  const [showCreate, setShowCreate]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTask, setEditTask]       = useState<Task | null>(null);
  const [saving, setSaving]           = useState(false);
  const [editError, setEditError]     = useState('');
  const [fTitle, setFTitle]           = useState('');
  const [fDesc, setFDesc]             = useState('');
  const [fPriority, setFPriority]     = useState('medium');
  const [fStatus, setFStatus]         = useState('pending');
  const [fDueDate, setFDueDate]       = useState('');
  const [fContactId, setFContactId]   = useState('');
  const [fDealId, setFDealId]         = useState('');

  function resetForm() { setFTitle(''); setFDesc(''); setFPriority('medium'); setFStatus('pending'); setFDueDate(''); setFContactId(''); setFDealId(''); }
  function load() { setLoading(true); getTasks().then(setTasks).catch((e) => setError(e.message)).finally(() => setLoading(false)); }

  useEffect(() => {
    load();
    getContacts().then(setContacts).catch(() => {});
    getDeals().then(setDeals).catch(() => {});
  }, []);

  // ─── toggle status inline
  async function toggleStatus(t: Task) {
    const next = t.status === 'pending' ? 'completed' : 'pending';
    try {
      await updateTask(t.id, { status: next });
      setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  // ─── filtered list
  const todayStr   = today();
  const weekEndStr = weekEnd();

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterDue === 'overdue')  return t.dueDate && t.dueDate.slice(0, 10) < todayStr && t.status === 'pending';
      if (filterDue === 'today')    return t.dueDate && t.dueDate.slice(0, 10) === todayStr;
      if (filterDue === 'week')     return t.dueDate && t.dueDate.slice(0, 10) >= todayStr && t.dueDate.slice(0, 10) <= weekEndStr;
      if (filterDue === 'no-date')  return !t.dueDate;
      return true;
    });
  }, [tasks, filterStatus, filterDue, todayStr, weekEndStr]);

  // ─── calendar data
  const calDays = useMemo(() => calendarDays(calYear, calMonth), [calYear, calMonth]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (t.dueDate) {
        const k = t.dueDate.slice(0, 10);
        (map[k] ??= []).push(t);
      }
    });
    return map;
  }, [tasks]);

  const selectedDayTasks = selectedDay ? (tasksByDay[selectedDay] ?? []) : [];

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    setSelectedDay('');
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    setSelectedDay('');
  }

  // ─── create
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) { setCreateError(i.titleRequired); return; }
    setCreating(true); setCreateError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), priority: fPriority };
      if (fDesc) payload.description = fDesc;
      if (fDueDate) payload.dueDate = fDueDate;
      if (fContactId) payload.contactId = fContactId;
      if (fDealId) payload.dealId = fDealId;
      await createTask(payload as Partial<Task>);
      setShowCreate(false); load();
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  // ─── edit
  function openEdit(t: Task) {
    setEditTask(t); setFTitle(t.title); setFDesc(t.description ?? ''); setFPriority(t.priority ?? 'medium');
    setFStatus(t.status ?? 'pending'); setFDueDate(t.dueDate ? t.dueDate.slice(0, 10) : '');
    setFContactId(t.contactId ?? ''); setFDealId(t.dealId ?? ''); setEditError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTask || !fTitle.trim()) { setEditError(i.titleRequired); return; }
    setSaving(true); setEditError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), priority: fPriority, status: fStatus };
      if (fDesc) payload.description = fDesc;
      payload.dueDate = fDueDate || null;
      if (fContactId) payload.contactId = fContactId;
      if (fDealId) payload.dealId = fDealId;
      await updateTask(editTask.id, payload as Partial<Task>);
      setEditTask(null); load();
    } catch (e: unknown) { setEditError(e instanceof Error ? e.message : 'Error'); } finally { setSaving(false); }
  }

  async function handleDelete(t: Task) {
    if (!confirm(i.confirmDeleteTask)) return;
    try { await deleteTask(t.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  // ─── render
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">{i.tasks}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['list', 'calendar'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '6px 14px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                  background: view === v ? 'var(--primary)' : 'var(--bg-card)',
                  color: view === v ? '#fff' : 'var(--text-muted)',
                  transition: 'all .15s',
                }}
              >
                {v === 'list' ? i.viewList : i.viewCalendar}
              </button>
            ))}
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} {i.tasks.toLowerCase()}</span>
          <button className="btn btn-primary" onClick={() => { resetForm(); setCreateError(''); setShowCreate(true); }}>+ {i.newTask}</button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
              {/* Status tabs */}
              <div className="filter-tabs" style={{ marginBottom: 0 }}>
                {(['all', 'pending', 'completed', 'cancelled'] as const).map((s) => (
                  <button key={s} className={`filter-tab${filterStatus === s ? ' active' : ''}`} onClick={() => setFilterStatus(s)}>
                    {s === 'all' ? i.all : STATUS_LABEL[s]}
                  </button>
                ))}
              </div>

              {/* Due date filter */}
              <select
                className="form-input"
                style={{ margin: 0, height: 36, fontSize: 13, flex: '0 1 180px' }}
                value={filterDue}
                onChange={(e) => setFilterDue(e.target.value)}
              >
                <option value="all">{i.anyDueDate}</option>
                <option value="overdue">{i.overdue}</option>
                <option value="today">{i.today}</option>
                <option value="week">{i.next7Days}</option>
                <option value="no-date">{i.noDate}</option>
              </select>
            </div>

            {loading ? (
              <div className="loading">{i.loading}</div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">✓</div>
                <p>{tasks.length === 0 ? i.noTasksYet : i.noTasksFilter}</p>
                {tasks.length === 0 && <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreate(true); }}>{i.createFirstTask}</button>}
              </div>
            ) : (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th>{i.titleLabel}</th>
                        <th>{i.priorityLabel}</th>
                        <th>{i.dueDateLabel}</th>
                        <th>{i.status}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((t) => {
                        const overdue = t.dueDate && t.dueDate.slice(0, 10) < todayStr && t.status === 'pending';
                        return (
                          <tr key={t.id} style={{ opacity: t.status === 'completed' ? 0.55 : 1 }}>
                            <td>
                              <input
                                type="checkbox"
                                checked={t.status === 'completed'}
                                onChange={() => toggleStatus(t)}
                                style={{ width: 15, height: 15, cursor: 'pointer' }}
                              />
                            </td>
                            <td>
                              <div style={{ fontWeight: 500, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.title}</div>
                              {t.description && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{t.description}</div>}
                            </td>
                            <td><span className={`badge badge-${t.priority || 'medium'}`}>{PRIORITY_LABEL[t.priority || 'medium']}</span></td>
                            <td style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
                              {t.dueDate ? new Date(t.dueDate).toLocaleDateString(i.locale) : '—'}
                              {overdue && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠ {i.overdue}</span>}
                            </td>
                            <td><span className={`badge badge-${t.status}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openEdit(t)}>{i.edit}</button>
                                <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(t)}>{i.delete}</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CALENDAR VIEW ── */}
        {view === 'calendar' && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {/* Calendar grid */}
            <div className="card" style={{ flex: '1 1 520px', padding: 0 }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={prevMonth}>‹</button>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{MONTH_NAMES[calMonth]} {calYear}</span>
                <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={nextMonth}>›</button>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
                {DAY_NAMES.map((d, idx) => (
                  <div key={idx} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {calDays.map((date, idx) => {
                  if (!date) return <div key={idx} style={{ minHeight: 72, borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border)' : undefined, borderBottom: '1px solid var(--border)' }} />;
                  const key      = toDateStr(date);
                  const dayTasks = tasksByDay[key] ?? [];
                  const isToday  = key === todayStr;
                  const isSel    = key === selectedDay;
                  const pending  = dayTasks.filter((t) => t.status === 'pending').length;
                  const done     = dayTasks.filter((t) => t.status === 'completed').length;
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedDay(isSel ? '' : key)}
                      style={{
                        minHeight: 72, padding: '6px 8px', cursor: dayTasks.length > 0 ? 'pointer' : 'default',
                        borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border)' : undefined,
                        borderBottom: '1px solid var(--border)',
                        background: isSel ? '#6366f115' : 'transparent',
                        transition: 'background .1s',
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 4, fontSize: 12, fontWeight: isToday ? 700 : 400,
                        background: isToday ? 'var(--primary)' : 'transparent',
                        color: isToday ? '#fff' : 'var(--text)',
                      }}>
                        {date.getDate()}
                      </div>
                      {pending > 0 && (
                        <div style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 5px', marginBottom: 2, fontWeight: 600 }}>
                          {pending} {i.calPending}
                        </div>
                      )}
                      {done > 0 && (
                        <div style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>
                          {done} {i.calDone}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Day task list */}
            <div className="card" style={{ flex: '0 1 300px', minWidth: 240, alignSelf: 'flex-start' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                {selectedDay
                  ? new Date(selectedDay + 'T12:00:00').toLocaleDateString(i.locale, { weekday: 'long', day: 'numeric', month: 'long' })
                  : i.selectDay}
              </div>
              {selectedDay && selectedDayTasks.length === 0 && (
                <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>{i.noTasksThisDay}</div>
              )}
              {selectedDayTasks.map((t) => (
                <div
                  key={t.id}
                  style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                >
                  <input
                    type="checkbox"
                    checked={t.status === 'completed'}
                    onChange={() => toggleStatus(t)}
                    style={{ marginTop: 3, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, textDecoration: t.status === 'completed' ? 'line-through' : 'none', opacity: t.status === 'completed' ? 0.6 : 1 }}>
                      {t.title}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                      <span className={`badge badge-${t.priority || 'medium'}`} style={{ fontSize: 10 }}>{PRIORITY_LABEL[t.priority || 'medium']}</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }} onClick={() => openEdit(t)}>✎</button>
                </div>
              ))}
              {!selectedDay && (
                <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  {i.clickDayPrompt}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">{i.newTask}</h2><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group"><label className="form-label">{i.titleLabel} *</label><input className="form-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} autoFocus /></div>
                <div className="form-group"><label className="form-label">{i.descriptionLabel}</label><textarea className="form-input" rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} style={{ resize: 'vertical' }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label className="form-label">{i.priorityLabel}</label><select className="form-input" value={fPriority} onChange={(e) => setFPriority(e.target.value)}><option value="low">{i.priorityLow}</option><option value="medium">{i.priorityMedium}</option><option value="high">{i.priorityHigh}</option></select></div>
                  <div className="form-group"><label className="form-label">{i.dueDateLabel}</label><input className="form-input" type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">{i.contactLabel}</label><select className="form-input" value={fContactId} onChange={(e) => setFContactId(e.target.value)}><option value="">{i.noContactOption}</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Deal</label><select className="form-input" value={fDealId} onChange={(e) => setFDealId(e.target.value)}><option value="">{i.noDealOption}</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{i.cancel}</button><button type="submit" className="btn btn-primary" disabled={creating}>{creating ? i.creating : i.newTask}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTask && (
        <div className="modal-overlay" onClick={() => setEditTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">{i.editTaskLabel}</h2><button className="modal-close" onClick={() => setEditTask(null)}>×</button></div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <div className="error-msg">{editError}</div>}
                <div className="form-group"><label className="form-label">{i.titleLabel} *</label><input className="form-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{i.descriptionLabel}</label><textarea className="form-input" rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} style={{ resize: 'vertical' }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label className="form-label">{i.priorityLabel}</label><select className="form-input" value={fPriority} onChange={(e) => setFPriority(e.target.value)}><option value="low">{i.priorityLow}</option><option value="medium">{i.priorityMedium}</option><option value="high">{i.priorityHigh}</option></select></div>
                  <div className="form-group"><label className="form-label">{i.status}</label><select className="form-input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="pending">{i.taskPending}</option><option value="completed">{i.taskCompleted}</option><option value="cancelled">{i.taskCancelled}</option></select></div>
                </div>
                <div className="form-group"><label className="form-label">{i.dueDateLabel}</label><input className="form-input" type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{i.contactLabel}</label><select className="form-input" value={fContactId} onChange={(e) => setFContactId(e.target.value)}><option value="">{i.noContactOption}</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Deal</label><select className="form-input" value={fDealId} onChange={(e) => setFDealId(e.target.value)}><option value="">{i.noDealOption}</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditTask(null)}>{i.cancel}</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? i.saving : i.save}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
