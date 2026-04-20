'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getContacts, createContact, deleteContact, type Contact } from '@/lib/api';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  function load() {
    setLoading(true);
    getContacts().then(setContacts).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setFullName(''); setEmail(''); setPhone(''); setJobTitle(''); setCreateError('');
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setCreateError('El nombre es obligatorio'); return; }
    setCreating(true); setCreateError('');
    try {
      await createContact({ fullName: fullName.trim(), email: email || undefined, phone: phone || undefined, jobTitle: jobTitle || undefined });
      setShowCreate(false);
      load();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(`¿Eliminar "${c.fullName}"?`)) return;
    try { await deleteContact(c.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  const filtered = contacts.filter((c) =>
    c.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Contactos</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="form-input" style={{ width: 200 }} placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={openCreate}>+ Nuevo contacto</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}
        {loading ? <div className="loading">Cargando…</div> : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            <p>{search ? 'Sin resultados.' : 'No hay contactos.'}</p>
            {!search && <button className="btn btn-primary" onClick={openCreate}>Crear primer contacto</button>}
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Cargo</th><th>Creado</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/contacts/${c.id}`} style={{ fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}>{c.fullName}</Link></td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.jobTitle || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleDateString('es-ES')}</td>
                      <td><div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/contacts/${c.id}`} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>Ver</Link>
                        <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(c)}>Eliminar</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nuevo contacto</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group"><label className="form-label">Nombre completo *</label><input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Teléfono</label><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Cargo</label><input className="form-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear contacto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
