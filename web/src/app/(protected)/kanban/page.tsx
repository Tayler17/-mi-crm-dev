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

// ── Conversations Board ───────────────────────────────────────────────────────

const CONV_COLUMNS = [
  { key: 'open',     label: '🟢 Serving',   color: '#22c55e' },
  { key: 'pending',  label: '🟡 Waiting',    color: '#f59e0b' },
  { key: 'resolved', label: '✅ Resueltas',  color: '#64748b' },
];

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp_web: '📱', whatsapp: '📱', telegram: '✈️',
  email: '📧', instagram: '📷', facebook: '👥', chat: '💬',
};

function ConversationsBoard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [dragging, setDragging]           = useState<Conversation | null>(null);
  const [overCol, setOverCol]             = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function byStatus(status: string) {
    return conversations.filter((c) => c.status === status);
  }

  async function onDrop(newStatus: string) {
    if (!dragging || dragging.status === newStatus) { setDragging(null); setOverCol(null); return; }
    const oldStatus = dragging.status;
    setConversations((prev) => prev.map((c) => c.id === dragging.id ? { ...c, status: newStatus } : c));
    setDragging(null); setOverCol(null);
    try { await updateConversation(dragging.id, { status: newStatus } as any); }
    catch { setConversations((prev) => prev.map((c) => c.id === dragging.id ? { ...c, status: oldStatus } : c)); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>;

  return (
    <div style={{ padding: '20px 24px' }}>
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
              {/* Column header */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: col.color }}>{col.label}</span>
                <span style={{ fontSize: 11, background: col.color + '22', color: col.color, borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>{items.length}</span>
              </div>
              {/* Cards */}
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
                        {(conv as any).contact?.fullName || (conv as any).contact?.email || '(Sin contacto)'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.subject || '(Sin asunto)'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span>{CHANNEL_ICONS[conv.channelType] ?? '💬'} {conv.channelType}</span>
                        {(conv as any).lastMessageAt && (
                          <span>· {new Date((conv as any).lastMessageAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 10px', fontSize: 12 }}>
                    Sin conversaciones
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

const PRIORITY_META: Record<string, { color: string; label: string }> = {
  high:   { color: '#ef4444', label: '↑ Alta' },
  medium: { color: '#f59e0b', label: '→ Media' },
  low:    { color: '#64748b', label: '↓ Baja' },
};
const STATUS_COLORS: Record<string, string> = { open: '#3b82f6', won: '#22c55e', lost: '#ef4444' };

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}
function colTotal(deals: Deal[]) {
  const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  return total > 0 ? formatCurrency(total) : null;
}

// ── Pipeline Manager Tab ──────────────────────────────────────────────────────

function PipelinesManager() {
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
    if (!confirm(`¿Eliminar el pipeline "${name}"? Se eliminarán también sus etapas.`)) return;
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
    if (!confirm(`¿Eliminar la etapa "${name}"?`)) return;
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
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Pipelines</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Gestiona tus pipelines y sus etapas</p>
      </div>

      {/* Create new pipeline */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="Nombre del nuevo pipeline"
          value={newPipelineName}
          onChange={(e) => setNewPipelineName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreatePipeline()}
        />
        <button className="btn btn-primary" onClick={handleCreatePipeline}>+ Crear Pipeline</button>
      </div>

      {/* Pipeline list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pipelines.map((p) => (
          <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Pipeline header */}
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
              {p.isDefault && <span style={{ fontSize: 10, padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: 4, fontWeight: 600 }}>Predeterminado</span>}
              <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                {!p.isDefault && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleSetDefault(p.id)}>★ Predeterminar</button>}
                {editingPipeline?.id === p.id ? (
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={handleSavePipelineName}>Guardar</button>
                ) : (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setEditingPipeline({ id: p.id, name: p.name })}>Renombrar</button>
                )}
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }} onClick={() => handleDeletePipeline(p.id, p.name)}>Eliminar</button>
              </div>
            </div>

            {/* Stages */}
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
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>Sin etapas</div>
                  )}
                </div>
                {/* Add stage */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                    placeholder="Nueva etapa…"
                    value={newStageName[p.id] ?? ''}
                    onChange={(e) => setNewStageName((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStage(p.id)}
                  />
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleAddStage(p.id)}>+ Etapa</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {pipelines.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
            No hay pipelines. Crea el primero arriba.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Kanban Page ──────────────────────────────────────────────────────────

export default function KanbanPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'kanban' | 'pipelines' | 'conversations'>('conversations');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const dragDealRef = useRef<Deal | null>(null);

  useEffect(() => {
    getPipelines().then((ps) => {
      setPipelines(ps);
      if (ps.length > 0) setSelectedPipeline(ps[0].id);
    }).catch((e) => setError(e.message));
  }, [activeTab]); // reload when switching back from pipelines tab

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
    catch { setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stageId: deal.stageId } : d)); alert('Error al mover el deal'); }
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

  const dealsByStage: Record<string, Deal[]> = {};
  stages.forEach((s) => { dealsByStage[s.id] = []; });
  const unassigned: Deal[] = [];
  deals.forEach((d) => {
    if (d.stageId && dealsByStage[d.stageId]) dealsByStage[d.stageId].push(d);
    else if (!d.stageId) unassigned.push(d);
  });

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  const tabStyle = (t: string) => ({
    padding: '10px 18px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: activeTab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeTab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--bg)' }}>
        <button style={tabStyle('conversations')} onClick={() => setActiveTab('conversations')}>💬 Conversaciones</button>
        <button style={tabStyle('kanban')} onClick={() => setActiveTab('kanban')}>▦ Deals Kanban</button>
        <button style={tabStyle('pipelines')} onClick={() => setActiveTab('pipelines')}>⬡ Pipelines</button>
      </div>

      {activeTab === 'conversations' ? (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">Board de Conversaciones</h1>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Arrastra conversaciones entre columnas para cambiar su estado</p>
            </div>
          </div>
          <ConversationsBoard />
        </>
      ) : activeTab === 'pipelines' ? (
        <PipelinesManager />
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">Kanban</h1>
              {totalValue > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {deals.length} deals · {formatCurrency(totalValue)} en pipeline
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {pipelines.length > 0 && (
                <select className="form-input" style={{ width: 200 }} value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)}>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={reload}>↻ Actualizar</button>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => router.push('/deals')}>+ Nuevo deal</button>
            </div>
          </div>

          <div className="page-body" style={{ overflowX: 'auto' }}>
            {error && <div className="error-msg">{error}</div>}

            {pipelines.length === 0 && !loading ? (
              <div className="empty">
                <div className="empty-icon">⬡</div>
                <p>No hay pipelines. Crea uno en la pestaña Pipelines.</p>
                <button className="btn btn-primary" onClick={() => setActiveTab('pipelines')}>Crear pipeline</button>
              </div>
            ) : stages.length === 0 && !loading ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <p>Este pipeline no tiene etapas.</p>
                <button className="btn btn-secondary" onClick={() => setActiveTab('pipelines')}>Añadir etapas</button>
              </div>
            ) : loading ? (
              <div className="loading">Cargando…</div>
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
                          {colTotal(colDeals) && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{colTotal(colDeals)}</span>}
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
                          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '12px 0' }}>Sin deals</div>
                        )}
                        {colDeals.map((deal) => (
                          <KanbanCard key={deal.id} deal={deal} isDragging={draggingId === deal.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => router.push(`/deals/${deal.id}`)} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {unassigned.length > 0 && (
                  <div className="kanban-col">
                    <div className="kanban-col-header" style={{ borderColor: '#cbd5e1' }}>
                      <span className="kanban-col-title" style={{ color: 'var(--text-muted)' }}>Sin etapa</span>
                      <span className="kanban-col-count">{unassigned.length}</span>
                    </div>
                    <div
                      className={`kanban-col-body${overStageId === 'unassigned' ? ' drag-over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setOverStageId('unassigned'); }}
                      onDragLeave={onDragLeave}
                      onDrop={onDropUnassigned}
                    >
                      {unassigned.map((deal) => (
                        <KanbanCard key={deal.id} deal={deal} isDragging={draggingId === deal.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => router.push(`/deals/${deal.id}`)} />
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
  deal: Deal; isDragging: boolean;
  onDragStart: (e: React.DragEvent, deal: Deal) => void;
  onDragEnd: () => void; onClick: () => void;
}

function KanbanCard({ deal, isDragging, onDragStart, onDragEnd, onClick }: KanbanCardProps) {
  const pm = PRIORITY_META[deal.priority] ?? PRIORITY_META.medium;
  return (
    <div className={`kanban-card${isDragging ? ' dragging' : ''}`} draggable onDragStart={(e) => onDragStart(e, deal)} onDragEnd={onDragEnd} onClick={onClick}>
      <div className="kanban-card-title">{deal.title}</div>
      <div className="kanban-card-meta">
        {(deal.value ?? 0) > 0 && (
          <div className="kanban-card-value">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: deal.currency || 'USD', maximumFractionDigits: 0 }).format(deal.value)}</div>
        )}
        {deal.contact && (
          <div className="kanban-card-contact">👤 {(deal.contact as any).fullName || (deal.contact as any).full_name || ''}</div>
        )}
      </div>
      <div className="kanban-card-tags">
        <span style={{ fontSize: 10, fontWeight: 600, color: pm.color }}>{pm.label}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: STATUS_COLORS[deal.status] + '22', color: STATUS_COLORS[deal.status], fontWeight: 600 }}>{deal.status}</span>
      </div>
    </div>
  );
}
