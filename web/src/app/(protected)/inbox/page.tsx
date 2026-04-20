'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  getConversations, getConversation, createConversation, updateConversation,
  getMessages, getNotes, sendMessage, sendNote,
  getScheduledMessages, scheduleMessage, cancelScheduledMessage,
  getContacts, getInboxes, getCannedResponses, getTags, getAgents,
  getTeams, getQueues, assignConversation,
  getAiPrompts, runAiPrompt, openNotificationsStream, uploadMessageFile,
  getConversationTags, addConversationTag, removeConversationTag,
  getConvBotSession, updateConvBotSession,
  API_URL,
  type Conversation, type Message, type Contact, type Inbox,
  type CannedResponse, type Tag, type Agent, type Team, type Queue,
  type ScheduledMessage, type AiPrompt, type BotSession,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open:     { label: 'Serving',  cls: 'status-open' },
  pending:  { label: 'Waiting',  cls: 'status-pending' },
  resolved: { label: 'Resuelta', cls: 'status-resolved' },
  snoozed:  { label: 'Snoozed',  cls: 'status-snoozed' },
};

const CHANNEL_ICONS: Record<string, string> = {
  email: '📧', chat: '💬', whatsapp: '📱', instagram: '📷', telegram: '✈️',
};

// ── Filter bar component ──────────────────────────────────────────────────────

interface FilterBarProps {
  show: boolean;
  tags: Tag[];
  inboxes: Inbox[];
  agents: Agent[];
  queues: Queue[];
  filterTag: string;
  filterInbox: string;
  filterStatus: string;
  filterAgent: string;
  filterQueue: string;
  onTag: (v: string) => void;
  onInbox: (v: string) => void;
  onStatus: (v: string) => void;
  onAgent: (v: string) => void;
  onQueue: (v: string) => void;
  onClear: () => void;
}

function FilterBar({ show, tags, inboxes, agents, queues, filterTag, filterInbox, filterStatus, filterAgent, filterQueue, onTag, onInbox, onStatus, onAgent, onQueue, onClear }: FilterBarProps) {
  if (!show) return null;
  const active = filterTag || filterInbox || filterStatus || filterAgent || filterQueue;
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select className="form-input" style={{ fontSize: 12 }} value={filterTag} onChange={(e) => onTag(e.target.value)}>
        <option value="">🏷 Filtrar por Tag</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id} style={{ color: t.color ?? undefined }}>{t.name}</option>
        ))}
      </select>
      <select className="form-input" style={{ fontSize: 12 }} value={filterInbox} onChange={(e) => onInbox(e.target.value)}>
        <option value="">📥 Filtrar por Inbox</option>
        {inboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <select className="form-input" style={{ fontSize: 12 }} value={filterStatus} onChange={(e) => onStatus(e.target.value)}>
        <option value="">⚡ Estado</option>
        <option value="open">Serving (open)</option>
        <option value="pending">Waiting (pending)</option>
        <option value="resolved">Resuelta</option>
        <option value="snoozed">Snoozed</option>
      </select>
      <select className="form-input" style={{ fontSize: 12 }} value={filterAgent} onChange={(e) => onAgent(e.target.value)}>
        <option value="">👤 Filtrar por Agente</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
      </select>
      {queues.length > 0 && (
        <select className="form-input" style={{ fontSize: 12 }} value={filterQueue} onChange={(e) => onQueue(e.target.value)}>
          <option value="">📬 Filtrar por Cola</option>
          {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      )}
      {active && (
        <button onClick={onClear} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)', textAlign: 'center' }}>
          × Limpiar filtros
        </button>
      )}
    </div>
  );
}

// ── AI Prompts Drawer ─────────────────────────────────────────────────────────

function AiPromptsDrawer({
  conv,
  contact,
  onInsert,
  onClose,
}: {
  conv: Conversation;
  contact: { fullName?: string; email?: string } | undefined;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AiPrompt | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAiPrompts().then(setPrompts).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openPrompt(p: AiPrompt) {
    // Pre-fill variables with conversation context
    const prefill: Record<string, string> = {};
    p.variables.forEach((v) => {
      if (/contact.*name|nombre/i.test(v.name)) prefill[v.name] = contact?.fullName ?? '';
      else if (/email/i.test(v.name)) prefill[v.name] = contact?.email ?? '';
      else if (/canal|channel/i.test(v.name)) prefill[v.name] = conv.channelType ?? '';
    });
    setVariables(prefill);
    setResult('');
    setSelected(p);
  }

  async function handleRun() {
    if (!selected) return;
    setRunning(true);
    try {
      const res = await runAiPrompt(selected.id, variables);
      setResult(res.filled_prompt);
    } catch { setResult('Error al ejecutar el prompt'); }
    finally { setRunning(false); }
  }

  const filtered = prompts.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const byCategory: Record<string, AiPrompt[]> = {};
  filtered.forEach((p) => { (byCategory[p.category] ??= []).push(p); });

  return (
    <div style={{
      position: 'fixed', top: 0, right: 360, bottom: 0, zIndex: 200,
      display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none',
    }}>
      <div style={{
        width: 380, height: '100%', background: 'var(--card-bg)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        pointerEvents: 'auto',
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>✨ Prompts de IA</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Selecciona un prompt para el mensaje</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>

        {selected ? (
          /* ── Prompt detail view ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => { setSelected(null); setResult(''); }}>← Volver</button>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Variables */}
              {selected.variables.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Variables</div>
                  {selected.variables.map((v) => (
                    <div key={v.name} className="form-group" style={{ margin: '0 0 10px' }}>
                      <label className="form-label" style={{ fontSize: 12 }}>
                        {'{' + v.name + '}'} {v.description && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— {v.description}</span>}
                      </label>
                      <input
                        className="form-input"
                        style={{ fontSize: 13 }}
                        value={variables[v.name] ?? ''}
                        onChange={(e) => setVariables((p) => ({ ...p, [v.name]: e.target.value }))}
                        placeholder={v.example ?? v.description}
                      />
                    </div>
                  ))}
                </div>
              )}

              <button className="btn btn-primary" disabled={running} onClick={handleRun} style={{ width: '100%' }}>
                {running ? '⏳ Generando…' : '✨ Generar con IA'}
              </button>

              {/* Result */}
              {result && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Resultado</div>
                  <div style={{
                    padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8,
                    fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    border: '1px solid var(--border)', maxHeight: 280, overflowY: 'auto',
                  }}>
                    {result}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onInsert(result); onClose(); }}>
                      ↩ Insertar en mensaje
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(result)}>
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Prompt list view ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Buscar prompts…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {search ? 'Sin resultados' : 'No hay prompts creados aún'}
                </div>
              ) : Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat}>
                  <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {cat}
                  </div>
                  {items.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => openPrompt(p)}
                      style={{
                        padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.description}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {p.variables.length > 0 && (
                          <span style={{ fontSize: 10, color: '#6366f1', background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>
                            {p.variables.length} var{p.variables.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.usage_count} usos</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Peek Preview ─────────────────────────────────────────────────────────────

function PeekPreview({ conversationId, onOpen }: { conversationId: string; onOpen: () => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMessages(conversationId)
      .then((m) => setMsgs(m.slice(-5)))   // show last 5 messages
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conversationId]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 8, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      {loading ? (
        <span style={{ color: 'var(--text-muted)' }}>Cargando…</span>
      ) : msgs.length === 0 ? (
        <span style={{ color: 'var(--text-muted)' }}>Sin mensajes aún</span>
      ) : (
        msgs.map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ color: m.direction === 'inbound' ? '#3b82f6' : '#22c55e', fontWeight: 700, flexShrink: 0 }}>
              {m.direction === 'inbound' ? '←' : '→'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--text)' }}>
              {m.contentType !== 'text' ? `[${m.contentType}]` : m.body}
            </span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>
              {new Date(m.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))
      )}
      <button
        className="btn btn-primary"
        style={{ fontSize: 11, padding: '3px 8px', marginTop: 4 }}
        onClick={onOpen}
      >Abrir conversación →</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InboxPage() {
  // list
  const [tab, setTab] = useState<string>('open');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  // filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterTag, setFilterTag] = useState('');
  const [filterInbox, setFilterInbox] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterQueue, setFilterQueue] = useState('');

  // auxiliary data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);

  // active conversation
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<Message[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [composerTab, setComposerTab] = useState<'message' | 'note'>('message');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // scheduled messages
  const [scheduledMsgs, setScheduledMsgs] = useState<ScheduledMessage[]>([]);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // quick responses
  const [showCanned, setShowCanned] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');

  // AI prompts drawer
  const [showAiPrompts, setShowAiPrompts] = useState(false);

  // Conversation tags
  const [convTags, setConvTags] = useState<Tag[]>([]);

  // Bot session
  const [botSession, setBotSession] = useState<BotSession | null>(null);

  // new conversation modal
  const [showNew, setShowNew] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newInboxId, setNewInboxId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newChannel, setNewChannel] = useState('email');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [peekId, setPeekId] = useState<string | null>(null);

  // ── Load list ────────────────────────────────────────────────────────────────
  const loadList = useCallback(() => {
    setLoadingList(true); setListError('');
    getConversations({
      status:     tab !== 'all' ? tab : filterStatus || undefined,
      assignedTo: filterAgent  || undefined,
      inboxId:    filterInbox  || undefined,
      tagId:      filterTag    || undefined,
      queueId:    filterQueue  || undefined,
    })
      .then(setConversations)
      .catch((e) => setListError(e.message))
      .finally(() => setLoadingList(false));
  }, [tab, filterStatus, filterAgent, filterInbox, filterTag, filterQueue]);

  useEffect(() => { loadList(); }, [loadList]);

  // ── Load active conversation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) return;
    setLoadingChat(true);
    setConvTags([]);
    setBotSession(null);
    Promise.all([
      getConversation(activeId),
      getMessages(activeId),
      getNotes(activeId),
      getScheduledMessages(activeId).catch(() => []),
      getConversationTags(activeId).catch(() => []),
      getConvBotSession(activeId).catch(() => null),
    ])
      .then(([c, m, n, s, ct, bs]) => {
        setConv(c); setMessages(m); setNotes(n); setScheduledMsgs(s);
        setConvTags(ct); setBotSession(bs);
      })
      .catch(console.error)
      .finally(() => setLoadingChat(false));
  }, [activeId]);

  // ── Scroll to bottom ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, notes, composerTab]);

  // ── Aux data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    getContacts().then(setContacts).catch(() => {});
    getInboxes().then(setInboxes).catch(() => {});
    getCannedResponses().then(setCannedResponses).catch(() => {});
    getTags().then(setTags).catch(() => {});
    getAgents().then(setAgents).catch(() => {});
    getTeams().then(setTeams).catch(() => {});
    getQueues().then(setQueues).catch(() => {});
  }, []);

  // ── Real-time notifications (SSE) ────────────────────────────────────────────
  useEffect(() => {
    const es = openNotificationsStream((data) => {
      if (data.type === 'message_created') {
        const convId: string = data.conversationId;
        // If the active conversation received a new message, append it
        if (convId === activeId && data.message) {
          setMessages((prev) => {
            const exists = prev.some((m: Message) => m.id === data.message.id);
            return exists ? prev : [...prev, data.message];
          });
        }
        // Move conversation to top of list and refresh last_message_at
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === convId);
          if (idx === -1) {
            // New conversation — reload list
            loadList();
            return prev;
          }
          const updated = { ...prev[idx], last_message_at: new Date().toISOString() };
          const rest = prev.filter((_, i) => i !== idx);
          return [updated, ...rest];
        });
      }
    });
    return () => es.close();
  }, [activeId, loadList]);

  // ── Computed filtered list ───────────────────────────────────────────────────
  const currentUserId = (() => {
    if (typeof window === 'undefined') return '';
    try { return JSON.parse(localStorage.getItem('user') ?? '{}').id ?? ''; } catch { return ''; }
  })();

  const filtered = conversations.filter((c) => {
    if (onlyMine && c.assignedTo !== currentUserId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.subject ?? '').toLowerCase().includes(q) ||
      (c.contact?.fullName ?? '').toLowerCase().includes(q) ||
      (c.contact?.email ?? '').toLowerCase().includes(q)
    );
  });

  const activeFiltersCount = [filterTag, filterInbox, filterStatus, filterAgent, filterQueue].filter(Boolean).length;

  // ── Actions ──────────────────────────────────────────────────────────────────
  function selectConv(id: string) {
    setActiveId(id); setBody(''); setShowCanned(false); setComposerTab('message');
    setScheduleMode(false); setScheduledAt('');
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !body.trim()) return;
    if (scheduleMode && !scheduledAt) { alert('Selecciona fecha y hora para programar el mensaje'); return; }
    setSending(true);
    try {
      if (scheduleMode) {
        await scheduleMessage(activeId, body.trim(), new Date(scheduledAt).toISOString());
        setBody(''); setScheduleMode(false); setScheduledAt('');
        const s = await getScheduledMessages(activeId);
        setScheduledMsgs(s);
      } else if (composerTab === 'message') {
        await sendMessage(activeId, body.trim());
        setBody('');
        const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
        setMessages(m); setNotes(n);
        loadList();
      } else {
        await sendNote(activeId, body.trim());
        setBody('');
        const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
        setMessages(m); setNotes(n);
      }
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
    finally { setSending(false); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setSending(true);
    try {
      await uploadMessageFile(activeId, file);
      const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
      setMessages(m); setNotes(n);
      loadList();
    } catch (err: unknown) { alert(err instanceof Error ? err.message : 'Error al subir archivo'); }
    finally { setSending(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  async function handleCancelScheduled(schedId: string) {
    if (!activeId || !confirm('¿Cancelar este mensaje programado?')) return;
    await cancelScheduledMessage(activeId, schedId);
    setScheduledMsgs((prev) => prev.filter((s) => s.id !== schedId));
  }

  async function setStatus(status: string) {
    if (!activeId) return;
    try {
      await updateConversation(activeId, { status });
      setConv((p) => p ? { ...p, status } : p);
      setConversations((prev) => prev.map((c) => c.id === activeId ? { ...c, status } : c));
      if (tab !== 'all' && tab !== status) loadList();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError('');
    try {
      const payload: Record<string, unknown> = { channelType: newChannel };
      if (newSubject.trim()) payload.subject = newSubject.trim();
      if (newContactId) payload.contactId = newContactId;
      if (newInboxId) payload.inboxId = newInboxId;
      const created = await createConversation(payload as any);
      setShowNew(false);
      setNewContactId(''); setNewInboxId(''); setNewSubject(''); setNewChannel('email');
      loadList();
      selectConv(created.id);
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); }
    finally { setCreating(false); }
  }

  function insertCanned(cr: CannedResponse) {
    setBody(cr.content); setShowCanned(false); setCannedSearch('');
    textareaRef.current?.focus();
  }

  function clearFilters() {
    setFilterTag(''); setFilterInbox(''); setFilterStatus(''); setFilterAgent(''); setFilterQueue('');
  }

  const chatItems = composerTab === 'message' ? messages : notes;
  const listConv = conversations.find((c) => c.id === activeId);
  const filteredCanned = cannedResponses.filter((cr) =>
    !cannedSearch || cr.title.toLowerCase().includes(cannedSearch.toLowerCase()) || cr.content.toLowerCase().includes(cannedSearch.toLowerCase())
  );

  return (
    <div className="inbox-layout">

      {/* ── LEFT: List ──────────────────────────────────────────────────── */}
      <div className="inbox-sidebar">

        {/* Header */}
        <div className="inbox-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Inbox</span>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowNew(true)}>
              + Nueva
            </button>
          </div>
          {/* Status tabs */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { key: 'open', label: 'Serving' },
              { key: 'pending', label: 'Waiting' },
              { key: 'resolved', label: 'Resueltas' },
              { key: 'all', label: 'Todas' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600, borderRadius: 4,
                  border: '1px solid', cursor: 'pointer', transition: 'all .15s',
                  background: tab === t.key ? 'var(--primary)' : 'none',
                  borderColor: tab === t.key ? 'var(--primary)' : 'var(--border)',
                  color: tab === t.key ? '#fff' : 'var(--text-muted)',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Search + filter toggle */}
        <div className="inbox-sidebar-search">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              style={{ flex: 1, fontSize: 12 }}
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {/* Mine toggle */}
            <button
              title="Solo mis conversaciones"
              onClick={() => setOnlyMine(!onlyMine)}
              style={{
                padding: '0 8px', borderRadius: 6, border: '1px solid',
                borderColor: onlyMine ? 'var(--primary)' : 'var(--border)',
                background: onlyMine ? '#eff6ff' : 'none',
                color: onlyMine ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 14, flexShrink: 0,
              }}
            >👤</button>
            {/* Filter toggle */}
            <button
              title="Filtros avanzados"
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '0 8px', borderRadius: 6, border: '1px solid',
                borderColor: (showFilters || activeFiltersCount > 0) ? 'var(--primary)' : 'var(--border)',
                background: (showFilters || activeFiltersCount > 0) ? '#eff6ff' : 'none',
                color: (showFilters || activeFiltersCount > 0) ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 14, flexShrink: 0, position: 'relative',
              }}
            >
              ▾
              {activeFiltersCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar
          show={showFilters}
          tags={tags}
          inboxes={inboxes}
          agents={agents}
          queues={queues}
          filterTag={filterTag}
          filterInbox={filterInbox}
          filterStatus={filterStatus}
          filterAgent={filterAgent}
          filterQueue={filterQueue}
          onTag={setFilterTag}
          onInbox={setFilterInbox}
          onStatus={setFilterStatus}
          onAgent={setFilterAgent}
          onQueue={setFilterQueue}
          onClear={clearFilters}
        />

        {/* Active filters summary */}
        {activeFiltersCount > 0 && !showFilters && (
          <div style={{ padding: '6px 12px', background: '#eff6ff', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''} activo{activeFiltersCount > 1 ? 's' : ''}</span>
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 11 }}>× Limpiar</button>
          </div>
        )}

        {/* Conversation list */}
        <div className="inbox-conv-list">
          {loadingList ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
          ) : listError ? (
            <div style={{ padding: 16, color: 'var(--danger)', fontSize: 12 }}>{listError}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              {search || activeFiltersCount > 0 || onlyMine ? 'Sin resultados para los filtros aplicados.' : 'No hay conversaciones.'}
            </div>
          ) : filtered.map((c) => {
            const sm = STATUS_META[c.status] ?? STATUS_META.open;
            return (
              <div
                key={c.id}
                className={`inbox-conv-item${activeId === c.id ? ' active' : ''}`}
                onClick={() => selectConv(c.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                  <div className="inbox-conv-item-name" style={{ flex: 1 }}>
                    {CHANNEL_ICONS[c.channelType] ?? '💬'}{' '}
                    {c.contact?.id ? (
                      <Link
                        href={`/contacts/${c.contact.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        {c.contact.fullName || c.contact.email}
                      </Link>
                    ) : (c.contact?.fullName || c.contact?.email || '(Sin contacto)')}
                  </div>
                  <span className="inbox-conv-item-time">{timeAgo(c.lastMessageAt || c.updatedAt)}</span>
                </div>
                <div className="inbox-conv-item-subject">{c.subject || '(Sin asunto)'}</div>
                {/* Conversation tags + queue badge */}
                {((c.tags && c.tags.length > 0) || c.queueId) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                    {c.tags?.map((tag) => (
                      <span key={tag.id} style={{
                        padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                        background: tag.color ? `${tag.color}22` : '#e0e7ff',
                        color: tag.color ?? '#6366f1',
                        border: `1px solid ${tag.color ?? '#6366f1'}44`,
                      }}>{tag.name}</span>
                    ))}
                    {c.queueId && (() => {
                      const q = queues.find((q) => q.id === c.queueId);
                      return q ? (
                        <span style={{
                          padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                          background: '#0ea5e922', color: '#0ea5e9',
                          border: '1px solid #0ea5e944',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2zm2 4h8v2H4zm2 4h4v2H6z"/></svg>
                          {q.name}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}
                <div className="inbox-conv-item-meta">
                  <span className={`inbox-status-badge ${sm.cls}`}>{sm.label}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {c.inbox?.name && <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.inbox.name}</span>}
                    {/* Peek button — preview without opening */}
                    <button
                      title="Vista previa"
                      onClick={(e) => { e.stopPropagation(); setPeekId(peekId === c.id ? null : c.id); }}
                      style={{
                        background: peekId === c.id ? 'var(--primary)' : 'none',
                        border: '1px solid', borderColor: peekId === c.id ? 'var(--primary)' : 'var(--border)',
                        borderRadius: 6, padding: '1px 5px', cursor: 'pointer', fontSize: 11,
                        color: peekId === c.id ? '#fff' : 'var(--text-muted)',
                      }}
                    >👁</button>
                  </div>
                </div>
                {/* Peek preview panel */}
                {peekId === c.id && (
                  <PeekPreview conversationId={c.id} onOpen={() => { selectConv(c.id); setPeekId(null); }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer count */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          {filtered.length} de {conversations.length} conversaciones
        </div>
      </div>

      {/* ── CENTER: Chat ─────────────────────────────────────────────────── */}
      {activeId && conv ? (
        <div className="inbox-chat">

          {/* Chat header */}
          <div className="inbox-chat-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {listConv?.contact?.id ? (
                  <Link href={`/contacts/${listConv.contact.id}`} style={{ color: 'inherit', textDecoration: 'none' }}
                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                    {listConv.contact.fullName || listConv.contact.email}
                  </Link>
                ) : (listConv?.contact?.fullName || listConv?.contact?.email || '(Sin contacto)')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {CHANNEL_ICONS[conv.channelType] ?? ''} {conv.subject || '(Sin asunto)'}
                {listConv?.inbox?.name && <span style={{ marginLeft: 6, opacity: .7 }}>· {listConv.inbox.name}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <span className={`inbox-status-badge ${STATUS_META[conv.status]?.cls ?? 'status-open'}`}>
                {STATUS_META[conv.status]?.label ?? conv.status}
              </span>
              {conv.status !== 'resolved' && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setStatus('resolved')}>✓ Resolver</button>
              )}
              {conv.status === 'resolved' && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setStatus('open')}>↩ Reabrir</button>
              )}
              {conv.status === 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setStatus('pending')}>⏸ Espera</button>
              )}
            </div>
          </div>

          {/* Thread */}
          <div className="inbox-chat-body" ref={threadRef}>
            {loadingChat ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
            ) : chatItems.length === 0 && scheduledMsgs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
                {composerTab === 'message' ? 'Sin mensajes aún.' : 'Sin notas aún.'}
              </div>
            ) : (
              <>
                {chatItems.map((m) => {
                  const isFile = m.contentType === 'image' || m.contentType === 'audio' || m.contentType === 'file';
                  let fileUrl = ''; let fileName = '';
                  if (isFile && m.body?.includes('|')) { [fileUrl, fileName] = m.body.split('|'); }
                  else if (isFile) { fileUrl = m.body; fileName = m.body.split('/').pop() ?? 'archivo'; }
                  return (
                    <div key={m.id} className={`msg ${m.isPrivate ? 'msg-note' : m.direction === 'outbound' ? 'msg-out' : 'msg-in'}`}>
                      <div className="msg-bubble">
                        {m.contentType === 'image' && fileUrl ? (
                          <a href={`${API_URL}${fileUrl}`} target="_blank" rel="noopener">
                            <img src={`${API_URL}${fileUrl}`} alt={fileName} style={{ maxWidth: 220, maxHeight: 200, borderRadius: 6, display: 'block' }} />
                          </a>
                        ) : m.contentType === 'audio' && fileUrl ? (
                          <audio controls src={`${API_URL}${fileUrl}`} style={{ maxWidth: 220 }} />
                        ) : m.contentType === 'video' && fileUrl ? (
                          <video controls src={`${API_URL}${fileUrl}`} style={{ maxWidth: 220, borderRadius: 6 }} />
                        ) : m.contentType === 'file' && fileUrl ? (
                          <a href={`${API_URL}${fileUrl}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none' }}>
                            📎 <span style={{ textDecoration: 'underline', wordBreak: 'break-all' }}>{fileName}</span>
                          </a>
                        ) : m.body}
                      </div>
                      <div className="msg-time">
                        {new Date(m.createdAt).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      </div>
                    </div>
                  );
                })}
                {composerTab === 'message' && scheduledMsgs.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      🕐 Mensajes programados ({scheduledMsgs.length})
                    </div>
                    {scheduledMsgs.map((s) => (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
                        padding: '10px 12px', marginBottom: 6, borderRadius: 8,
                        background: '#fefce8', border: '1px dashed #fde047',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, marginBottom: 4, wordBreak: 'break-word' }}>{s.body}</div>
                          <div style={{ fontSize: 11, color: '#92400e', display: 'flex', gap: 8 }}>
                            <span>🕐 {new Date(s.scheduled_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            {s.author_name && <span>· {s.author_name}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelScheduled(s.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}
                          title="Cancelar mensaje programado"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Composer */}
          <div className="inbox-chat-composer">
            <div className="composer-tabs">
              <button className={`composer-tab${composerTab === 'message' ? ' active' : ''}`} onClick={() => setComposerTab('message')}>
                Mensaje
              </button>
              <button
                className="composer-tab"
                style={composerTab === 'note' ? { background: '#fef9c3', borderColor: '#fde047', color: '#713f12' } : {}}
                onClick={() => setComposerTab('note')}
              >
                📝 Nota interna
              </button>
            </div>
            <form onSubmit={handleSend} style={{ position: 'relative' }}>
              {/* Quick Responses dropdown */}
              {showCanned && (
                <div className="quick-resp-dropdown">
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      className="form-input"
                      style={{ fontSize: 12 }}
                      placeholder="Buscar respuesta…"
                      value={cannedSearch}
                      onChange={(e) => setCannedSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {filteredCanned.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Sin resultados</div>
                  ) : filteredCanned.map((cr) => (
                    <div key={cr.id} className="quick-resp-item" onClick={() => insertCanned(cr)}>
                      <div className="quick-resp-item-title">
                        {cr.category && <span style={{ color: 'var(--primary)', marginRight: 4 }}>[{cr.category}]</span>}
                        {cr.title}
                      </div>
                      <div className="quick-resp-item-preview">{cr.content}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {/* Hidden file input */}
                <input ref={fileInputRef} type="file" accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                {composerTab === 'message' && (
                  <button
                    type="button"
                    title="Adjuntar archivo"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, flexShrink: 0, alignSelf: 'flex-end',
                    }}
                  >📎</button>
                )}
                <button
                  type="button"
                  title="Quick Responses"
                  onClick={() => { setShowCanned(!showCanned); setCannedSearch(''); }}
                  style={{
                    padding: '6px 10px', borderRadius: 6, border: '1px solid',
                    borderColor: showCanned ? 'var(--primary)' : 'var(--border)',
                    background: showCanned ? 'var(--primary)' : 'none',
                    color: showCanned ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 14, flexShrink: 0, alignSelf: 'flex-end',
                  }}
                >💬</button>
                {composerTab === 'message' && (
                  <button
                    type="button"
                    title="Prompts de IA"
                    onClick={() => setShowAiPrompts(true)}
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid',
                      borderColor: showAiPrompts ? '#8b5cf6' : 'var(--border)',
                      background: showAiPrompts ? '#8b5cf6' : 'none',
                      color: showAiPrompts ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, flexShrink: 0, alignSelf: 'flex-end',
                    }}
                  >✨</button>
                )}
                <textarea
                  ref={textareaRef}
                  className="form-input"
                  style={{
                    flex: 1, resize: 'none', height: 72,
                    background: scheduleMode ? '#fefce8' : composerTab === 'note' ? '#fefce8' : undefined,
                    borderColor: scheduleMode ? '#f59e0b' : composerTab === 'note' ? '#fde047' : undefined,
                  }}
                  placeholder={composerTab === 'message'
                    ? (scheduleMode ? 'Escribe el mensaje a programar…' : 'Escribe un mensaje… (Enter envía, Shift+Enter nueva línea)')
                    : 'Nota interna — solo visible para el equipo…'}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !scheduleMode) { e.preventDefault(); handleSend(e as any); }
                    if (e.key === 'Escape') setShowCanned(false);
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'flex-end', flexShrink: 0 }}>
                  {/* Schedule toggle — only for outbound messages */}
                  {composerTab === 'message' && (
                    <button
                      type="button"
                      title={scheduleMode ? 'Cancelar programación' : 'Programar para después'}
                      onClick={() => { setScheduleMode(!scheduleMode); if (scheduleMode) setScheduledAt(''); }}
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 13,
                        borderColor: scheduleMode ? '#f59e0b' : 'var(--border)',
                        background: scheduleMode ? '#fef3c7' : 'none',
                        color: scheduleMode ? '#92400e' : 'var(--text-muted)',
                      }}
                    >🕐</button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sending || !body.trim() || (scheduleMode && !scheduledAt)}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >{sending ? '…' : scheduleMode ? 'Programar' : 'Enviar'}</button>
                </div>
              </div>
              {/* Schedule datetime picker */}
              {scheduleMode && composerTab === 'message' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '8px 10px', background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a' }}>
                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600, whiteSpace: 'nowrap' }}>🕐 Enviar el:</span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #fde68a', background: '#fffbeb', color: '#78350f', fontSize: 13, flex: 1 }}
                  />
                  <button type="button" onClick={() => { setScheduleMode(false); setScheduledAt(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 14, padding: '0 4px' }}>✕</button>
                </div>
              )}
            </form>
          </div>
        </div>
      ) : (
        <div className="inbox-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>✉</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Selecciona una conversación</div>
          <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-muted)' }}>o crea una nueva para empezar</div>
        </div>
      )}

      {/* ── RIGHT: Detail panel ──────────────────────────────────────────── */}
      {activeId && conv && listConv && (
        <div className="inbox-detail">

          {/* Contact */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">Contacto</div>
            {listConv.contact ? (
              <>
                <div className="inbox-detail-row">
                  <span className="inbox-detail-label">Nombre</span>
                  <Link href={`/contacts/${listConv.contact.id}`}
                    style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                    {listConv.contact.fullName} ↗
                  </Link>
                </div>
                {listConv.contact.email && (
                  <div className="inbox-detail-row">
                    <span className="inbox-detail-label">Email</span>
                    <span className="inbox-detail-value" style={{ fontSize: 12 }}>{listConv.contact.email}</span>
                  </div>
                )}
                {listConv.contact.phone && (
                  <div className="inbox-detail-row">
                    <span className="inbox-detail-label">Teléfono</span>
                    <span className="inbox-detail-value" style={{ fontSize: 12 }}>{listConv.contact.phone}</span>
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin contacto asignado</span>
            )}
          </div>

          {/* Conversation */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">Conversación</div>
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">Estado</span>
              <span className={`inbox-status-badge ${STATUS_META[conv.status]?.cls ?? 'status-open'}`} style={{ marginTop: 2 }}>
                {STATUS_META[conv.status]?.label ?? conv.status}
              </span>
            </div>
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">Canal</span>
              <span className="inbox-detail-value">{CHANNEL_ICONS[conv.channelType] ?? ''} {conv.channelType}</span>
            </div>
            {listConv.inbox && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">Inbox</span>
                <span className="inbox-detail-value">{listConv.inbox.name}</span>
              </div>
            )}
            {listConv.assignedAgent && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">Agente</span>
                <span className="inbox-detail-value">{listConv.assignedAgent.fullName}</span>
              </div>
            )}
            {conv.teamId && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">Equipo</span>
                <span className="inbox-detail-value" style={{ color: teams.find(t => t.id === conv.teamId)?.color ?? 'inherit', fontWeight: 600 }}>
                  {teams.find(t => t.id === conv.teamId)?.name ?? conv.teamId}
                </span>
              </div>
            )}
            {conv.queueId && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">Cola</span>
                <span className="inbox-detail-value">{queues.find(q => q.id === conv.queueId)?.name ?? conv.queueId}</span>
              </div>
            )}
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">Mensajes</span>
              <span className="inbox-detail-value">{messages.length} msgs · {notes.length} notas</span>
            </div>
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">Creada</span>
              <span className="inbox-detail-value" style={{ fontSize: 12 }}>
                {new Date(conv.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">Acciones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conv.status !== 'resolved' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('resolved')}>
                  ✓ Marcar resuelta
                </button>
              )}
              {conv.status !== 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('open')}>
                  ↩ Reabrir
                </button>
              )}
              {conv.status === 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('pending')}>
                  ⏸ Poner en espera
                </button>
              )}
              {conv.status === 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('snoozed')}>
                  😴 Snooze
                </button>
              )}
            </div>
          </div>

          {/* Assignment: Team + Queue + Agent */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">Asignación</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Team */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Equipo</div>
                <select
                  className="form-input"
                  style={{ fontSize: 12 }}
                  value={conv.teamId ?? ''}
                  onChange={async (e) => {
                    const teamId = e.target.value || undefined;
                    try {
                      await assignConversation({ conversationId: activeId, teamId, queueId: conv.queueId, userId: conv.assignedUserId });
                      setConv((p) => p ? { ...p, teamId: teamId ?? '' } : p);
                      setConversations((prev) => prev.map((c) => c.id === activeId ? { ...c, teamId: teamId ?? '' } : c));
                    } catch { alert('Error al asignar equipo'); }
                  }}
                >
                  <option value="">— Sin equipo —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {/* Queue */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Cola</div>
                <select
                  className="form-input"
                  style={{ fontSize: 12 }}
                  value={conv.queueId ?? ''}
                  onChange={async (e) => {
                    const queueId = e.target.value || undefined;
                    try {
                      await assignConversation({ conversationId: activeId, teamId: conv.teamId, queueId, userId: conv.assignedUserId });
                      setConv((p) => p ? { ...p, queueId: queueId ?? '' } : p);
                      setConversations((prev) => prev.map((c) => c.id === activeId ? { ...c, queueId: queueId ?? '' } : c));
                    } catch { alert('Error al asignar cola'); }
                  }}
                >
                  <option value="">— Sin cola —</option>
                  {queues.filter(q => q.isActive).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
              {/* Agent */}
              {agents.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Agente</div>
                  <select
                    className="form-input"
                    style={{ fontSize: 12 }}
                    value={conv.assignedTo ?? ''}
                    onChange={async (e) => {
                      const val = e.target.value;
                      try {
                        await updateConversation(activeId, { assignedTo: val || undefined } as any);
                        setConv((p) => p ? { ...p, assignedTo: val } : p);
                        setConversations((prev) => prev.map((c) => c.id === activeId ? { ...c, assignedTo: val } : c));
                      } catch { alert('Error al asignar agente'); }
                    }}
                  >
                    <option value="">— Sin asignar —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Bot session */}
          {botSession && (
            <div className="inbox-detail-section">
              <div className="inbox-detail-section-title">Bot IA</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: botSession.status === 'active' ? '#dcfce7' : '#fef9c3',
                    color: botSession.status === 'active' ? '#15803d' : '#92400e',
                    border: `1px solid ${botSession.status === 'active' ? '#86efac' : '#fde047'}`,
                  }}>
                    {botSession.status === 'active' ? '🤖 Bot activo' : '👤 Agente humano'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {botSession.bot_name}
                  </span>
                </div>
                {botSession.status === 'active' ? (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, justifyContent: 'center' }}
                    onClick={async () => {
                      const updated = await updateConvBotSession(activeId, 'take_over').catch(() => null);
                      setBotSession(updated);
                    }}
                  >
                    👤 Tomar control
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, justifyContent: 'center' }}
                    onClick={async () => {
                      const updated = await updateConvBotSession(activeId, 'restore_bot').catch(() => null);
                      setBotSession(updated);
                    }}
                  >
                    🤖 Devolver al bot
                  </button>
                )}
                {botSession.handed_off_at && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Traspasado: {new Date(botSession.handed_off_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">Etiquetas</div>
            {/* Applied tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: convTags.length > 0 ? 8 : 0 }}>
              {convTags.map((tag) => (
                <span key={tag.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  background: tag.color ? `${tag.color}22` : '#e0e7ff',
                  color: tag.color ?? '#6366f1',
                  border: `1px solid ${tag.color ?? '#6366f1'}44`,
                }}>
                  {tag.name}
                  <button
                    title="Quitar etiqueta"
                    onClick={async () => {
                      await removeConversationTag(activeId, tag.id).catch(() => {});
                      setConvTags((p) => p.filter((t) => t.id !== tag.id));
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: 12 }}
                  >×</button>
                </span>
              ))}
            </div>
            {/* Add tag dropdown */}
            {tags.filter((t) => !convTags.some((ct) => ct.id === t.id)).length > 0 && (
              <select
                className="form-input"
                style={{ fontSize: 11 }}
                value=""
                onChange={async (e) => {
                  const tagId = e.target.value;
                  if (!tagId) return;
                  await addConversationTag(activeId, tagId).catch(() => {});
                  const added = tags.find((t) => t.id === tagId);
                  if (added) setConvTags((p) => [...p, added]);
                }}
              >
                <option value="">+ Añadir etiqueta…</option>
                {tags.filter((t) => !convTags.some((ct) => ct.id === t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {tags.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin etiquetas creadas</span>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Nueva conversación ────────────────────────────────────── */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nueva conversación</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group">
                  <label className="form-label">Asunto</label>
                  <input className="form-input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Ej: Consulta sobre producto…" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Canal</label>
                  <select className="form-input" value={newChannel} onChange={(e) => setNewChannel(e.target.value)}>
                    <option value="email">📧 Email</option>
                    <option value="chat">💬 Chat</option>
                    <option value="whatsapp_web">📱 WhatsApp Web</option>
                    <option value="whatsapp">📱 WhatsApp API</option>
                    <option value="instagram">📷 Instagram</option>
                    <option value="telegram">✈️ Telegram</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Contacto</label>
                  <select className="form-input" value={newContactId} onChange={(e) => setNewContactId(e.target.value)}>
                    <option value="">— Sin contacto —</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Inbox</label>
                  <select className="form-input" value={newInboxId} onChange={(e) => setNewInboxId(e.target.value)}>
                    <option value="">— Sin inbox —</option>
                    {inboxes
                      .filter((i) => i.isEnabled !== false)
                      .filter((i, idx, arr) => idx === arr.findIndex((x) => x.name === i.name && x.channelType === i.channelType))
                      .map((i) => <option key={i.id} value={i.id}>{i.name} ({i.channelType})</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Prompts Drawer */}
      {showAiPrompts && conv && (
        <AiPromptsDrawer
          conv={conv}
          contact={listConv?.contact}
          onInsert={(text) => { setBody(text); textareaRef.current?.focus(); }}
          onClose={() => setShowAiPrompts(false)}
        />
      )}
    </div>
  );
}
