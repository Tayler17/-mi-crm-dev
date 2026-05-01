'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAppointments, createAppointment, updateAppointment, deleteAppointment,
  getContacts, getAppointmentStats, getInboxes,
  Appointment, Contact, Inbox,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#dbeafe', color: '#1d4ed8' },
  sent:      { bg: '#dcfce7', color: '#15803d' },
  cancelled: { bg: '#fee2e2', color: '#b91c1c' },
};

const VARS = ['{Nombre}', '{Primer Nombre}', '{Teléfono}', '{Email}', '{Fecha}', '{Hora}'];

// Convert a UTC ISO string to a local datetime-local input value (YYYY-MM-DDTHH:MM)
function toLocalDatetimeInput(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusBadge({ status }: { status: string }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const c = STATUS_COLORS[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
  const labels: Record<string, string> = {
    pending: i.apptPending,
    sent: i.apptSent,
    cancelled: i.apptCancelled,
  };
  return <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>{labels[status] ?? status}</span>;
}

// ── Appointment Modal ──────────────────────────────────────────────────────────

function AppointmentModal({
  appointment, contacts, inboxes, onSave, onClose,
}: {
  appointment: Appointment | null;
  contacts: Contact[];
  inboxes: Inbox[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [contactSearch, setContactSearch] = useState('');
  const [form, setForm] = useState({
    contactId: appointment?.contactId ?? '',
    title: appointment?.title ?? '',
    message: appointment?.message ?? '',
    scheduledAt: appointment?.scheduledAt ? toLocalDatetimeInput(appointment.scheduledAt) : '',
    inboxId: appointment?.inboxId ?? '',
    timezone: appointment?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: appointment?.status ?? 'pending',
    openTicket: appointment?.openTicket ?? false,
    ticketStatus: appointment?.ticketStatus ?? 'closed',
    notes: appointment?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function insertVar(v: string) {
    setForm((f) => ({ ...f, message: f.message + v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scheduledAt) { setError(i.apptErrDate); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : form.scheduledAt,
      };
      await onSave(payload); onClose();
    }
    catch (err: any) { setError(err.message || i.apptErrSave); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{appointment ? i.apptEditTitle : i.apptNewTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
          {/* Contact */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Contacto</label>
            <input
              className="form-input"
              placeholder="Buscar por nombre, email o teléfono…"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            <select
              className="form-input"
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
              size={5}
              style={{ height: 'auto' }}
            >
              <option value="">— Seleccionar contacto —</option>
              {contacts
                .filter((c) => {
                  if (!contactSearch) return true;
                  const q = contactSearch.toLowerCase();
                  return (c.fullName || '').toLowerCase().includes(q)
                    || (c.email || '').toLowerCase().includes(q)
                    || (c.phone || '').toLowerCase().includes(q);
                })
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName || c.email || c.phone}</option>
                ))}
            </select>
            {form.contactId && (
              <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4 }}>
                ✓ {contacts.find((c) => c.id === form.contactId)?.fullName || contacts.find((c) => c.id === form.contactId)?.email}
              </div>
            )}
          </div>

          {/* Inbox / channel */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Canal de envío</label>
            <select className="form-input" value={form.inboxId} onChange={(e) => setForm({ ...form, inboxId: e.target.value })}>
              <option value="">— Solo registrar (sin envío) —</option>
              {inboxes.map((inb) => (
                <option key={inb.id} value={inb.id}>{inb.name} ({inb.channelType})</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mensaje</label>
            <textarea className="form-input" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Escribe el mensaje a enviar…" style={{ resize: 'vertical' }} />
            {/* Variables */}
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Variables disponibles:</span>
              {VARS.map((v) => (
                <button key={v} type="button" onClick={() => insertVar(v)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: '1px solid var(--primary)', background: 'transparent', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Date + timezone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fecha y Hora *</label>
              <input type="datetime-local" className="form-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Timezone: {form.timezone}</div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Status del Ticket</label>
              <select className="form-input" value={form.ticketStatus} onChange={(e) => setForm({ ...form, ticketStatus: e.target.value })}>
                <option value="closed">Fechado</option>
                <option value="open">Abierto</option>
                <option value="pending">Pendiente</option>
              </select>
            </div>
          </div>

          {/* Status + Open ticket */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Estado</label>
              <select className="form-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'pending' | 'sent' | 'cancelled' })}>
                <option value="pending">Pendiente</option>
                <option value="sent">Enviado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Abrir Ticket</label>
              <select className="form-input" value={form.openTicket ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, openTicket: e.target.value === 'yes' })}>
                <option value="no">Deshabilitado</option>
                <option value="yes">Habilitado</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Notes (internas)</label>
              <input className="form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Nota interna…" />
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

// ── Calendar ──────────────────────────────────────────────────────────────────

function CalendarMonth({
  year, month, appointments, onDayClick, onAppointmentClick,
}: {
  year: number; month: number;
  appointments: Appointment[];
  onDayClick: (date: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Generate locale-aware day headers (Sun=0 … Sat=6, Jan 1 2023 was Sunday)
  const daysShort = Array.from({ length: 7 }, (_, idx) =>
    new Date(2023, 0, idx + 1).toLocaleDateString(i.locale, { weekday: 'short' }),
  );

  const apptByDay: Record<number, Appointment[]> = {};
  appointments.forEach((a) => {
    const d = new Date(a.scheduledAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!apptByDay[day]) apptByDay[day] = [];
      apptByDay[day].push(a);
    }
  });

  const cells: (number | null)[] = [];
  for (let idx = 0; idx < firstDay; idx++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: 4 }}>
        {daysShort.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
        {cells.map((day, cellIdx) => {
          const isToday = day !== null && today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          const appts = day ? (apptByDay[day] ?? []) : [];
          return (
            <div
              key={cellIdx}
              onClick={() => day && onDayClick(new Date(year, month, day))}
              style={{
                minHeight: 80, padding: 4, borderRadius: 4,
                background: day ? (isToday ? '#ede9fe' : 'var(--bg-secondary)') : 'transparent',
                cursor: day ? 'pointer' : 'default',
                border: isToday ? '1px solid var(--primary)' : '1px solid var(--border)',
              }}
            >
              {day && (
                <>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--primary)' : 'var(--text)', marginBottom: 2 }}>{day}</div>
                  {appts.slice(0, 3).map((a) => (
                    <div key={a.id} onClick={(e) => { e.stopPropagation(); onAppointmentClick(a); }}
                      style={{ fontSize: 10, padding: '2px 4px', borderRadius: 3, marginBottom: 1, background: STATUS_COLORS[a.status]?.bg || '#f3f4f6', color: STATUS_COLORS[a.status]?.color || '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 600 }}>
                      {new Date(a.scheduledAt).toLocaleTimeString(i.locale, { hour: '2-digit', minute: '2-digit' })} {a.contact_name || a.title || i.apptDefaultName}
                    </div>
                  ))}
                  {appts.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{appts.length - 3} {i.apptMore}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ appointments, onEdit, onDelete }: { appointments: Appointment[]; onEdit: (a: Appointment) => void; onDelete: (a: Appointment) => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const sorted = [...appointments].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40, fontSize: 14 }}>{i.apptNone}</div>
      ) : sorted.map((a) => (
        <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px' }}>
          <div style={{ minWidth: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>{new Date(a.scheduledAt).getDate()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(a.scheduledAt).toLocaleDateString(i.locale, { month: 'short' })}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{new Date(a.scheduledAt).toLocaleTimeString(i.locale, { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{a.contact_name || '—'}</div>
            {a.contact_phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📞 {a.contact_phone}</div>}
            {a.message && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{a.message}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusBadge status={a.status} />
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => onEdit(a)}>{i.edit}</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger)' }} onClick={() => onDelete(a)}>{i.delete}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'list';

export default function AppointmentsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appts, cts, st, inbs] = await Promise.all([getAppointments(), getContacts(), getAppointmentStats(), getInboxes().catch(() => [])]);
      setAppointments(appts); setContacts(cts); setStats(st); setInboxes(inbs);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: any) {
    if (editing) await updateAppointment(editing.id, form);
    else await createAppointment(form);
    await load();
  }

  async function handleDelete(a: Appointment) {
    if (!confirm(`${i.apptDeleteOf} ${a.contact_name || i.apptContactFallback}?`)) return;
    await deleteAppointment(a.id);
    setAppointments((p) => p.filter((x) => x.id !== a.id));
  }

  function openCreate(date?: Date) {
    setEditing(null);
    if (date) {
      // pre-fill date — handled via default in modal
    }
    setShowModal(true);
  }

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }
  function goToday() { setCurrentDate(new Date()); }

  const monthName = new Date(year, month, 1).toLocaleDateString(i.locale, { month: 'long' });

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.apptTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.apptSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => openCreate()}>{i.apptNew}</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: i.total,            val: stats.total,     color: '#6366f1' },
          { label: i.apptStatPending,  val: stats.pending,   color: '#3b82f6' },
          { label: i.apptStatSent,     val: stats.sent,      color: '#10b981' },
          { label: i.apptStatCancelled,val: stats.cancelled, color: '#ef4444' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Calendar toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={prevMonth}>‹</button>
          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontWeight: 700, fontSize: 15 }} onClick={goToday}>
            {monthName} {year}
          </button>
          <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={nextMonth}>›</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={goToday}>{i.today}</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ key: 'month', label: i.apptViewMonth }, { key: 'list', label: i.apptViewList }].map((v) => (
            <button key={v.key} onClick={() => setView(v.key as ViewMode)}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid var(--border)', background: view === v.key ? 'var(--primary)' : 'var(--bg)', color: view === v.key ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
      ) : view === 'month' ? (
        <CalendarMonth
          year={year} month={month}
          appointments={appointments}
          onDayClick={openCreate}
          onAppointmentClick={(a) => { setEditing(a); setShowModal(true); }}
        />
      ) : (
        <ListView
          appointments={appointments}
          onEdit={(a) => { setEditing(a); setShowModal(true); }}
          onDelete={handleDelete}
        />
      )}

      {showModal && (
        <AppointmentModal
          appointment={editing}
          contacts={contacts}
          inboxes={inboxes}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
