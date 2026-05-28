'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getContactLists, createContactList, updateContactList, deleteContactList,
  getContactListContacts, searchContactListContacts, addContactListContacts,
  removeContactListContact, clearContactListContacts,
  getTags,
  ContactList, Tag,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── List Form Modal ────────────────────────────────────────────────────────────

function ListModal({ list, onSave, onClose }: {
  list: ContactList | null;
  onSave: (name: string, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [name, setName] = useState(list?.name ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(i.nameRequired); return; }
    setSaving(true); setError('');
    try { await onSave(name, description); onClose(); }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{list ? i.editList : i.newList}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.name} *</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.descOptional}</label>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
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

// ── List Detail Drawer ────────────────────────────────────────────────────────

function ListDetail({ list, onClose, onRefresh }: { list: ContactList; onClose: () => void; onRefresh: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [contacts, setContacts] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tab, setTab] = useState<'contacts' | 'add'>('contacts');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getContactListContacts(list.id).then(setContacts).finally(() => setLoading(false));
    getTags().then(setTags).catch(() => {});
  }, [list.id]);

  useEffect(() => {
    if (tab !== 'add') return;
    // Only query when the user has typed something or selected a tag filter
    if (!search && filterTagIds.length === 0) { setAvailable([]); return; }
    setSearching(true);
    searchContactListContacts(list.id, search || undefined, filterTagIds.length ? filterTagIds : undefined)
      .then(setAvailable).catch(() => {}).finally(() => setSearching(false));
  }, [tab, search, filterTagIds, list.id, contacts.length]);

  async function handleAdd() {
    if (!selected.size) return;
    setAdding(true);
    try {
      await addContactListContacts(list.id, Array.from(selected));
      setContacts(await getContactListContacts(list.id));
      setSelected(new Set()); setTab('contacts'); onRefresh();
    } finally { setAdding(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ width: 480, background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>📋 {list.name}</div>
            {list.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{list.description}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{contacts.length} {i.contactPlural}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {[{ key: 'contacts', label: `${i.contacts} (${contacts.length})` }, { key: 'add', label: i.addMemberTab }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent', color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'contacts' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{contacts.length} {i.contactsInList}</span>
                {contacts.length > 0 && (
                  <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={async () => { if (!confirm(`${i.clearAll}?`)) return; await clearContactListContacts(list.id); setContacts([]); onRefresh(); }}>
                    {i.clearAll}
                  </button>
                )}
              </div>
              {loading ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>{i.loading}</div>
                : contacts.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                    {i.noContacts}
                    <div style={{ marginTop: 10 }}><button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setTab('add')}>{i.addMemberTab}</button></div>
                  </div>
                ) : contacts.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}{c.phone && ` · ${c.phone}`}</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }} onClick={async () => { await removeContactListContact(list.id, c.id); setContacts((p) => p.filter((x) => x.id !== c.id)); onRefresh(); }}>✕</button>
                  </div>
                ))}
            </>
          )}

          {tab === 'add' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="form-input"
                placeholder={`${i.search}…`}
                value={searchInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchInput(v);
                  if (searchTimer.current) clearTimeout(searchTimer.current);
                  searchTimer.current = setTimeout(() => setSearch(v), 350);
                }}
              />
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>{i.tagLabel}:</span>
                  {tags.map((t) => (
                    <button key={t.id} onClick={() => setFilterTagIds((prev) => prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                      style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid', background: filterTagIds.includes(t.id) ? (t.color || 'var(--primary)') : 'transparent', color: filterTagIds.includes(t.id) ? '#fff' : 'var(--text-muted)', borderColor: filterTagIds.includes(t.id) ? (t.color || 'var(--primary)') : 'var(--border)' }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              {(search || filterTagIds.length > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>{searching ? i.searching : `${available.length} ${i.contactPlural}`}{selected.size > 0 && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · {selected.size} {i.selectedItems}</span>}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setSelected(selected.size === available.length && available.length > 0 ? new Set() : new Set(available.map((c) => c.id)))}>
                    {selected.size === available.length && available.length > 0 ? i.deselectAll : i.selectAll}
                  </button>
                </div>
              )}
              <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {!search && filterTagIds.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 16px' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                    Escribe un nombre, email o teléfono para buscar entre tus contactos, o filtra por etiqueta.
                  </div>
                ) : searching ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{i.searching}</div>
                ) : available.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{i.noContacts}</div>
                ) : available.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: selected.has(c.id) ? '#ede9fe' : 'var(--bg-secondary)', fontSize: 13 }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => { const s = new Set(selected); e.target.checked ? s.add(c.id) : s.delete(c.id); setSelected(s); }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{c.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}{c.phone && ` · ${c.phone}`}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={!selected.size || adding} onClick={handleAdd}>
                  {adding ? i.addingLabel : `${i.add} ${selected.size} ${selected.size === 1 ? i.contactSingular : i.contactPlural}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContactListsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContactList | null>(null);
  const [detail, setDetail] = useState<ContactList | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLists(await getContactLists()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(name: string, description: string) {
    if (editing) await updateContactList(editing.id, { name, description });
    else await createContactList({ name, description });
    await load();
  }

  async function handleDelete(list: ContactList) {
    if (!confirm(`${i.delete} "${list.name}"?`)) return;
    await deleteContactList(list.id);
    setLists((p) => p.filter((l) => l.id !== list.id));
  }

  async function refreshDetail() {
    const fresh = await getContactLists();
    setLists(fresh);
    if (detail) { const u = fresh.find((l) => l.id === detail.id); if (u) setDetail(u); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.contactListsTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.contactListsSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ {i.newList}</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
      ) : lists.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>📋</div>
          <div style={{ fontSize: 16 }}>{i.noListsYet}</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ {i.createFirstList}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {lists.map((l) => (
            <div key={l.id} className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onClick={() => setDetail(l)}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>📋</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{l.name}</span>
                </div>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{l.contactCount}</span>
              </div>
              {l.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{l.description}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                {l.contactCount} {l.contactCount !== 1 ? i.contactPlural : i.contactSingular}
                {' · '}{new Date(l.createdAt).toLocaleDateString(i.locale)}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditing(l); setShowModal(true); }}>{i.edit}</button>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(l)}>{i.delete}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <ListModal list={editing} onSave={handleSave} onClose={() => { setShowModal(false); setEditing(null); }} />}
      {detail && <ListDetail list={detail} onClose={() => setDetail(null)} onRefresh={refreshDetail} />}
    </div>
  );
}
