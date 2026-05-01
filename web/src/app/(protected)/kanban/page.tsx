'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getPipelines, getPipelineStages, getDealsKanban, updateDeal,
  createPipeline, updatePipeline, deletePipeline,
  createStage, updateStage, deleteStage,
  getConversations, updateConversation,
  type Pipeline, type PipelineStage, type Deal, type Conversation,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp_web: '📱', whatsapp: '📱', telegram: '✈️',
  email: '📧', instagram: '📷', facebook: '👥', chat: '💬',
};

const STATUS_COLORS: Record<string, string> = { open: '#3b82f6', won: '#22c55e', lost: '#ef4444' };

function formatCurrency(value: number, locale: string, currency = 'USD') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}
function colTotal(deals: Deal[], locale: string) {
  const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  return total > 0 ? formatCurrency(total, locale) : null;
}

// ── Conversations Board ───────────────────────────────────────────────────────

function ConversationsBoard() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const CONV_COLUMNS = [
    { key: 'open',     label: `🟢 ${i.open}`,     color: '#22c55e' },
    { key: 'pending',  label: `🟡 ${i.pending}`,   color: '#f59e0b' },
    { key: 'resolved', label: `✅ ${i.resolved}`,  color: '#64748b' },
  ];

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [dragging, setDragging]           = useState<Conversation | null>(null);
  const [overCol, setOverCol]             = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  const [filterChannel, setFilterChannel] = useState('');

  useEffect(() => {
    setLoading(true);
    getConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function byStatus(status: string) {
    return conversations.filter((c) => {
      if (c.status !== status) return false;
      if (filterChannel && c.channelType !== filterChannel) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = ((c as any).contact?.fullName || (c as any).contact?.email || '').toLowerCase();
        const subject = (c.subject || '').toLowerCase();
        return name.includes(q) || subject.includes(q);
      }
      return true;
    });
  }

  const channels = [...new Set(conversations.map((c) => c.channelType))].filter(Boolean);

  async function onDrop(newStatus: string) {
    if (!dragging || dragging.status === newStatus) { setDragging(null); setOverCol(null); return; }
    const oldStatus = dragging.status;
    setConversations((prev) => prev.map((c) => c.id === dragging.id ? { ...c, status: newStatus } : c));
    setDragging(null); setOverCol(null);
    try { await updateConversation(dragging.id, { status: newStatus } as any); }
    catch { setConversations((prev) => prev.map((c) => c.id === dragging.id ? { ...c, status: oldStatus } : c)); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.loading}</div>;

  return (
    <div style={{ padding: '12px 24px 20px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={i.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {channels.length > 1 && (
          <select className="form-input" style={{ width: 160 }} value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
            <option value="">{i.allChannels}</option>
            {channels.map((ch) => <option key={ch} value={ch}>{CHANNEL_ICONS[ch] ?? '💬'} {ch}</option>)}
          </select>
        )}
        {(search || filterChannel) && (
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setFilterChannel(''); }}>✕ {i.clear}</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', alignItems: 'flex-start', minHeight: 500 }}>
        {CONV_COLUMNS.map((col) => {
          const items = byStatus(col.key);
          return (
            <div
              key={col.key}
              style={{
                minWidth: 280, flex: '0 0 280px', background: 'var(--bg-secondary)',
                borderRadius: 10, border: overCol === col.key ? `2px solid ${col.color}` : '2px solid transparent',
                display: 'flex', flexDirection: 'column', maxHeight: '80vh',
              }}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
              onDragLeave={() => setOverCol(null)}
              onDrop={() => onDrop(col.key)}
            >
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: col.color }}>{col.label}</span>
                <span style={{ fontSize: 11, background: col.color + '22', color: col.color, borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>{items.length}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((conv) => (
                  <div
                    key={conv.id}
                    draggable
                    onDragStart={() => setDragging(conv)}
                    onDragEnd={() => { setDragging(null); setOverCol(null); }}
                    style={{
                      background: 'var(--card-bg)', borderRadius: 8, padding: '10px 12px',
                      border: '1px solid var(--border)', cursor: 'grab', fontSize: 13,
                      opacity: dragging?.id === conv.id ? 0.4 : 1,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <Link href={`/inbox?conv=${conv.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(conv as any).contact?.fullName || (conv as any).contact?.email || `(${i.noContact})`}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.subject || i.noSubject}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span>{CHANNEL_ICONS[conv.channelType] ?? '💬'} {conv.channelType}</span>
                        {(conv as any).lastMessageAt && (
                          <span>· {new Date((conv as any).lastMessageAt).toLocaleDateString(i.locale, { day: '2-digit', month: '2-digit' })}</span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 10px', fontSize: 12 }}>
                    {i.noConvsInCol}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pipeline Manager Tab ──────────────────────────────────────────────────────

function PipelinesManager() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Record<string, PipelineStage[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newStageName, setNewStageName] = useState<Record<string, string>>({});
  const [editingPipeline, setEditingPipeline] = useState<{ id: string; name: string } | null>(null);
  const [editingStage, setEditingStage] = useState<{ id: string; pipelineId: string; name: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const ps = await getPipelines();
    setPipelines(ps);
    if (ps.length > 0 && !expanded) setExpanded(ps[0].id);
  }

  async function loadStages(pipelineId: string) {
    const s = await getPipelineStages(pipelineId);
    setStages((prev) => ({ ...prev, [pipelineId]: s }));
  }

  async function handleExpand(id: string) {
    setExpanded(id);
    if (!stages[id]) await loadStages(id);
  }

  async function handleCreatePipeline() {
    if (!newPipelineName.trim()) return;
    await createPipeline({ name: newPipelineName.trim(), isDefault: pipelines.length === 0 });
    setNewPipelineName('');
    await load();
  }

  async function handleDeletePipeline(id: string, name: string) {
    if (!confirm(`${i.delete} "${name}"?\n${i.deletePipelineStagesWarning}`)) return;
    await deletePipeline(id);
    await load();
  }

  async function handleSetDefault(id: string) {
    await updatePipeline(id, { isDefault: true });
    await load();
  }

  async function handleSavePipelineName() {
    if (!editingPipeline) return;
    await updatePipeline(editingPipeline.id, { name: editingPipeline.name });
    setEditingPipeline(null);
    await load();
  }

  async function handleAddStage(pipelineId: string) {
    const name = newStageName[pipelineId]?.trim();
    if (!name) return;
    const existing = stages[pipelineId] ?? [];
    await createStage(pipelineId, { name, position: existing.length + 1 });
    setNewStageName((prev) => ({ ...prev, [pipelineId]: '' }));
    await loadStages(pipelineId);
  }

  async function handleDeleteStage(pipelineId: string, stageId: string, name: string) {
    if (!confirm(`${i.delete} "${name}"?`)) return;
    await deleteStage(pipelineId, stageId);
    await loadStages(pipelineId);
  }

  async function handleSaveStageName() {
    if (!editingStage) return;
    await updateStage(editingStage.pipelineId, editingStage.id, { name: editingStage.name });
    setEditingStage(null);
    await loadStages(editingStage.pipelineId);
  }

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{i.pipelines}</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{i.managePipelinesSubtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder={i.newPipelinePlaceholder}
          value={newPipelineName}
          onChange={(e) => setNewPipelineName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreatePipeline()}
        />
        <button className="btn btn-primary" onClick={handleCreatePipeline}>+ {i.createPipelineBtn}</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pipelines.map((p) => (
          <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: expanded === p.id ? 'var(--bg-secondary)' : 'transparent' }}
              onClick={() => handleExpand(p.id)}
            >
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{expanded === p.id ? '▼' : '▶'}</span>
              {editingPipeline?.id === p.id ? (
                <input
                  className="form-input"
                  style={{ flex: 1, padding: '4px 8px', fontSize: 14 }}
                  value={editingPipeline.name}
                  onChange={(e) => setEditingPipeline({ ...editingPipeline, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePipelineName(); if (e.key === 'Escape') setEditingPipeline(null); }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{p.name}</span>
              )}
              {p.isDefault && <span style={{ fontSize: 10, padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: 4, fontWeight: 600 }}>{i.defaultBadge}</span>}
              <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                {!p.isDefault && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleSetDefault(p.id)}>★ {i.setDefault}</button>}
                {editingPipeline?.id === p.id ? (
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={handleSavePipelineName}>{i.save}</button>
                ) : (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setEditingPipeline({ id: p.id, name: p.name })}>{i.renameBtn}</button>
                )}
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }} onClick={() => handleDeletePipeline(p.id, p.name)}>{i.delete}</button>
              </div>
            </div>

            {expanded === p.id && (
              <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                  {(stages[p.id] ?? []).map((s, idx) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 20, textAlign: 'center' }}>{idx + 1}</span>
                      {editingStage?.id === s.id ? (
                        <input
                          className="form-input"
                          style={{ flex: 1, padding: '3px 6px', fontSize: 13 }}
                          value={editingStage.name}
                          onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveStageName(); if (e.key === 'Escape') setEditingStage(null); }}
                          autoFocus
                        />
                      ) : (
                        <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                      )}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {editingStage?.id === s.id ? (
                          <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={handleSaveStageName}>✓</button>
                        ) : (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setEditingStage({ id: s.id, pipelineId: p.id, name: s.name })}>✏</button>
                        )}
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }} onClick={() => handleDeleteStage(p.id, s.id, s.name)}>✕</button>
                      </div>
                    </div>
                  ))}
                  {(stages[p.id] ?? []).length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>{i.noStagesYet}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                    placeholder={i.newStagePlaceholder}
                    value={newStageName[p.id] ?? ''}
                    onChange={(e) => setNewStageName((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStage(p.id)}
                  />
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleAddStage(p.id)}>{i.addStage}</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {pipelines.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
            {i.noPipelinesCreate}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Kanban Page ──────────────────────────────────────────────────────────

export default function KanbanPage() {
  const router = useRouter();
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [activeTab, setActiveTab] = useState<'kanban' | 'pipelines'>('kanban');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const dragDealRef = useRef<Deal | null>(null);

  const [searchDeals,        setSearchDeals]        = useState('');
  const [filterDealPriority, setFilterDealPriority] = useState('');
  const [filterDealStatus,   setFilterDealStatus]   = useState('');

  useEffect(() => {
    getPipelines().then((ps) => {
      setPipelines(ps);
      if (ps.length > 0) setSelectedPipeline(ps[0].id);
    }).catch((e) => setError(e.message));
  }, [activeTab]);

  useEffect(() => {
    if (!selectedPipeline) return;
    setLoading(true); setError('');
    Promise.all([getPipelineStages(selectedPipeline), getDealsKanban(selectedPipeline)])
      .then(([s, d]) => { setStages(s); setDeals(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedPipeline]);

  function reload() {
    if (!selectedPipeline) return;
    getDealsKanban(selectedPipeline).then(setDeals).catch(console.error);
  }

  function onDragStart(e: React.DragEvent, deal: Deal) {
    setDraggingId(deal.id);
    dragDealRef.current = deal;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverStageId(stageId);
  }
  function onDragLeave() { setOverStageId(null); }

  async function onDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault(); setOverStageId(null);
    const deal = dragDealRef.current;
    if (!deal || deal.stageId === stageId) { setDraggingId(null); return; }
    setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId } : d));
    setDraggingId(null); dragDealRef.current = null;
    try { await updateDeal(deal.id, { stageId }); }
    catch { setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId: deal.stageId } : d)); alert(i.error); }
  }

  async function onDropUnassigned(e: React.DragEvent) {
    e.preventDefault(); setOverStageId(null);
    const deal = dragDealRef.current;
    if (!deal || !deal.stageId) { setDraggingId(null); return; }
    setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId: '' } : d));
    setDraggingId(null); dragDealRef.current = null;
    try { await updateDeal(deal.id, { stageId: null as any }); }
    catch { setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId: deal.stageId } : d)); }
  }

  function onDragEnd() { setDraggingId(null); setOverStageId(null); dragDealRef.current = null; }

  async function onMoveToStage(deal: Deal, stageId: string | null) {
    if (deal.stageId === stageId) return;
    setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId: stageId ?? '' } : d));
    try { await updateDeal(deal.id, { stageId: stageId as any }); }
    catch { setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId: deal.stageId } : d)); alert(i.error); }
  }

  const filteredDeals = deals.filter((d) => {
    if (filterDealPriority && d.priority !== filterDealPriority) return false;
    if (filterDealStatus && d.status !== filterDealStatus) return false;
    if (searchDeals) {
      const q = searchDeals.toLowerCase();
      const title = d.title.toLowerCase();
      const contact = ((d.contact as any)?.fullName || (d.contact as any)?.full_name || '').toLowerCase();
      return title.includes(q) || contact.includes(q);
    }
    return true;
  });

  const dealsByStage: Record<string, Deal[]> = {};
  stages.forEach((s) => { dealsByStage[s.id] = []; });
  const unassigned: Deal[] = [];
  filteredDeals.forEach((d) => {
    if (d.stageId && dealsByStage[d.stageId]) dealsByStage[d.stageId].push(d);
    else if (!d.stageId) unassigned.push(d);
  });

  const totalValue = filteredDeals.reduce((s, d) => s + (d.value ?? 0), 0);

  const tabStyle = (t: string) => ({
    padding: '10px 18px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: activeTab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeTab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--bg)' }}>
        <button style={tabStyle('kanban')} onClick={() => setActiveTab('kanban')}>▦ {i.kanban}</button>
        <button style={tabStyle('pipelines')} onClick={() => setActiveTab('pipelines')}>⬡ {i.pipelines}</button>
      </div>

      {activeTab === 'pipelines' ? (
        <PipelinesManager />
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">{i.kanban}</h1>
              {totalValue > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {filteredDeals.length} {i.deals} · {formatCurrency(totalValue, i.locale)} {i.inPipeline}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                style={{ width: 180 }}
                placeholder={i.searchDealPlaceholder}
                value={searchDeals}
                onChange={(e) => setSearchDeals(e.target.value)}
              />
              <select className="form-input" style={{ width: 130 }} value={filterDealPriority} onChange={(e) => setFilterDealPriority(e.target.value)}>
                <option value="">{i.priorityLabel}</option>
                <option value="high">↑ {i.priorityHigh}</option>
                <option value="medium">→ {i.priorityMedium}</option>
                <option value="low">↓ {i.priorityLow}</option>
              </select>
              <select className="form-input" style={{ width: 120 }} value={filterDealStatus} onChange={(e) => setFilterDealStatus(e.target.value)}>
                <option value="">{i.status}</option>
                <option value="open">{i.dealStatusOpen}</option>
                <option value="won">{i.dealStatusWon}</option>
                <option value="lost">{i.dealStatusLost}</option>
              </select>
              {(searchDeals || filterDealPriority || filterDealStatus) && (
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setSearchDeals(''); setFilterDealPriority(''); setFilterDealStatus(''); }}>✕</button>
              )}
              {pipelines.length > 0 && (
                <select className="form-input" style={{ width: 180 }} value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)}>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={reload}>↻</button>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => router.push('/deals')}>+ {i.newDeal}</button>
            </div>
          </div>

          <div className="page-body" style={{ overflowX: 'auto' }}>
            {error && <div className="error-msg">{error}</div>}

            {pipelines.length === 0 && !loading ? (
              <div className="empty">
                <div className="empty-icon">⬡</div>
                <p>{i.noPipelinesKanban}</p>
                <button className="btn btn-primary" onClick={() => setActiveTab('pipelines')}>{i.createPipelineBtn}</button>
              </div>
            ) : stages.length === 0 && !loading ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <p>{i.noStagesForPipeline}</p>
                <button className="btn btn-secondary" onClick={() => setActiveTab('pipelines')}>{i.addStagesBtn}</button>
              </div>
            ) : loading ? (
              <div className="loading">{i.loading}</div>
            ) : (
              <div className="kanban-board">
                {stages.map((stage) => {
                  const colDeals = dealsByStage[stage.id] ?? [];
                  const isOver = overStageId === stage.id;
                  return (
                    <div key={stage.id} className="kanban-col">
                      <div className="kanban-col-header">
                        <span className="kanban-col-title">{stage.name}</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {colTotal(colDeals, i.locale) && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{colTotal(colDeals, i.locale)}</span>}
                          <span className="kanban-col-count">{colDeals.length}</span>
                        </div>
                      </div>
                      <div
                        className={`kanban-col-body${isOver ? ' drag-over' : ''}`}
                        onDragOver={(e) => onDragOver(e, stage.id)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, stage.id)}
                      >
                        {colDeals.length === 0 && !isOver && (
                          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '12px 0' }}>{i.noDealsInStage}</div>
                        )}
                        {colDeals.map((deal) => (
                          <KanbanCard key={deal.id} deal={deal} locale={i.locale} isDragging={draggingId === deal.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => router.push(`/deals/${deal.id}`)} priorityLabels={{ high: i.priorityHigh, medium: i.priorityMedium, low: i.priorityLow }} stages={stages} onMoveToStage={onMoveToStage} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {unassigned.length > 0 && (
                  <div className="kanban-col">
                    <div className="kanban-col-header" style={{ borderColor: '#cbd5e1' }}>
                      <span className="kanban-col-title" style={{ color: 'var(--text-muted)' }}>{i.noStageColumn}</span>
                      <span className="kanban-col-count">{unassigned.length}</span>
                    </div>
                    <div
                      className={`kanban-col-body${overStageId === 'unassigned' ? ' drag-over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setOverStageId('unassigned'); }}
                      onDragLeave={onDragLeave}
                      onDrop={onDropUnassigned}
                    >
                      {unassigned.map((deal) => (
                        <KanbanCard key={deal.id} deal={deal} locale={i.locale} isDragging={draggingId === deal.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => router.push(`/deals/${deal.id}`)} priorityLabels={{ high: i.priorityHigh, medium: i.priorityMedium, low: i.priorityLow }} stages={stages} onMoveToStage={onMoveToStage} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

interface KanbanCardProps {
  deal: Deal; isDragging: boolean; locale: string;
  priorityLabels: { high: string; medium: string; low: string };
  stages: PipelineStage[];
  onDragStart: (e: React.DragEvent, deal: Deal) => void;
  onDragEnd: () => void; onClick: () => void;
  onMoveToStage: (deal: Deal, stageId: string | null) => void;
}

function KanbanCard({ deal, isDragging, locale, priorityLabels, stages, onDragStart, onDragEnd, onClick, onMoveToStage }: KanbanCardProps) {
  const [showMove, setShowMove] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMove) return;
    function handleClick(e: Event) {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setShowMove(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('touchstart', handleClick); };
  }, [showMove]);

  const PRIORITY_META: Record<string, { color: string; label: string }> = {
    high:   { color: '#ef4444', label: `↑ ${priorityLabels.high}` },
    medium: { color: '#f59e0b', label: `→ ${priorityLabels.medium}` },
    low:    { color: '#64748b', label: `↓ ${priorityLabels.low}` },
  };
  const pm = PRIORITY_META[deal.priority] ?? PRIORITY_META.medium;
  return (
    <div className={`kanban-card${isDragging ? ' dragging' : ''}`} draggable onDragStart={(e) => onDragStart(e, deal)} onDragEnd={onDragEnd} onClick={onClick}>
      <div className="kanban-card-title">{deal.title}</div>
      <div className="kanban-card-meta">
        {(deal.value ?? 0) > 0 && (
          <div className="kanban-card-value">{new Intl.NumberFormat(locale, { style: 'currency', currency: deal.currency || 'USD', maximumFractionDigits: 0 }).format(deal.value)}</div>
        )}
        {deal.contact && (
          <div className="kanban-card-contact">👤 {(deal.contact as any).fullName || (deal.contact as any).full_name || ''}</div>
        )}
      </div>
      <div className="kanban-card-tags" style={{ position: 'relative' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: pm.color }}>{pm.label}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: STATUS_COLORS[deal.status] + '22', color: STATUS_COLORS[deal.status], fontWeight: 600 }}>{deal.status}</span>
        {/* Move-to-stage button */}
        <div ref={moveRef} style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMove((v) => !v); }}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 5,
              cursor: 'pointer', fontSize: 12, padding: '2px 6px', color: 'var(--text-muted)',
              lineHeight: 1,
            }}
            title="Mover a etapa"
          >⇄</button>
          {showMove && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                zIndex: 100, minWidth: 160, overflow: 'hidden',
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mover a
              </div>
              {deal.stageId && (
                <button
                  onClick={() => { onMoveToStage(deal, null); setShowMove(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}
                >
                  — Sin etapa
                </button>
              )}
              {stages.filter((s) => s.id !== deal.stageId).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onMoveToStage(deal, s.id); setShowMove(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', borderTop: '1px solid var(--border)' }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
