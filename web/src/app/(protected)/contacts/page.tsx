'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  getContacts, createContact, deleteContact, importContactsCsv, addContactTag, getTags,
  getContactDuplicates, mergeContacts,
  type Contact, type CsvImportResult, type Tag,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── csv helpers ───────────────────────────────────────────────────────────────

function parseCsvClient(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols: string[] = [];
    let cur = '', inQuote = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') { if (inQuote && line[ci + 1] === '"') { cur += '"'; ci++; } else inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function guessField(header: string): string {
  const h = header.toLowerCase().trim();
  if (['full_name','nombre','nombre completo','name','fullname'].includes(h)) return 'full_name';
  if (['email','correo','e-mail'].includes(h)) return 'email';
  if (['phone','telefono','teléfono','mobile','celular','tel'].includes(h)) return 'phone';
  if (['job_title','cargo','puesto','jobtitle','title','rol'].includes(h)) return 'job_title';
  if (['location','ciudad','city','ubicacion','país','pais','country'].includes(h)) return 'location';
  if (['notes','notas','comentarios','note'].includes(h)) return 'notes';
  if (['company','empresa','company_name'].includes(h)) return 'company';
  return '';
}

function buildRemappedCsv(rows: string[][], mapping: string[]): File {
  const header = mapping.filter(Boolean).join(',');
  const dataRows = rows.map((row) =>
    mapping.map((field, fi) => field ? `"${(row[fi] ?? '').replace(/"/g, '""')}"` : null)
      .filter((v) => v !== null)
      .join(',')
  );
  const csv  = [header, ...dataRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  return new File([blob], 'contacts.csv', { type: 'text/csv' });
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const CONTACT_FIELDS = [
    { value: '',          label: i.csvIgnoreColumn },
    { value: 'full_name', label: i.fullName },
    { value: 'email',     label: i.email },
    { value: 'phone',     label: i.phone },
    { value: 'job_title', label: i.jobTitle },
    { value: 'location',  label: i.location },
    { value: 'notes',     label: i.notes },
    { value: 'company',   label: i.companies.replace(/s$/, '') }, // singular: "Empresa" from "Empresas"
  ];

  function exportCsv(contacts: Contact[]) {
    const header = 'full_name,email,phone,job_title,location,created_at';
    const rows = contacts.map((c) => [
      c.fullName, c.email || '', c.phone?.startsWith('lid:') ? '' : (c.phone || ''),
      c.jobTitle || '', c.location || '', new Date(c.createdAt).toLocaleDateString(i.locale),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [tags, setTags]         = useState<Tag[]>([]);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk tag modal
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [bulkTagId, setBulkTagId]     = useState('');
  const [tagging, setTagging]         = useState(false);

  // Create modal
  const [showCreate, setShowCreate]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');
  const [fullName, setFullName]       = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [jobTitle, setJobTitle]       = useState('');

  // CSV import — step 1: mapping
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows]           = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([]);
  const [mapping, setMapping]           = useState<string[]>([]);
  const [showMapping, setShowMapping]   = useState(false);
  // CSV import — step 2: result
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  // vCard import (contacts from phone)
  const vcfInputRef = useRef<HTMLInputElement>(null);
  const [vcfImporting, setVcfImporting] = useState(false);
  const [vcfResult, setVcfResult]       = useState<{ created: number; updated: number; skipped: number; total: number } | null>(null);

  async function handleVcfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setVcfImporting(true);
    try {
      const text = await file.text();

      // ── Parse all vCards client-side ────────────────────────────────────
      const cards = text.split(/(?=BEGIN:VCARD)/i).map((s) => s.trim()).filter(Boolean);
      const csvRows: string[] = ['full_name,phone,email'];
      let skippedParse = 0;

      for (const card of cards) {
        try {
          // Unfold multi-line vCard values (RFC 6350: CRLF + whitespace = continuation)
          const unfolded = card.replace(/\r?\n[ \t]/g, '');

          const get = (key: string): string => {
            // Match KEY or KEY;param=value: content
            const re = new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, 'im');
            return unfolded.match(re)?.[1]?.trim() ?? '';
          };
          // Some vCards have multiple TEL/EMAIL lines — grab first non-empty
          const getFirst = (key: string): string => {
            const re = new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, 'igm');
            let m: RegExpExecArray | null;
            while ((m = re.exec(unfolded)) !== null) {
              const v = m[1].trim();
              if (v) return v;
            }
            return '';
          };

          // Build full name: prefer FN, fall back to N (Last;First;Middle;Prefix;Suffix)
          let fullName = get('FN');
          if (!fullName) {
            const n = get('N');
            // N format: Last;First;Middle;Prefix;Suffix
            fullName = n.split(';').map(p => p.trim()).filter(Boolean).reverse().join(' ');
          }
          // Clean encoding artifacts (QUOTED-PRINTABLE names sometimes have =XX)
          fullName = fullName.replace(/=[0-9A-Fa-f]{2}/g, '').replace(/;/g, ' ').trim();

          const phone = getFirst('TEL').replace(/[^+\d]/g, '');
          const email = getFirst('EMAIL').replace(/[^a-zA-Z0-9@._+\-]/g, '');

          if (!fullName && !phone) { skippedParse++; continue; }

          const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
          csvRows.push([esc(fullName || phone), esc(phone), esc(email)].join(','));
        } catch { skippedParse++; }
      }

      if (csvRows.length <= 1) {
        setVcfResult({ created: 0, updated: 0, skipped: skippedParse, total: cards.length });
        return;
      }

      // ── Send as a single CSV to the bulk import endpoint ────────────────
      const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const csvFile = new File([csvBlob], 'contacts.csv', { type: 'text/csv' });
      const result = await importContactsCsv(csvFile);
      setVcfResult({
        created: result.created,
        updated: result.updated,
        skipped: result.skipped + skippedParse,
        total: cards.length,
      });
      load();
    } catch {
      alert('Error al leer el archivo vCard');
    } finally {
      setVcfImporting(false);
    }
  }

  // Duplicates
  type DupGroup = { ids: string[]; names: string[]; email: string; phone: string; count: number };
  const [showDups, setShowDups]       = useState(false);
  const [dups, setDups]               = useState<DupGroup[]>([]);
  const [loadingDups, setLoadingDups] = useState(false);
  const [mergingId, setMergingId]     = useState<string | null>(null);

  async function loadDups() {
    setLoadingDups(true);
    try { setDups(await getContactDuplicates()); } catch { /* ignore */ }
    finally { setLoadingDups(false); }
  }

  async function handleMerge(keepId: string, mergeId: string) {
    setMergingId(mergeId);
    try {
      await mergeContacts(keepId, mergeId);
      await loadDups();
      load();
    } catch { alert('Error'); }
    finally { setMergingId(null); }
  }

  function load() {
    setLoading(true);
    setSelected(new Set());
    getContacts().then(setContacts).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getTags().then(setTags).catch(() => {});
  }, []);

  function openCreate() {
    setFullName(''); setEmail(''); setPhone(''); setJobTitle(''); setCreateError('');
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setCreateError(i.nameRequired); return; }
    setCreating(true); setCreateError('');
    try {
      await createContact({ fullName: fullName.trim(), email: email || undefined, phone: phone || undefined, jobTitle: jobTitle || undefined });
      setShowCreate(false); load();
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(`${i.delete} "${c.fullName}"?`)) return;
    try { await deleteContact(c.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  // ─── bulk operations ───────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`${i.delete} ${selected.size} ${i.contacts.toLowerCase()}?`)) return;
    const ids = [...selected];
    await Promise.all(ids.map((id) => deleteContact(id).catch(() => {})));
    load();
  }

  async function handleBulkTag(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkTagId) return;
    setTagging(true);
    const ids = [...selected];
    await Promise.all(ids.map((id) => addContactTag(id, bulkTagId).catch(() => {})));
    setTagging(false);
    setShowBulkTag(false);
    setBulkTagId('');
  }

  // ─── CSV import ────────────────────────────────────────────────────────────

  function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (csvInputRef.current) csvInputRef.current.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsvClient(text);
      if (rows.length < 1) { alert(i.noData); return; }
      const first = rows[0];
      const looksLikeHeader = first.some((h) => /[a-z_]/i.test(h) && !/^\d/.test(h));
      const headers = looksLikeHeader ? first : first.map((_, ci) => `${i.csvColumn} ${ci + 1}`);
      const dataRows = looksLikeHeader ? rows.slice(1) : rows;
      setCsvHeaders(headers);
      setCsvRows(dataRows);
      setMapping(headers.map((h) => guessField(h)));
      setShowMapping(true);
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleConfirmImport() {
    if (!mapping.some(Boolean)) { alert(i.noData); return; }
    setShowMapping(false);
    setImporting(true);
    try {
      const file = buildRemappedCsv(csvRows, mapping);
      const result = await importContactsCsv(file);
      setImportResult(result);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : i.error);
    } finally { setImporting(false); }
  }

  // ─── filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      c.fullName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.jobTitle?.toLowerCase().includes(q) ||
      c.location?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const allSelected  = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{i.contacts}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
            <input
              className="form-input"
              style={{ paddingLeft: 32, width: 220 }}
              placeholder={`${i.name}, ${i.email}, ${i.phone}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            className="btn btn-secondary"
            title={i.exportCSV}
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
          >
            📤 {i.exportCSV}
          </button>

          <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCsvChange} />
          <button className="btn btn-secondary" disabled={importing} onClick={() => csvInputRef.current?.click()}>
            {importing ? `⏳ ${i.loading}` : `📥 ${i.importCSV}`}
          </button>

          <input ref={vcfInputRef} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard" style={{ display: 'none' }} onChange={handleVcfChange} />
          <button className="btn btn-secondary" disabled={vcfImporting} title="Importa contactos desde tu teléfono exportándolos como archivo .vcf (vCard)" onClick={() => vcfInputRef.current?.click()}>
            {vcfImporting ? `⏳ ${i.loading}` : '📱 Importar vCard'}
          </button>

          <button className="btn btn-secondary" onClick={() => { setShowDups(true); loadDups(); }}>
            🔍 {i.duplicates}
          </button>

          <button className="btn btn-primary" onClick={openCreate}>+ {i.newContact}</button>
        </div>
      </div>

      {/* ── Duplicates modal ──────────────────────────────────────────────────── */}
      {showDups && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowDups(false); }}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">{i.duplicates}</h3>
              <button className="modal-close" onClick={() => setShowDups(false)}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingDups ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>{i.loading}</div>
              ) : dups.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  {i.noDuplicatesFound}
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {dups.length} {i.duplicates.toLowerCase()} — {i.dupMergeHint}
                  </p>
                  {dups.map((g, gi) => (
                    <div key={gi} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {g.email && <span>📧 {g.email}</span>}
                          {g.email && g.phone && <span style={{ margin: '0 6px' }}>·</span>}
                          {g.phone && <span>📞 {g.phone}</span>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{g.count}</span>
                      </div>
                      {g.ids.map((id, idx) => (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: idx < g.ids.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ fontSize: 12, flex: 1 }}>
                            {idx === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', background: '#dcfce7', padding: '1px 5px', borderRadius: 99, marginRight: 6 }}>{i.keepBadge}</span>}
                            {g.names[idx] || `(${i.noContact})`}
                          </span>
                          {idx > 0 && (
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '3px 10px', color: '#ef4444', borderColor: '#fca5a5' }}
                              disabled={mergingId === id}
                              onClick={() => handleMerge(g.ids[0], id)}
                            >
                              {mergingId === id ? '…' : `🗑 ${i.merge}`}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDups(false)}>{i.close}</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        {/* Bulk action bar */}
        {someSelected && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 10, marginBottom: 12,
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#4c1d95' }}>
              {selected.size} {i.selectedItems}
            </span>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => { setBulkTagId(''); setShowBulkTag(true); }}
            >
              🏷 {i.tagLabel}
            </button>
            <button
              className="btn btn-danger"
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={handleBulkDelete}
            >
              🗑 {i.deleteSelection}
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 12px', marginLeft: 'auto' }}
              onClick={() => setSelected(new Set())}
            >
              ✕ {i.cancel}
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading">{i.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            <p>{search ? i.noResults : i.noContacts}</p>
            {!search && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={openCreate}>{i.createFirstContact}</button>
                <button className="btn btn-secondary" onClick={() => csvInputRef.current?.click()}>📥 {i.importCSV}</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
              {filtered.length} {i.contacts.toLowerCase()}
              {search && ` · ${i.filteredOf} ${contacts.length}`}
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          style={{ cursor: 'pointer' }}
                          title={i.selectAll}
                        />
                      </th>
                      <th>{i.name}</th>
                      <th>{i.email}</th>
                      <th>{i.phone}</th>
                      <th>{i.jobTitle}</th>
                      <th>{i.createdAt}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} style={{ background: selected.has(c.id) ? '#f5f3ff' : undefined }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td>
                          <Link href={`/contacts/${c.id}`} style={{ fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}>
                            {c.fullName}
                          </Link>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {c.phone
                            ? c.phone.startsWith('lid:')
                              ? <span title={`WhatsApp ID: ${c.phone.replace('lid:', '')}`} style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>📱 WA</span>
                              : c.phone
                            : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{c.jobTitle || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleDateString(i.locale)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Link href={`/contacts/${c.id}`} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>{i.viewBtn}</Link>
                            <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(c)}>{i.delete}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">{i.newContact}</h2><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group"><label className="form-label">{i.fullName} *</label><input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus /></div>
                <div className="form-group"><label className="form-label">{i.email}</label><input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{i.phone}</label><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{i.jobTitle}</label><input className="form-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? i.creating : i.newContact}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk tag modal */}
      {showBulkTag && (
        <div className="modal-overlay" onClick={() => setShowBulkTag(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">🏷 {i.applyTag}</h2><button className="modal-close" onClick={() => setShowBulkTag(false)}>×</button></div>
            <form onSubmit={handleBulkTag}>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {selected.size} {i.contacts.toLowerCase()} {i.selectedItems}
                </p>
                <div className="form-group">
                  <label className="form-label">{i.tagLabel}</label>
                  <select className="form-input" value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)} required>
                    <option value="">— {i.tagLabel} —</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkTag(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={tagging || !bulkTagId}>{tagging ? i.applying : i.applyTag}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV column mapping modal */}
      {showMapping && (
        <div className="modal-overlay" onClick={() => setShowMapping(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📥 {i.importCSV}</h2>
              <button className="modal-close" onClick={() => setShowMapping(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                <strong>{csvHeaders.length}</strong> {i.csvColumn.toLowerCase()}s · <strong>{csvRows.length}</strong> {i.contacts.toLowerCase()}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {csvHeaders.map((header, ci) => {
                  const preview = csvRows.slice(0, 3).map((r) => r[ci] ?? '').filter(Boolean).join(' · ');
                  return (
                    <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center', padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{header}</div>
                        {preview && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ej: {preview}</div>}
                      </div>
                      <select
                        className="form-input"
                        style={{ margin: 0, fontSize: 13 }}
                        value={mapping[ci] ?? ''}
                        onChange={(e) => setMapping((prev) => { const n = [...prev]; n[ci] = e.target.value; return n; })}
                      >
                        {CONTACT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>

              {csvRows.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{i.csvColPreview}</div>
                  <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>{mapping.map((field, fi) => field ? (
                          <th key={fi} style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid var(--border)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {CONTACT_FIELDS.find((f) => f.value === field)?.label ?? field}
                          </th>
                        ) : null)}</tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 3).map((row, ri) => (
                          <tr key={ri}>{mapping.map((field, fi) => field ? (
                            <td key={fi} style={{ padding: '5px 10px', borderBottom: ri < 2 ? '1px solid var(--border)' : undefined, color: 'var(--text-muted)' }}>
                              {row[fi] ?? ''}
                            </td>
                          ) : null)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowMapping(false)}>{i.cancel}</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!mapping.some(Boolean)}
                onClick={handleConfirmImport}
              >
                {i.importCSV} {csvRows.length} →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV import result modal */}
      {importResult && (
        <div className="modal-overlay" onClick={() => setImportResult(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">{i.csvImportDone}</h2><button className="modal-close" onClick={() => setImportResult(null)}>×</button></div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: i.csvCreated,  value: importResult.created,  bg: '#d1fae5', color: '#065f46' },
                  { label: i.csvUpdated,  value: importResult.updated,  bg: '#dbeafe', color: '#1e40af' },
                  { label: i.csvErrLabel, value: importResult.skipped,  bg: importResult.skipped > 0 ? '#fee2e2' : '#f3f4f6', color: importResult.skipped > 0 ? '#991b1b' : '#6b7280' },
                ].map((s) => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: s.bg }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: s.color, fontWeight: 500 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {i.total}: <strong>{importResult.total}</strong>
              </div>
              {importResult.errors.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#991b1b' }}>{i.rowsWithErrors}</div>
                  <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {importResult.errors.map((e, idx) => (
                      <div key={idx} style={{ padding: '6px 10px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#7f1d1d', display: 'flex', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{i.csvColumn} {e.row}:</span><span>{e.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <strong>Columns:</strong> full_name, email, phone, job_title, location, notes, company
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-primary" onClick={() => setImportResult(null)}>{i.close}</button></div>
          </div>
        </div>
      )}

      {/* vCard import result modal */}
      {vcfResult && (
        <div className="modal-overlay" onClick={() => setVcfResult(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📱 Importar vCard — Resultado</h2>
              <button className="modal-close" onClick={() => setVcfResult(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Creados',  value: vcfResult.created, bg: '#d1fae5', color: '#065f46' },
                  { label: 'Actualizados', value: vcfResult.updated, bg: '#dbeafe', color: '#1e40af' },
                  { label: 'Omitidos', value: vcfResult.skipped, bg: vcfResult.skipped > 0 ? '#fee2e2' : '#f3f4f6', color: vcfResult.skipped > 0 ? '#991b1b' : '#6b7280' },
                ].map((s) => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '14px 6px', borderRadius: 8, background: s.bg }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: s.color, fontWeight: 500 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                Total en archivo: <strong>{vcfResult.total}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
                💡 Exporta los contactos de tu teléfono como archivo <strong>.vcf</strong> (vCard) desde la app de Contactos y luego impórtalos aquí.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setVcfResult(null)}>{i.close}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
