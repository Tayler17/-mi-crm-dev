'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  getDeals, createDeal, deleteDeal, getPipelines, getPipelineStages, getContacts,
  type Deal, type Pipeline, type PipelineStage, type Contact,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── component ────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const STATUS_LABELS: Record<string, string>   = { open: i.dealStatusOpen, won: i.dealStatusWon, lost: i.dealStatusLost };
  const PRIORITY_LABELS: Record<string, string> = { low: i.priorityLow, medium: i.priorityMedium, high: i.priorityHigh };

  // ─── data
  const [deals, setDeals]       = useState<Deal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, string>>({});

  // ─── filters
  const [search, setSearch]                 = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterPipeline, setFilterPipeline] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const [filterValueMin, setFilterValueMin] = useState('');
  const [filterValueMax, setFilterValueMax] = useState('');

  // ─── create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [formError, setFormError]   = useState('');
  const [title, setTitle]           = useState('');
  const [value, setValue]           = useState('');
  const [currency, setCurrency]     = useState('USD');
  const [priority, setPriority]     = useState('medium');
  const [contactId, setContactId]   = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId]       = useState('');
  const [formStages, setFormStages] = useState<PipelineStage[]>([]);

  // ─── load
  function load() {
    setLoading(true);
    getDeals().then(setDeals).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getContacts().then(setContacts).catch(() => {});
    getPipelines().then(async (ps) => {
      setPipelines(ps);
      const map: Record<string, string> = {};
      await Promise.all(ps.map(async (p) => {
        const stages = await getPipelineStages(p.id).catch(() => [] as PipelineStage[]);
        stages.forEach((s) => { map[s.id] = p.id; });
      }));
      setStageMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pipelineId) { setFormStages([]); setStageId(''); return; }
    getPipelineStages(pipelineId).then((s) => { setFormStages(s); setStageId(''); }).catch(() => {});
  }, [pipelineId]);

  // ─── filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const dateFrom = filterDateFrom ? new Date(filterDateFrom).getTime() : null;
    const dateTo   = filterDateTo   ? new Date(filterDateTo + 'T23:59:59').getTime() : null;
    const valMin   = filterValueMin !== '' ? Number(filterValueMin) : null;
    const valMax   = filterValueMax !== '' ? Number(filterValueMax) : null;
    return deals.filter((d) => {
      if (q && !d.title.toLowerCase().includes(q) && !d.contact?.fullName.toLowerCase().includes(q)) return false;
      if (filterStatus && d.status !== filterStatus) return false;
      if (filterPriority && d.priority !== filterPriority) return false;
      if (filterPipeline && stageMap[d.stageId] !== filterPipeline) return false;
      if (dateFrom !== null && new Date(d.createdAt).getTime() < dateFrom) return false;
      if (dateTo   !== null && new Date(d.createdAt).getTime() > dateTo)   return false;
      if (valMin !== null && Number(d.value) < valMin) return false;
      if (valMax !== null && Number(d.value) > valMax) return false;
      return true;
    });
  }, [deals, search, filterStatus, filterPriority, filterPipeline, stageMap, filterDateFrom, filterDateTo, filterValueMin, filterValueMax]);

  const total = filtered.reduce((s, d) => s + Number(d.value || 0), 0);

  const hasFilters = search || filterStatus || filterPriority || filterPipeline || filterDateFrom || filterDateTo || filterValueMin || filterValueMax;
  function clearFilters() {
    setSearch(''); setFilterStatus(''); setFilterPriority(''); setFilterPipeline('');
    setFilterDateFrom(''); setFilterDateTo(''); setFilterValueMin(''); setFilterValueMax('');
  }

  // ─── create
  function openCreate() {
    setTitle(''); setValue(''); setCurrency('USD'); setPriority('medium');
    setContactId(''); setPipelineId(''); setStageId(''); setFormError('');
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setFormError(i.titleRequired); return; }
    setCreating(true); setFormError('');
    try {
      const payload: Record<string, unknown> = { title: title.trim(), value: value ? Number(value) : 0, currency, priority };
      if (contactId) payload.contactId = contactId;
      if (stageId) payload.stageId = stageId;
      await createDeal(payload as Partial<Deal>);
      setShowCreate(false); load();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  async function handleDelete(d: Deal) {
    if (!confirm(`${i.delete} "${d.title}"?`)) return;
    try { await deleteDeal(d.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  // ─── render
  return (
    <>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">{i.deals}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {filtered.length}{filtered.length !== deals.length ? `/${deals.length}` : ''} {i.deals.toLowerCase()}
            {' · '}${total.toLocaleString(i.locale, { minimumFractionDigits: 2 })}
          </span>
          <button className="btn btn-primary" onClick={openCreate}>+ {i.newDeal}</button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        {/* Filter bar */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 16, padding: '12px 16px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
            <input
              className="form-input"
              style={{ paddingLeft: 32, margin: 0, height: 36, fontSize: 13 }}
              placeholder={`${i.search}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status */}
          <select
            className="form-input"
            style={{ flex: '0 1 150px', margin: 0, height: 36, fontSize: 13 }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">{i.allStatuses}</option>
            <option value="open">{i.dealStatusOpen}</option>
            <option value="won">{i.dealStatusWon}</option>
            <option value="lost">{i.dealStatusLost}</option>
          </select>

          {/* Priority */}
          <select
            className="form-input"
            style={{ flex: '0 1 150px', margin: 0, height: 36, fontSize: 13 }}
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="">{i.allPriorities}</option>
            <option value="low">{i.priorityLow}</option>
            <option value="medium">{i.priorityMedium}</option>
            <option value="high">{i.priorityHigh}</option>
          </select>

          {/* Pipeline */}
          <select
            className="form-input"
            style={{ flex: '0 1 160px', margin: 0, height: 36, fontSize: 13 }}
            value={filterPipeline}
            onChange={(e) => setFilterPipeline(e.target.value)}
          >
            <option value="">{i.allPipelines}</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Date from */}
          <input
            type="date"
            className="form-input"
            style={{ flex: '0 1 150px', margin: 0, height: 36, fontSize: 13 }}
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            title={i.dealDateFrom}
          />

          {/* Date to */}
          <input
            type="date"
            className="form-input"
            style={{ flex: '0 1 150px', margin: 0, height: 36, fontSize: 13 }}
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            title={i.dealDateTo}
          />

          {/* Value min */}
          <input
            type="number"
            className="form-input"
            style={{ flex: '0 1 110px', margin: 0, height: 36, fontSize: 13 }}
            placeholder={i.dealValMin}
            min={0}
            value={filterValueMin}
            onChange={(e) => setFilterValueMin(e.target.value)}
          />

          {/* Value max */}
          <input
            type="number"
            className="form-input"
            style={{ flex: '0 1 110px', margin: 0, height: 36, fontSize: 13 }}
            placeholder={i.dealValMax}
            min={0}
            value={filterValueMax}
            onChange={(e) => setFilterValueMax(e.target.value)}
          />

          {/* Clear */}
          {hasFilters && (
            <button
              className="btn btn-secondary"
              style={{ height: 36, fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={clearFilters}
            >
              ✕ {i.clearFilters}
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="loading">{i.loading}</div>
        ) : deals.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💼</div>
            <p>{i.noDeals}</p>
            <button className="btn btn-primary" onClick={openCreate}>{i.createFirstDeal}</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🔍</div>
            <p>{i.noDealsFilter}</p>
            <button className="btn btn-secondary" onClick={clearFilters}>{i.clearFilters}</button>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{i.titleLabel}</th>
                    <th>{i.contactLabel}</th>
                    <th>{i.valueLabel}</th>
                    <th>{i.status}</th>
                    <th>{i.priorityLabel}</th>
                    <th>{i.stage}</th>
                    <th>{i.createdAt}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/deals/${d.id}`} style={{ fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}>
                          {d.title}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {d.contact?.fullName || '—'}
                      </td>
                      <td>{d.currency} {Number(d.value).toLocaleString(i.locale, { minimumFractionDigits: 2 })}</td>
                      <td><span className={`badge badge-${d.status}`}>{STATUS_LABELS[d.status] ?? d.status}</span></td>
                      <td><span className={`badge badge-${d.priority}`}>{PRIORITY_LABELS[d.priority] ?? d.priority}</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>{d.stage?.name || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(d.createdAt).toLocaleDateString(i.locale)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Link href={`/deals/${d.id}`} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>{i.viewBtn}</Link>
                          <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(d)}>{i.delete}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{i.newDeal}</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {formError && <div className="error-msg">{formError}</div>}
                <div className="form-group">
                  <label className="form-label">{i.titleLabel} *</label>
                  <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">{i.valueLabel}</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{i.currencyLabel}</label>
                    <select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>MXN</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{i.priorityLabel}</label>
                  <select className="form-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="low">{i.priorityLow}</option>
                    <option value="medium">{i.priorityMedium}</option>
                    <option value="high">{i.priorityHigh}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{i.contactLabel}</label>
                  <select className="form-input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                    <option value="">{i.noContactOption}</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{i.pipeline}</label>
                  <select className="form-input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                    <option value="">— {i.pipeline} —</option>
                    {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {formStages.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">{i.stage}</label>
                    <select className="form-input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                      <option value="">— {i.stage} —</option>
                      {formStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? i.creating : i.newDeal}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
