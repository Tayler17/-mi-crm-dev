'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getCompanies, createCompany, updateCompany, deleteCompany,
  getCompanyContacts, getCompanyDeals,
  type Company,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function currency(v: string | number) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v) || 0);
}

const INDUSTRIES = [
  'Tecnología', 'Salud', 'Educación', 'Finanzas', 'Retail',
  'Manufactura', 'Servicios', 'Inmobiliaria', 'Marketing', 'Logística', 'Otro',
];

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ── Company Modal ─────────────────────────────────────────────────────────────

interface CompanyModalProps {
  company?: Company | null;
  onClose: () => void;
  onSaved: () => void;
}

function CompanyModal({ company, onClose, onSaved }: CompanyModalProps) {
  const [form, setForm] = useState({
    name: company?.name ?? '',
    industry: company?.industry ?? '',
    website: company?.website ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (company) await updateCompany(company.id, form);
      else await createCompany(form);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">{company ? 'Editar empresa' : 'Nueva empresa'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Acme Corp" autoFocus />
          </div>
          <div>
            <label className="form-label">Industria</label>
            <select className="form-input" value={form.industry} onChange={(e) => set('industry', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Sitio web</label>
            <input className="form-input" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://empresa.com" type="url" />
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? 'Guardando...' : company ? 'Guardar cambios' : 'Crear empresa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Company Detail Drawer ─────────────────────────────────────────────────────

function CompanyDetail({ company, onClose, onEdit }: { company: Company; onClose: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState<'contacts' | 'deals'>('contacts');
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCompanyContacts(company.id).catch(() => []),
      getCompanyDeals(company.id).catch(() => []),
    ]).then(([c, d]) => { setContacts(c); setDeals(d); }).finally(() => setLoading(false));
  }, [company.id]);

  const STATUS_COLOR: Record<string, string> = { won: '#22c55e', lost: '#ef4444', active: '#3b82f6' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 460,
          background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: 'var(--primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, flexShrink: 0,
              }}>
                {initials(company.name)}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{company.name}</h2>
                {company.industry && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>🏭 {company.industry}</div>}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', marginTop: 2, display: 'block' }}>
                    🌐 {company.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>Editar</button>
              <button className="modal-close" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 16 }}>
            {[
              { label: 'Contactos', value: company.contact_count ?? 0, color: '#6366f1' },
              { label: 'Deals', value: company.deal_count ?? 0, color: '#3b82f6' },
              { label: 'Pipeline', value: currency(company.pipeline_value ?? 0), color: '#22c55e' },
            ].map((s) => (
              <div key={s.label} style={{ background: 'var(--bg-card)', padding: '12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['contacts', 'deals'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
                color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              {t === 'contacts' ? `Contactos (${contacts.length})` : `Deals (${deals.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 24px', flex: 1 }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</div>}

          {!loading && tab === 'contacts' && (
            contacts.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin contactos asociados.</div>
              : contacts.map((c) => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: '#6366f122',
                    color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(c.full_name ?? '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.email || c.phone}</div>
                  </div>
                </div>
              ))
          )}

          {!loading && tab === 'deals' && (
            deals.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin deals asociados.</div>
              : deals.map((d) => (
                <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.pipeline_name} › {d.stage_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{currency(d.value)}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: (STATUS_COLOR[d.status] ?? '#64748b') + '22',
                      color: STATUS_COLOR[d.status] ?? '#64748b',
                    }}>{d.status}</span>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getCompanies().catch(() => []);
    setCompanies(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = companies.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(c: Company) {
    if (!confirm(`¿Eliminar "${c.name}"?`)) return;
    await deleteCompany(c.id);
    setSelected(null);
    load();
  }

  function onSaved() { setShowModal(false); load(); }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Empresas</h1>
          <p className="page-subtitle">Gestiona las empresas de tus contactos y deals</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Nueva empresa</button>
      </div>

      {/* Summary stats */}
      {!loading && companies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total empresas', value: companies.length, color: '#6366f1' },
            { label: 'Con contactos', value: companies.filter((c) => (c.contact_count ?? 0) > 0).length, color: '#3b82f6' },
            { label: 'Con deals', value: companies.filter((c) => (c.deal_count ?? 0) > 0).length, color: '#22c55e' },
            { label: 'Pipeline total', value: currency(companies.reduce((s, c) => s + Number(c.pipeline_value ?? 0), 0)), color: '#f59e0b' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar empresa o industria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Cargando empresas...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{search ? 'Sin resultados' : 'No hay empresas aún'}</div>
          {!search && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setEditing(null); setShowModal(true); }}>+ Crear primera empresa</button>}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                {['Empresa', 'Industria', 'Sitio web', 'Contactos', 'Deals', 'Pipeline', 'Acciones'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  onClick={() => setSelected(c)}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6,
                        background: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {initials(c.name)}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{c.industry || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.website
                      ? <a href={c.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, color: 'var(--primary)' }}>{c.website.replace(/^https?:\/\//, '').split('/')[0]}</a>
                      : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: (c.contact_count ?? 0) > 0 ? '#6366f1' : 'var(--text-muted)' }}>{c.contact_count ?? 0}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: (c.deal_count ?? 0) > 0 ? '#3b82f6' : 'var(--text-muted)' }}>{c.deal_count ?? 0}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: Number(c.pipeline_value ?? 0) > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                    {currency(c.pipeline_value ?? 0)}
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditing(c); setShowModal(true); }}>Editar</button>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDelete(c)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CompanyModal company={editing} onClose={() => setShowModal(false)} onSaved={onSaved} />
      )}
      {selected && !showModal && (
        <CompanyDetail
          company={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); setShowModal(true); }}
        />
      )}
    </div>
  );
}
