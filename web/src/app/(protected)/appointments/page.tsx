'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAppointments, createAppointment, updateAppointment, deleteAppointment,
  getContacts, getAppointmentStats,
  Appointment, Contact,
} from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pendiente',  bg: '#dbeafe', color: '#1d4ed8' },
  sent:      { label: 'Enviado',    bg: '#dcfce7', color: '#15803d' },
  cancelled: { label: 'Cancelado',  bg: '#fee2e2', color: '#b91c1c' },
};

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const VARS = ['{Nombre}', '{Primer Nombre}', '{Teléfono}', '{Email}', '{Fecha}', '{Hora}'];

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>{c.label}</span>;
}

// ── Appointment Modal ──────────────────────────────────────────────────────────

function AppointmentModal({
  appointment, contacts, onSave, onClose,
}: {
  appointment: Appointment | null;
  contacts: Contact[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    contactId: appointment?.contactId ?? '',
    title: appointment?.title ?? '',
    message: appointment?.message ?? '',
    scheduledAt: appointment?.scheduledAt ? appointment.scheduledAt.substring(0, 16) : '',
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
    if (!form.scheduledAt) { setError('La fecha es requerida'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{appointment ? 'Editar Agendamiento' : 'Nuevo Agendamiento'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
          {/* Contact */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Contacto</label>
            <select className="form-input" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
              <option value="">— Seleccionar contacto —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName || c.email || c.phone}</option>
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
              <select className="form-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
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
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Agregar'}</button>
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
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

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
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: 4 }}>
        {DAYS_SHORT.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
        {cells.map((day, i) => {
          const isToday = day !== null && today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          const appts = day ? (apptByDay[day] ?? []) : [];
          return (
            <div
              key={i}
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
                      style={{ fontSize: 10, padding: '2px 4px', borderRadius: 3, marginBottom: 1, background: STATUS_CFG[a.status]?.bg || '#f3f4f6', color: STATUS_CFG[a.status]?.color || '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 600 }}>
                      {new Date(a.scheduledAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} {a.contact_name || a.title || 'Agendamiento'}
                    </div>
                  ))}
                  {appts.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{appts.length - 3} más</div>}
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
  const sorted = [...appointments].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40, fontSize: 14 }}>No hay agendamientos</div>
      ) : sorted.map((a) => (
        <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px' }}>
          <div style={{ minWidth: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>{new Date(a.scheduledAt).getDate()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(MONTHS[new Date(a.scheduledAt).getMonth()] ?? '').slice(0, 3)}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{new Date(a.scheduledAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{a.contact_name || '—'}</div>
            {a.contact_phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📞 {a.contact_phone}</div>}
            {a.message && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{a.message}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusBadge status={a.status} />
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => onEdit(a)}>Editar</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger)' }} onClick={() => onDelete(a)}>Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'list';

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
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
      const [appts, cts, st] = await Promise.all([getAppointments(), getContacts(), getAppointmentStats()]);
      setAppointments(appts); setContacts(cts); setStats(st);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: any) {
    if (editing) await updateAppointment(editing.id, form);
    else await createAppointment(form);
    await load();
  }

  async function handleDelete(a: Appointment) {
    if (!confirm(`¿Eliminar agendamiento de ${a.contact_name || 'este contacto'}?`)) return;
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

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Agendamientos</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Mensajes programados para contactos</p>
        </div>
        <button className="btn btn-primary" onClick={() => openCreate()}>+ Nuevo Agendamiento</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', val: stats.total, color: '#6366f1' },
          { label: 'Pendientes', val: stats.pending, color: '#3b82f6' },
          { label: 'Enviados', val: stats.sent, color: '#10b981' },
          { label: 'Cancelados', val: stats.cancelled, color: '#ef4444' },
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
            {MONTHS[month]} {year}
          </button>
          <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={nextMonth}>›</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={goToday}>Hoy</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ key: 'month', label: 'Mes' }, { key: 'list', label: 'Agenda' }].map((v) => (
            <button key={v.key} onClick={() => setView(v.key as ViewMode)}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid var(--border)', background: view === v.key ? 'var(--primary)' : 'var(--bg)', color: view === v.key ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Cargando…</div>
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
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
