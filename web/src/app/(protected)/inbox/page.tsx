'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { APP } from '@/lib/i18n/app';
import { useLangCtx } from '@/lib/lang-context';
import { CustomFieldsPanel } from '@/components/CustomFieldsPanel';
import {
  getConversations, getConversation, createConversation, updateConversation, deleteConversation,
  getMessages, getNotes, sendMessage, sendNote,
  getScheduledMessages, scheduleMessage, cancelScheduledMessage,
  getContacts, getInboxes, getCannedResponses, getTags, getAgents,
  getTeams, getQueues, assignConversation,
  getAiPrompts, runAiPrompt, openNotificationsStream, uploadMessageFile,
  editConversationMessage, deleteConversationMessage,
  getConversationTags, addConversationTag, removeConversationTag,
  getConvBotSession, updateConvBotSession,
  getContactTimeline, requestCsat,
  API_URL,
  type Conversation, type Message, type Contact, type Inbox,
  type CannedResponse, type Tag, type Agent, type Team, type Queue,
  type ScheduledMessage, type AiPrompt, type BotSession, type ContactTimeline,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Touch/phone devices have no easy Shift+Enter, so there Enter inserts a newline
// and the send button sends (like WhatsApp). Desktop keeps Enter=send.
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function exportConversationPdf(conv: Conversation, contact: { fullName?: string; email?: string } | null, msgs: Message[], i: typeof APP['es']) {
  const contactName = contact?.fullName || contact?.email || i.noContact;
  const fmtTime = (dt: string) => new Date(dt).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const rows = msgs
    .filter((m) => !m.isPrivate && m.contentType !== 'activity')
    .map((m) => {
      const isOut = m.direction === 'outbound';
      const sender = isOut ? i.inbxAgent : contactName;
      const body = m.body ?? '';
      const transcriptIdx = body.indexOf('**Transcript:**');
      let bodyHtml: string;
      if (transcriptIdx !== -1) {
        const headerRaw = body.slice(0, transcriptIdx).trim().replace(/\*\*/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        const transcriptRaw = body.slice(transcriptIdx + '**Transcript:**'.length).trim();
        const turns = transcriptRaw.split('\n').flatMap((line) => {
          const u = line.match(/^\[Usuario\]:\s*(.+)/);
          const b = line.match(/^\[Bot\]:\s*(.+)/);
          if (u) return [`<div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:5px"><div style="font-size:10px;color:#6b7280;margin-bottom:2px;padding-left:4px">Cliente</div><div style="max-width:80%;padding:6px 10px;border-radius:4px 12px 12px 12px;background:#f1f5f9;color:#111;font-size:12px;line-height:1.4">${u[1].replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`];
          if (b) return [`<div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:5px"><div style="font-size:10px;color:#6b7280;margin-bottom:2px;padding-right:4px">Bot</div><div style="max-width:80%;padding:6px 10px;border-radius:12px 4px 12px 12px;background:#2563eb;color:#fff;font-size:12px;line-height:1.4">${b[1].replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`];
          return [];
        }).join('');
        bodyHtml = `<div style="font-size:11px;color:#6b7280;margin-bottom:8px;line-height:1.5">${headerRaw}</div><div style="display:flex;flex-direction:column">${turns}</div>`;
      } else {
        bodyHtml = `<div style="max-width:75%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;background:${isOut ? '#2563eb' : '#f1f5f9'};color:${isOut ? '#fff' : '#111'}">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;
      }
      return `
        <div style="margin-bottom:14px;display:flex;flex-direction:column;align-items:${transcriptIdx !== -1 ? 'stretch' : isOut ? 'flex-end' : 'flex-start'}">
          <div style="font-size:11px;color:#6b7280;margin-bottom:3px">${sender} · ${m.createdAt ? fmtTime(m.createdAt) : ''}</div>
          ${bodyHtml}
        </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${i.inbxConvWith} — ${contactName}</title>
    <style>
      body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#111}
      .header{border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px}
      h2{margin:0 0 4px;font-size:18px}
      .meta{font-size:12px;color:#6b7280}
      @media print{body{padding:0}}
    </style>
  </head><body>
    <div class="header">
      <h2>${i.inbxConvWith} ${contactName}</h2>
      <div class="meta">
        ${i.channelLabel}: ${conv.channelType ?? '—'} ·
        ${i.status}: ${conv.status} ·
        ${i.inbxSubjectLbl}: ${conv.subject || i.noSubject} ·
        ${i.inbxPdfExported} ${fmtTime(new Date().toISOString())}
      </div>
    </div>
    ${rows || `<p style="color:#9ca3af;text-align:center">${i.inbxNoMsgs}</p>`}
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* AudioContext not available */ }
}


function timeAgo(dateStr: string, nowLabel: string, locale: string) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return nowLabel;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

const STATUS_CSS: Record<string, string> = {
  open:     'status-open',
  pending:  'status-pending',
  resolved: 'status-resolved',
  snoozed:  'status-snoozed',
};

const CHANNEL_ICONS: Record<string, string> = {
  email: '📧', chat: '💬', whatsapp: '📱', whatsapp_web: '📱', instagram: '📷', telegram: '✈️', phone: '📞',
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
  const { lang } = useLangCtx();
  const i = APP[lang];
  const active = filterTag || filterInbox || filterStatus || filterAgent || filterQueue;
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select className="form-input" style={{ fontSize: 12 }} value={filterTag} onChange={(e) => onTag(e.target.value)}>
        <option value="">{i.inbxFilterTag}</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id} style={{ color: t.color ?? undefined }}>{t.name}</option>
        ))}
      </select>
      <select className="form-input" style={{ fontSize: 12 }} value={filterInbox} onChange={(e) => onInbox(e.target.value)}>
        <option value="">{i.inbxFilterInbox}</option>
        {inboxes.map((inb) => <option key={inb.id} value={inb.id}>{inb.name}</option>)}
      </select>
      <select className="form-input" style={{ fontSize: 12 }} value={filterStatus} onChange={(e) => onStatus(e.target.value)}>
        <option value="">⚡ {i.status}</option>
        <option value="open">{i.inbxServing}</option>
        <option value="pending">{i.inbxWaiting}</option>
        <option value="resolved">{i.inbxResolvedLabel}</option>
        <option value="snoozed">{i.inbxSnoozed}</option>
      </select>
      <select className="form-input" style={{ fontSize: 12 }} value={filterAgent} onChange={(e) => onAgent(e.target.value)}>
        <option value="">{i.inbxFilterAgent}</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
      </select>
      {queues.length > 0 && (
        <select className="form-input" style={{ fontSize: 12 }} value={filterQueue} onChange={(e) => onQueue(e.target.value)}>
          <option value="">{i.inbxFilterQueue}</option>
          {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      )}
      {active && (
        <button onClick={onClear} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)', textAlign: 'center' }}>
          {i.inbxClearFilters}
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
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AiPrompt | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [result, setResult] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
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
    setAiError(null);
    try {
      const res = await runAiPrompt(selected.id, variables);
      setResult(res.result);
      if (res.ai_error) setAiError(res.ai_error);
    } catch { setResult(''); setAiError('Error al conectar con la IA'); }
    finally { setRunning(false); }
  }

  const filtered = prompts.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const byCategory: Record<string, AiPrompt[]> = {};
  filtered.forEach((p) => { (byCategory[p.category] ??= []).push(p); });

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 298 }} />
      <div style={{
        position: 'fixed', top: 52, right: 0, bottom: 0, width: 400,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
        zIndex: 299,
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>✨ {i.inbxAiTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{i.inbxAiHint}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>

        {selected ? (
          /* ── Prompt detail view ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => { setSelected(null); setResult(''); }}>← {i.back}</button>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Variables */}
              {selected.variables.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{i.inbxVariables}</div>
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
                {running ? `⏳ ${i.inbxGenerating}` : `✨ ${i.inbxGenerate}`}
              </button>

              {/* AI Error banner */}
              {aiError && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#b91c1c' }}>
                  ⚠️ {aiError}
                </div>
              )}

              {/* Result */}
              {result && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i.inbxResult}
                    {!aiError && <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>✨ IA</span>}
                    {aiError && <span style={{ fontSize: 10, background: '#fef9c3', color: '#854d0e', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>📋 Template</span>}
                  </div>
                  <div style={{
                    padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8,
                    fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    border: '1px solid var(--border)', maxHeight: 280, overflowY: 'auto',
                  }}>
                    {result}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onInsert(result); onClose(); }}>
                      ↩ {i.inbxInsert}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(result)}>
                      {i.copy}
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
              <input className="form-input" style={{ fontSize: 12 }} placeholder={i.inbxSearchPrompts} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {search ? i.noResults : i.inbxNoPrompts}
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
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.usage_count} {i.inbxUses}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Peek Preview ─────────────────────────────────────────────────────────────

function PeekPreview({ conversationId, onOpen }: { conversationId: string; onOpen: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
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
        <span style={{ color: 'var(--text-muted)' }}>{i.loading}</span>
      ) : msgs.length === 0 ? (
        <span style={{ color: 'var(--text-muted)' }}>{i.inbxNoMsgsYet}</span>
      ) : (
        msgs.map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            {m.contentType !== 'activity' && (
              <span style={{ color: m.direction === 'inbound' ? '#3b82f6' : '#22c55e', fontWeight: 700, flexShrink: 0 }}>
                {m.direction === 'inbound' ? '←' : '→'}
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: m.contentType === 'activity' ? 'var(--text-muted)' : 'var(--text)', fontStyle: m.contentType === 'activity' ? 'italic' : 'normal' }}>
              {m.contentType === 'activity' ? m.body : m.contentType !== 'text' ? `[${m.contentType}]` : m.body}
            </span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>
              {new Date(m.createdAt).toLocaleTimeString(i.locale, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))
      )}
      <button
        className="btn btn-primary"
        style={{ fontSize: 11, padding: '3px 8px', marginTop: 4 }}
        onClick={onOpen}
      >{i.inbxOpenConv}</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  // Current user role (for admin-only actions)
  const currentUserRole = (() => {
    if (typeof window === 'undefined') return '';
    try { return JSON.parse(localStorage.getItem('user') ?? '{}').role ?? ''; } catch { return ''; }
  })();
  const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin';

  const statusLabels: Record<string, string> = {
    open: i.inbxServing, pending: i.inbxWaiting, resolved: i.inbxResolvedLabel, snoozed: i.inbxSnoozed,
  };

  // list
  const [tab, setTab] = useState<string>('open');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  // bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

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

  // in-conversation search (client-side, over the already-loaded messages)
  const [convSearchOpen, setConvSearchOpen] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [convMatchIdx, setConvMatchIdx] = useState(0);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll the current search match into view (recomputes from the same inputs as the thread).
  useEffect(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return;
    const list = composerTab === 'message' ? messages : notes;
    const ids = list.filter((m) => m.contentType !== 'activity' && (m.body ?? '').toLowerCase().includes(q)).map((m) => m.id);
    const id = ids[convMatchIdx];
    if (id && msgRefs.current[id]) msgRefs.current[id]!.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [convSearch, convMatchIdx, messages, notes, composerTab]);

  // scheduled messages
  const [scheduledMsgs, setScheduledMsgs] = useState<ScheduledMessage[]>([]);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // quick responses
  const [showCanned, setShowCanned] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = not open
  const [mentionCursor, setMentionCursor] = useState(0);

  // mention toast
  const [mentionToast, setMentionToast] = useState('');

  // AI prompts drawer
  const [showAiPrompts, setShowAiPrompts] = useState(false);

  // File attachment staged (caption uses the main body textarea)
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Message edit/delete
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgText, setEditMsgText] = useState('');
  // Message reply (quote)
  const [replyToMsg, setReplyToMsg] = useState<Message | null>(null);

  // Voice note recording
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRecordRef = useRef(false);

  // Conversation tags
  const [convTags, setConvTags] = useState<Tag[]>([]);

  // Bot session
  const [botSession, setBotSession] = useState<BotSession | null>(null);

  // CSAT
  const [csatSent, setCsatSent] = useState<Record<string, boolean>>({});

  // Contact timeline
  const [timeline, setTimeline] = useState<ContactTimeline | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Tick every 60s so SLA wait-time badges re-render
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // new conversation modal
  const [showNew, setShowNew] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newInboxId, setNewInboxId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newChannel, setNewChannel] = useState('email');
  const [contactSearch, setContactSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // unread tracking: { conversationId → count }
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [peekId, setPeekId] = useState<string | null>(null);

  // ── Page title unread count ───────────────────────────────────────────────────
  useEffect(() => {
    const total = Object.values(unreadMap).reduce((s, n) => s + n, 0);
    document.title = total > 0 ? `(${total}) Inbox — CRM` : 'Inbox — CRM';
    return () => { document.title = 'CRM'; };
  }, [unreadMap]);

  // ── Load list ────────────────────────────────────────────────────────────────
  // silent=true → refresh data in background without replacing the list with a spinner
  const loadList = useCallback((silent = false) => {
    if (!silent) setLoadingList(true);
    setListError('');
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

  // Stable ref so the SSE handler can call the latest loadList without being
  // listed as a dependency (which would reopen the SSE connection on every filter change)
  const loadListRef = useRef(loadList);
  useEffect(() => { loadListRef.current = loadList; }, [loadList]);

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

  // ── Contact timeline — load when contact changes ──────────────────────────────
  useEffect(() => {
    setTimeline(null); setTimelineOpen(false);
    const contactId = conversations.find((c) => c.id === activeId)?.contactId;
    if (!contactId) return;
    getContactTimeline(contactId).then(setTimeline).catch(() => {});
  }, [activeId, conversations]);

  // ── Scroll to bottom ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, notes, composerTab]);

  // ── Aux data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    getInboxes().then(setInboxes).catch(() => {});
    getCannedResponses().then(setCannedResponses).catch(() => {});
    getTags().then(setTags).catch(() => {});
    getAgents().then(setAgents).catch(() => {});
    getTeams().then(setTeams).catch(() => {});
    getQueues().then(setQueues).catch(() => {});
  }, []);

  // ── Contact picker: search the FULL contact list server-side (debounced) ──────
  // Previously only the first page was loaded, so contacts beyond it never showed
  // when starting a new conversation.
  useEffect(() => {
    const t = setTimeout(() => {
      getContacts(1, 50, contactSearch.trim()).then((r) => setContacts(r.data)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  // ── Deep-link from Contacts "💬 Conversar": open the new-conversation modal
  // pre-filled with the contact passed via ?contactId=...&contactName=...
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    // Open an existing conversation directly (e.g. from a contact's profile)
    const openConv = params.get('conversation');
    if (openConv) {
      selectConv(openConv);
      window.history.replaceState({}, '', '/inbox'); // clean URL so refresh doesn't re-trigger
      return;
    }
    const cid = params.get('contactId');
    if (!cid) return;
    const cname = params.get('contactName') ?? '';
    setNewContactId(cid);
    setContactSearch(cname);
    setNewChannel('whatsapp_web');
    setShowNew(true);
    window.history.replaceState({}, '', '/inbox'); // clean URL so refresh doesn't re-trigger
  }, []);

  // ── Real-time notifications (SSE) ────────────────────────────────────────────
  useEffect(() => {
    const es = openNotificationsStream((data) => {
      if (data.type === 'message_created') {
        const convId: string = data.conversationId;
        const isInbound = data.message?.direction === 'inbound';

        // If the active conversation received a new message, append it
        if (convId === activeId && data.message) {
          setMessages((prev) => {
            const exists = prev.some((m: Message) => m.id === data.message.id);
            return exists ? prev : [...prev, data.message];
          });
          // A bot may have just engaged (or handed off) → refresh the bot panel
          // so the activate/deactivate (Take over / Restore) control appears live.
          getConvBotSession(activeId).then(setBotSession).catch(() => {});
        }

        // If it's an inbound message in a NON-active conversation → sound + per-conv unread count
        // (browser Notification is already handled by the global SSE in layout.tsx)
        if (isInbound && convId !== activeId) {
          setUnreadMap((prev) => ({ ...prev, [convId]: (prev[convId] ?? 0) + 1 }));
          playNotificationSound();
        }

        // Move conversation to top of list and refresh last_message_at
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === convId);
          if (idx === -1) {
            // New conversation — silently reload the list (no spinner flash)
            loadListRef.current(true);
            return prev;
          }
          const updated = { ...prev[idx], last_message_at: new Date().toISOString() };
          const rest = prev.filter((_, arrIdx) => arrIdx !== idx);
          return [updated, ...rest];
        });
      }

      if (data.type === 'message_status_updated') {
        const { messageId, status } = data as { messageId: string; status: string };
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status } : m));
      }

      // Real-time note from another agent
      if (data.type === 'note_created') {
        const convId: string = data.conversationId;
        if (convId === activeId && data.note) {
          setNotes((prev) => {
            const exists = prev.some((n: Message) => n.id === data.note.id);
            return exists ? prev : [...prev, data.note];
          });
        }
      }

      // Mention notification
      if (data.type === 'mention_created') {
        const userId = (() => { try { return JSON.parse(localStorage.getItem('user') ?? '{}').id ?? ''; } catch { return ''; } })();
        if (data.mentionedUserId === userId) {
          setMentionToast(`💬 ${data.mentionedBy} te mencionó: "${(data.body as string)?.slice(0, 60)}"`);
          setTimeout(() => setMentionToast(''), 5000);
          if (data.conversationId !== activeId) {
            setUnreadMap((prev) => ({ ...prev, [data.conversationId]: (prev[data.conversationId] ?? 0) + 1 }));
          }
        }
      }
    });
    return () => es.close();
  }, [activeId]); // loadList intentionally omitted — use loadListRef to keep SSE stable

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
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat' | 'detail'>('list');

  function selectConv(id: string) {
    setActiveId(id); setBody(''); setShowCanned(false); setComposerTab('message');
    setScheduleMode(false); setScheduledAt('');
    setMobilePanel('chat');
    // Clear unread badge for this conversation
    if (unreadMap[id]) setUnreadMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  async function resolveQuick(e: React.MouseEvent, convId: string) {
    e.stopPropagation();
    try {
      await updateConversation(convId, { status: 'resolved' });
      if (activeId === convId) {
        setConv((p) => p ? { ...p, status: 'resolved' } : p);
      }
      if (tab !== 'all') {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
      } else {
        setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, status: 'resolved' } : c));
      }
    } catch { /* silent */ }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !body.trim()) return;
    if (scheduleMode && !scheduledAt) { alert(i.inbxAlertSched); return; }
    setSending(true);
    try {
      if (scheduleMode) {
        await scheduleMessage(activeId, body.trim(), new Date(scheduledAt).toISOString());
        setBody(''); setScheduleMode(false); setScheduledAt('');
        const s = await getScheduledMessages(activeId);
        setScheduledMsgs(s);
      } else if (composerTab === 'message') {
        await sendMessage(activeId, body.trim(), replyToMsg?.id);
        setBody(''); setReplyToMsg(null);
        const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
        setMessages(m); setNotes(n);
        loadList(true); // silent — SSE already handles the optimistic update
      } else {
        await sendNote(activeId, body.trim());
        setBody(''); setMentionQuery(null);
        const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
        setMessages(m); setNotes(n);
      }
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
    finally { setSending(false); }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setPendingFile(file);
    // Don't clear caption — user may have already typed
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Focus textarea so user can type caption naturally
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function handleFileSend() {
    if (!pendingFile || !activeId) return;
    setSending(true);
    try {
      await uploadMessageFile(activeId, pendingFile, body.trim() || undefined);
      setBody('');
      const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
      setMessages(m); setNotes(n);
      loadList(true);
    } catch (err: unknown) { alert(err instanceof Error ? err.message : i.inbxErrUpload); }
    finally { setSending(false); setPendingFile(null); }
  }

  function startEditMsg(m: Message) {
    setEditingMsgId(m.id);
    setEditMsgText(m.body);
  }

  async function saveEditMsg() {
    if (!activeId || !editingMsgId || !editMsgText.trim()) return;
    try {
      const r = await editConversationMessage(activeId, editingMsgId, editMsgText.trim());
      setEditingMsgId(null); setEditMsgText('');
      const m = await getMessages(activeId); setMessages(m);
      if (r?.warning) alert(r.warning);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function deleteMsg(m: Message) {
    if (!activeId) return;
    const onlyHere = m.direction !== 'outbound';
    const msg = onlyHere
      ? '¿Eliminar este mensaje del CRM? (no afecta WhatsApp)'
      : '¿Eliminar este mensaje? Se borrará también para el cliente en WhatsApp.';
    if (!confirm(msg)) return;
    try {
      await deleteConversationMessage(activeId, m.id);
      const mm = await getMessages(activeId); setMessages(mm);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function startRecording() {
    if (!activeId || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      cancelRecordRef.current = false;
      mr.ondataavailable = (ev) => { if (ev.data.size) audioChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecording(false);
        setRecordSecs(0);
        if (cancelRecordRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        if (blob.size < 800) return;
        // .ogg name → server detects audio by extension regardless of mimetype; ffmpeg transcodes to mp3.
        const file = new File([blob], `voz-${Date.now()}.ogg`, { type: 'audio/ogg' });
        setSending(true);
        try {
          await uploadMessageFile(activeId, file, undefined, 'audio');
          const [m, n] = await Promise.all([getMessages(activeId), getNotes(activeId)]);
          setMessages(m); setNotes(n);
          loadList(true);
        } catch (err: unknown) { alert(err instanceof Error ? err.message : i.inbxErrUpload); }
        finally { setSending(false); }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    } catch {
      alert('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  }

  function stopRecording(cancel = false) {
    cancelRecordRef.current = cancel;
    mediaRecorderRef.current?.stop();
  }

  async function handleCancelScheduled(schedId: string) {
    if (!activeId || !confirm(i.inbxConfirmCancelSched)) return;
    await cancelScheduledMessage(activeId, schedId);
    setScheduledMsgs((prev) => prev.filter((s) => s.id !== schedId));
  }

  async function setStatus(status: string) {
    if (!activeId) return;
    try {
      await updateConversation(activeId, { status });
      setConv((p) => p ? { ...p, status } : p);
      setConversations((prev) => prev.map((c) => c.id === activeId ? { ...c, status } : c));
      if (tab !== 'all' && tab !== status) loadList(true);
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
      setNewContactId(''); setNewInboxId(''); setNewSubject(''); setNewChannel('email'); setContactSearch('');
      loadList();
      selectConv(created.id);
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); }
    finally { setCreating(false); }
  }

  function insertCanned(cr: CannedResponse) {
    const contact = listConv?.contact;
    const agentName = (() => { try { return JSON.parse(localStorage.getItem('user') ?? '{}').fullName ?? ''; } catch { return ''; } })();
    const today = new Date().toLocaleDateString(i.locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const resolved = cr.content
      .replace(/\{\{nombre_contacto\}\}/gi, contact?.fullName || contact?.email || '')
      .replace(/\{\{nombre\}\}/gi, contact?.fullName || contact?.email || '')
      .replace(/\{\{email_contacto\}\}/gi, contact?.email || '')
      .replace(/\{\{telefono_contacto\}\}/gi, contact?.phone || '')
      .replace(/\{\{agente\}\}/gi, agentName)
      .replace(/\{\{fecha\}\}/gi, today)
      .replace(/\{\{asunto\}\}/gi, conv?.subject || '')
      .replace(/\{\{canal\}\}/gi, conv?.channelType || '');
    setBody(resolved); setShowCanned(false); setCannedSearch('');
    textareaRef.current?.focus();
  }

  function clearFilters() {
    setFilterTag(''); setFilterInbox(''); setFilterStatus(''); setFilterAgent(''); setFilterQueue('');
  }

  function toggleSelectMode() {
    setSelectMode((s) => !s);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  }

  async function bulkAction(action: 'resolved' | 'pending' | 'open') {
    if (selectedIds.size === 0) return;
    setBulkWorking(true);
    try {
      await Promise.all([...selectedIds].map((id) => updateConversation(id, { status: action })));
      setConversations((prev) => prev.map((c) =>
        selectedIds.has(c.id) ? { ...c, status: action } : c
      ));
      if (tab !== 'all' && tab !== action) {
        setConversations((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      }
      setSelectedIds(new Set());
    } finally { setBulkWorking(false); }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar permanentemente ${selectedIds.size} conversación(es)? Esta acción no se puede deshacer.`)) return;
    setBulkWorking(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteConversation(id)));
      setConversations((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      if (activeId && selectedIds.has(activeId)) setActiveId(null);
      setSelectedIds(new Set());
    } finally { setBulkWorking(false); }
  }

  async function bulkAssignQueue(queueId: string) {
    if (selectedIds.size === 0 || !queueId) return;
    setBulkWorking(true);
    try {
      await Promise.all([...selectedIds].map((id) => assignConversation({ conversationId: id, queueId })));
      setSelectedIds(new Set());
      loadList();
    } finally { setBulkWorking(false); }
  }

  async function bulkAssignAgent(agentId: string) {
    if (selectedIds.size === 0 || !agentId) return;
    setBulkWorking(true);
    try {
      await Promise.all([...selectedIds].map((id) => assignConversation({ conversationId: id, userId: agentId })));
      setConversations((prev) => prev.map((c) =>
        selectedIds.has(c.id) ? { ...c, assignedTo: agentId } : c
      ));
      setSelectedIds(new Set());
    } finally { setBulkWorking(false); }
  }

  async function bulkAddTag(tagId: string) {
    if (selectedIds.size === 0 || !tagId) return;
    setBulkWorking(true);
    try {
      await Promise.all([...selectedIds].map((id) => addConversationTag(id, tagId)));
      setSelectedIds(new Set());
    } finally { setBulkWorking(false); }
  }

  const chatItems = composerTab === 'message' ? messages : notes;

  // In-conversation search matches (over the visible thread).
  const convSearchQ = convSearch.trim().toLowerCase();
  const convMatchIds = convSearchQ
    ? chatItems.filter((m) => m.contentType !== 'activity' && (m.body ?? '').toLowerCase().includes(convSearchQ)).map((m) => m.id)
    : [];
  const currentMatchId = convMatchIds[convMatchIdx] ?? null;
  const gotoMatch = (dir: 1 | -1) => {
    if (!convMatchIds.length) return;
    setConvMatchIdx((i) => (i + dir + convMatchIds.length) % convMatchIds.length);
  };
  // Traceability: which human agents actually replied in this conversation (distinct).
  const attendedBy = Array.from(new Set(
    messages
      .filter((m) => m.direction === 'outbound' && m.senderType === 'agent' && m.senderId)
      .map((m) => agents.find((a) => a.id === m.senderId)?.fullName)
      .filter(Boolean) as string[],
  ));
  const listConv = conversations.find((c) => c.id === activeId);
  const filteredCanned = cannedResponses.filter((cr) =>
    !cannedSearch || cr.title.toLowerCase().includes(cannedSearch.toLowerCase()) || cr.content.toLowerCase().includes(cannedSearch.toLowerCase())
  );

  // @mention autocomplete — filter agents by typed query
  const mentionSuggestions = mentionQuery !== null
    ? agents.filter((a) => a.fullName.toLowerCase().replace(/\s+/g, '').startsWith(mentionQuery.toLowerCase()))
    : [];

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    if (composerTab !== 'note') { setMentionQuery(null); return; }
    // Detect @word at cursor
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const m = before.match(/@([\w.]*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionCursor(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(agent: Agent) {
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const after  = body.slice(cursor);
    const prefix = before.replace(/@([\w.]*)$/, '');
    const handle = '@' + agent.fullName.replace(/\s+/g, '');
    setBody(prefix + handle + ' ' + after);
    setMentionQuery(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function renderBody(text: string) {
    if (!text) return null;

    // Call transcript format: body contains **Transcript:** with [Usuario]/[Bot] lines
    const transcriptIdx = text.indexOf('**Transcript:**');
    if (transcriptIdx !== -1) {
      const headerRaw = text.slice(0, transcriptIdx).trim().replace(/\*\*/g, '');
      const transcriptRaw = text.slice(transcriptIdx + '**Transcript:**'.length).trim();

      const turns: Array<{ role: 'user' | 'bot'; text: string }> = [];
      for (const line of transcriptRaw.split('\n')) {
        const u = line.match(/^\[Usuario\]:\s*(.+)/);
        const b = line.match(/^\[Bot\]:\s*(.+)/);
        if (u) turns.push({ role: 'user', text: u[1].trim() });
        else if (b) turns.push({ role: 'bot', text: b[1].trim() });
      }

      if (turns.length > 0) {
        return (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
              {headerRaw.split('\n').map((line, li) => <div key={li}>{line}</div>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {turns.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: t.role === 'bot' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, paddingLeft: t.role === 'user' ? 4 : 0, paddingRight: t.role === 'bot' ? 4 : 0 }}>
                    {t.role === 'bot' ? 'Bot' : 'Cliente'}
                  </div>
                  <div style={{
                    maxWidth: '82%',
                    padding: '6px 10px',
                    borderRadius: t.role === 'bot' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    background: t.role === 'bot' ? 'var(--primary)' : 'var(--surface)',
                    border: t.role === 'bot' ? 'none' : '1px solid var(--border)',
                    color: t.role === 'bot' ? '#fff' : 'var(--text)',
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }

    // Default: make URLs clickable and highlight @mentions. Line breaks are
    // preserved by the bubble's white-space: pre-wrap.
    const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|@[\w.]+)/g);
    return parts.map((p, pIdx) => {
      if (/^https?:\/\//i.test(p) || /^www\./i.test(p)) {
        const href = p.startsWith('http') ? p : `https://${p}`;
        return <a key={pIdx} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{p}</a>;
      }
      if (/^@[\w.]+$/.test(p)) {
        return <span key={pIdx} style={{ color: 'var(--primary)', fontWeight: 600 }}>{p}</span>;
      }
      return p;
    });
  }

  /** Short one-line preview of a message, for the "replying to" quote block. */
  function quotedPreview(body: string): string {
    if (!body) return '';
    if (/^\/uploads\/\S+/.test(body)) {
      const ext = (body.split('|')[0].split('.').pop() ?? '').toLowerCase();
      if (/^(jpe?g|png|gif|webp|bmp|heic)$/.test(ext)) return '🖼 ' + i.ctImage;
      if (/^(mp3|ogg|oga|m4a|wav|opus|aac)$/.test(ext)) return '🎤 ' + i.ctVoice;
      if (/^(mp4|mov|avi|webm|3gp)$/.test(ext)) return '🎬 ' + i.ctVideo;
      return '📎 ' + i.ctFile;
    }
    if (body.includes('**Transcript:**')) return '📞 ' + i.ctCall;
    return body.length > 90 ? body.slice(0, 90) + '…' : body;
  }

  return (
    <div className="inbox-layout" data-panel={mobilePanel}>

      {/* ── LEFT: List ──────────────────────────────────────────────────── */}
      <div className="inbox-sidebar">

        {/* Header */}
        <div className="inbox-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Inbox</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                title={selectMode ? i.inbxCancelSel : i.inbxSelectConvs}
                onClick={toggleSelectMode}
                style={{
                  padding: '4px 8px', borderRadius: 6, border: '1px solid',
                  borderColor: selectMode ? 'var(--primary)' : 'var(--border)',
                  background: selectMode ? '#eff6ff' : 'none',
                  color: selectMode ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 13,
                }}
              >☑</button>
              <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowNew(true)}>
                {i.inbxNew}
              </button>
            </div>
          </div>

          {/* Bulk actions bar */}
          {selectMode && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={selectedIds.size === filtered.length ? () => setSelectedIds(new Set()) : selectAll}
              >
                {selectedIds.size === filtered.length ? i.inbxDeselectAll : `✓ ${filtered.length} ${i.inbxSelCount}`}
              </button>
              {selectedIds.size > 0 && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>{selectedIds.size} {i.inbxSelCount}</span>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px', color: '#22c55e' }}
                    disabled={bulkWorking}
                    onClick={() => bulkAction('resolved')}
                  >{i.inbxResolveBtn}</button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px', color: '#f59e0b' }}
                    disabled={bulkWorking}
                    onClick={() => bulkAction('pending')}
                  >{i.inbxWaitBtn}</button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px', color: '#3b82f6' }}
                    disabled={bulkWorking}
                    onClick={() => bulkAction('open')}
                  >{i.inbxOpenBtn}</button>
                  {isAdmin && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444', borderColor: '#ef444433' }}
                      disabled={bulkWorking}
                      onClick={bulkDelete}
                    >🗑 {i.delete}</button>
                  )}
                  {agents.length > 0 && (
                    <select
                      className="form-input"
                      style={{ fontSize: 11, padding: '3px 6px' }}
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) bulkAssignAgent(e.target.value); e.target.value = ''; }}
                      disabled={bulkWorking}
                    >
                      <option value="">👤 {i.inbxAgentDots}</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                    </select>
                  )}
                  {queues.length > 0 && (
                    <select
                      className="form-input"
                      style={{ fontSize: 11, padding: '3px 6px' }}
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) bulkAssignQueue(e.target.value); e.target.value = ''; }}
                      disabled={bulkWorking}
                    >
                      <option value="">📬 {i.inbxQueueDots}</option>
                      {queues.filter((q) => q.isActive).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                  )}
                  {tags.length > 0 && (
                    <select
                      className="form-input"
                      style={{ fontSize: 11, padding: '3px 6px' }}
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) bulkAddTag(e.target.value); e.target.value = ''; }}
                      disabled={bulkWorking}
                    >
                      <option value="">🏷 {i.inbxTagDots}</option>
                      {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </>
              )}
            </div>
          )}
          {/* Status tabs */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { key: 'open', label: i.inbxServing },
              { key: 'pending', label: i.inbxWaiting },
              { key: 'resolved', label: i.inbxResolvedPl },
              { key: 'all', label: i.all },
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
              placeholder={i.inbxSearchHint}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {/* Mine toggle */}
            <button
              title={i.inbxMineOnly}
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
              title={i.inbxAdvFilters}
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
            <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{activeFiltersCount} {activeFiltersCount > 1 ? i.inbxActiveFilters : i.inbxActiveFilter}</span>
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 11 }}>× {i.inbxClear}</button>
          </div>
        )}

        {/* Conversation list */}
        <div className="inbox-conv-list">
          {/* Only blank out the list on the very first load (no conversations yet).
              While silently refreshing in background, keep the existing list visible. */}
          {loadingList && conversations.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>
          ) : listError ? (
            <div style={{ padding: 16, color: 'var(--danger)', fontSize: 12 }}>{listError}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              {search || activeFiltersCount > 0 || onlyMine ? i.noResults : i.inbxSelectConv}
            </div>
          ) : filtered.map((c) => {
            const smCls = STATUS_CSS[c.status] ?? 'status-open';
            const smLabel = statusLabels[c.status] ?? c.status;
            return (
              <div
                key={c.id}
                className={`inbox-conv-item${activeId === c.id ? ' active' : ''}${selectMode && selectedIds.has(c.id) ? ' selected' : ''}`}
                onClick={() => selectMode ? toggleSelect(c.id) : selectConv(c.id)}
                style={selectMode ? { cursor: 'default' } : undefined}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginBottom: 4, accentColor: 'var(--primary)' }}
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                  <div className="inbox-conv-item-name" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {CHANNEL_ICONS[c.channelType] ?? '💬'}{' '}
                    {c.isGroup ? (
                      <>
                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontWeight: 700, lineHeight: 1.4 }}>👥</span>
                        <span>{c.subject || c.contact?.fullName || i.noContact}</span>
                      </>
                    ) : c.contact?.id ? (
                      <Link
                        href={`/contacts/${c.contact.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        {c.contact.fullName || c.contact.email}
                      </Link>
                    ) : (c.contact?.fullName || c.contact?.email || i.noContact)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {/* Unread badge */}
                    {(unreadMap[c.id] ?? 0) > 0 && (
                      <span style={{
                        background: '#ef4444', color: '#fff', borderRadius: '50%',
                        minWidth: 18, height: 18, fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 3px', lineHeight: 1,
                      }}>
                        {unreadMap[c.id] > 9 ? '9+' : unreadMap[c.id]}
                      </span>
                    )}
                    <span className="inbox-conv-item-time">{timeAgo(c.lastMessageAt || c.updatedAt, i.inbxNow, i.locale)}</span>
                    {c.status !== 'resolved' && (
                      <button
                        title={i.inbxMarkResolved}
                        onClick={(e) => resolveQuick(e, c.id)}
                        style={{
                          background: 'none', border: '1px solid transparent', borderRadius: 4,
                          cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13,
                          padding: '0px 3px', lineHeight: 1, flexShrink: 0,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#22c55e';
                          e.currentTarget.style.color = '#22c55e';
                          e.currentTarget.style.background = '#f0fdf4';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-muted)';
                          e.currentTarget.style.background = 'none';
                        }}
                      >✓</button>
                    )}
                  </div>
                </div>
                <div className="inbox-conv-item-subject">{c.subject || i.noSubject}</div>
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
                  <span className={`inbox-status-badge ${smCls}`}>{smLabel}</span>
                  {(c.status === 'open' || c.status === 'pending') && (() => {
                    const waitMs = Date.now() - new Date(c.lastMessageAt || c.updatedAt).getTime();
                    const waitMin = waitMs / 60000;
                    if (waitMin < 60) return null;
                    const isRed = waitMin >= 240;
                    const label = waitMin >= 1440 ? `${Math.floor(waitMin / 1440)}d` : waitMin >= 60 ? `${Math.floor(waitMin / 60)}h` : `${Math.floor(waitMin)}m`;
                    return (
                      <span title={`${i.inbxNoActivity} ${label}`} style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                        background: isRed ? '#fee2e2' : '#fef3c7',
                        color: isRed ? '#b91c1c' : '#92400e',
                        border: `1px solid ${isRed ? '#fca5a5' : '#fde68a'}`,
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                      }}>
                        ⏱ {label}
                      </span>
                    );
                  })()}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {c.inbox?.name && <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.inbox.name}</span>}
                    {/* Peek button — preview without opening */}
                    <button
                      title={i.inbxPreview}
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
            <button
              onClick={() => setMobilePanel('list')}
              style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text)', padding: '0 8px 0 0', flexShrink: 0 }}
              className="mobile-back-btn"
              aria-label="Volver"
            >←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                {conv.isGroup && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontWeight: 700, flexShrink: 0 }}>👥 Grupo</span>
                )}
                {conv.isGroup ? (
                  conv.subject || listConv?.contact?.fullName || i.noContact
                ) : listConv?.contact?.id ? (
                  <Link href={`/contacts/${listConv.contact.id}`} style={{ color: 'inherit', textDecoration: 'none' }}
                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                    {listConv.contact.fullName || listConv.contact.email}
                  </Link>
                ) : (listConv?.contact?.fullName || listConv?.contact?.email || i.noContact)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {CHANNEL_ICONS[conv.channelType] ?? ''} {conv.subject || i.noSubject}
                {listConv?.inbox?.name && <span style={{ marginLeft: 6, opacity: .7 }}>· {listConv.inbox.name}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button
                className="btn btn-secondary mobile-detail-btn"
                style={{ fontSize: 16, padding: '4px 8px', display: 'none' }}
                title="Ver detalles"
                onClick={() => setMobilePanel('detail')}
              >ℹ️</button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 13, padding: '4px 9px' }}
                title={lang === 'en' ? 'Search in conversation' : 'Buscar en la conversación'}
                onClick={() => { setConvSearchOpen((o) => !o); setConvSearch(''); setConvMatchIdx(0); }}
              >🔍</button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                title={i.inbxExportPdf}
                onClick={() => exportConversationPdf(conv, listConv?.contact ?? null, messages, i)}
              >⬇ PDF</button>
              <span className={`inbox-status-badge ${STATUS_CSS[conv.status] ?? 'status-open'}`}>
                {statusLabels[conv.status] ?? conv.status}
              </span>
              {conv.status !== 'resolved' && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setStatus('resolved')}>{i.inbxResolveBtn}</button>
              )}
              {conv.status === 'resolved' && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setStatus('open')}>{i.inbxReopen}</button>
              )}
              {conv.status === 'resolved' && !csatSent[activeId!] && (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px', color: '#f59e0b', borderColor: '#f59e0b' }}
                  onClick={async () => {
                    try {
                      const { surveyUrl } = await requestCsat(activeId!);
                      // Send the survey link as a message so it reaches the customer via WhatsApp/FB/etc.
                      const fullUrl = `${window.location.origin}${surveyUrl}`;
                      const surveyMsg = `⭐ ¿Cómo fue tu experiencia con nosotros? Tu opinión nos ayuda a mejorar. Por favor califica nuestro servicio (toma 10 segundos):\n${fullUrl}`;
                      await sendMessage(activeId!, surveyMsg);
                      const [m, n] = await Promise.all([getMessages(activeId!), getNotes(activeId!)]);
                      setMessages(m); setNotes(n);
                      setCsatSent((p) => ({ ...p, [activeId!]: true }));
                    } catch { alert(i.inbxErrSurvey); }
                  }}
                >{i.inbxSurvey}</button>
              )}
              {conv.status === 'resolved' && csatSent[activeId!] && (
                <span style={{ fontSize: 11, color: '#22c55e', padding: '4px 6px' }}>{i.inbxSurveySent}</span>
              )}
              {conv.status === 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setStatus('pending')}>{i.inbxPutWait}</button>
              )}
            </div>
          </div>

          {/* In-conversation search bar */}
          {convSearchOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <input
                className="form-input"
                autoFocus
                value={convSearch}
                onChange={(e) => { setConvSearch(e.target.value); setConvMatchIdx(0); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { setConvSearchOpen(false); setConvSearch(''); } }}
                placeholder={lang === 'en' ? 'Search in this conversation…' : 'Buscar en esta conversación…'}
                style={{ flex: 1, fontSize: 13, padding: '5px 10px' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 48, textAlign: 'center' }}>
                {convSearchQ ? `${convMatchIds.length ? convMatchIdx + 1 : 0}/${convMatchIds.length}` : ''}
              </span>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} disabled={!convMatchIds.length} title={lang === 'en' ? 'Previous' : 'Anterior'} onClick={() => gotoMatch(-1)}>▲</button>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} disabled={!convMatchIds.length} title={lang === 'en' ? 'Next' : 'Siguiente'} onClick={() => gotoMatch(1)}>▼</button>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} title={lang === 'en' ? 'Close' : 'Cerrar'} onClick={() => { setConvSearchOpen(false); setConvSearch(''); }}>✕</button>
            </div>
          )}

          {/* Thread */}
          <div className="inbox-chat-body" ref={threadRef}>
            {loadingChat ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>
            ) : chatItems.length === 0 && scheduledMsgs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
                {composerTab === 'message' ? i.inbxNoMsgsYet : i.inbxNoNotesYet}
              </div>
            ) : (
              <>
                {chatItems.map((m) => {
                  if (m.contentType === 'activity') {
                    return (
                      <div key={m.id} className="msg-activity">
                        <span className="msg-activity-label">{m.body}</span>
                        <span className="msg-activity-time">
                          {m.createdAt ? new Date(m.createdAt).toLocaleString(i.locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
                        </span>
                      </div>
                    );
                  }
                  // Effective type: infer from a "/uploads/x.ext|..." body if the
                  // stored contentType is missing/text (e.g. optimistic snake_case render).
                  let ctype = m.contentType;
                  if ((!ctype || ctype === 'text') && /^\/uploads\/\S+\|/.test(m.body ?? '')) {
                    const ext = (m.body.split('|')[0].split('.').pop() ?? '').toLowerCase();
                    ctype = /^(jpe?g|png|gif|webp|bmp|heic)$/.test(ext) ? 'image'
                      : /^(mp3|ogg|oga|m4a|wav|opus|aac)$/.test(ext) ? 'audio'
                      : /^(mp4|mov|avi|webm|3gp)$/.test(ext) ? 'video' : 'file';
                  }
                  const isFile = ctype === 'image' || ctype === 'audio' || ctype === 'video' || ctype === 'file';
                  let fileUrl = ''; let fileName = ''; let fileCaption = '';
                  if (isFile && m.body?.includes('|')) { const _p = m.body.split('|'); fileUrl = _p[0]; fileName = _p[1] ?? ''; fileCaption = _p.slice(2).join('|'); }
                  else if (isFile) { fileUrl = m.body; fileName = m.body.split('/').pop() ?? 'archivo'; }
                  const isTranscript = !isFile && m.body?.includes('**Transcript:**');
                  return (
                    <div key={m.id} ref={(el) => { msgRefs.current[m.id] = el; }} className={`msg ${m.isPrivate ? 'msg-note' : m.direction === 'outbound' ? 'msg-out' : 'msg-in'}`} style={isTranscript ? { maxWidth: '95%', alignSelf: 'stretch' } : undefined}>
                      <div className="msg-bubble" style={{ ...(isTranscript ? { background: 'transparent', border: '1px solid var(--border)', padding: '12px 14px' } : {}), ...(m.id === currentMatchId ? { outline: '2px solid #f59e0b', outlineOffset: '1px' } : {}) }}>
                        {m.replyToMessageId && (() => {
                          const orig = messages.find((x) => x.id === m.replyToMessageId);
                          return (
                            <div style={{ borderLeft: '3px solid currentColor', padding: '2px 8px', marginBottom: 5, background: 'rgba(0,0,0,.12)', borderRadius: 4, fontSize: 12, opacity: 0.85, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ↩ {orig ? quotedPreview(orig.body) : '…'}
                            </div>
                          );
                        })()}
                        {m.deletedAt ? (
                          <span style={{ fontStyle: 'italic', opacity: 0.7 }}>🚫 Mensaje eliminado</span>
                        ) : editingMsgId === m.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            <textarea
                              value={editMsgText}
                              onChange={(e) => setEditMsgText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditMsg(); } if (e.key === 'Escape') { setEditingMsgId(null); setEditMsgText(''); } }}
                              rows={1} autoFocus
                              style={{ resize: 'none', minWidth: 180, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 14 }}
                            />
                            <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={saveEditMsg}>✓</button>
                            <button className="btn btn-ghost" style={{ padding: '4px 6px', fontSize: 12 }} onClick={() => { setEditingMsgId(null); setEditMsgText(''); }}>✕</button>
                          </div>
                        ) : (<>
                        {ctype === 'image' && fileUrl ? (
                          <a href={`${API_URL}${fileUrl}`} target="_blank" rel="noopener">
                            <img src={`${API_URL}${fileUrl}`} alt={fileName} style={{ maxWidth: 220, maxHeight: 200, borderRadius: 6, display: 'block' }} />
                          </a>
                        ) : ctype === 'audio' && fileUrl ? (
                          <audio
                            key={`audio-${m.id}`}
                            controls
                            src={`${API_URL}${fileUrl}`}
                            style={{ maxWidth: 220 }}
                            preload="metadata"
                            onError={(e) => {
                              // If the file fails to load, swap src to force a fresh fetch
                              const el = e.currentTarget;
                              if (!el.dataset.retried) {
                                el.dataset.retried = '1';
                                const orig = el.src;
                                el.src = '';
                                setTimeout(() => { el.src = orig; el.load(); }, 800);
                              }
                            }}
                          />
                        ) : ctype === 'video' && fileUrl ? (
                          <video controls src={`${API_URL}${fileUrl}`} style={{ maxWidth: 220, borderRadius: 6 }} />
                        ) : ctype === 'file' && fileUrl && /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(fileName) ? (
                          <a href={`${API_URL}${fileUrl}`} target="_blank" rel="noopener">
                            <img src={`${API_URL}${fileUrl}`} alt={fileName} style={{ maxWidth: 220, maxHeight: 200, borderRadius: 6, display: 'block' }} />
                          </a>
                        ) : ctype === 'file' && fileUrl ? (
                          <a href={`${API_URL}${fileUrl}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none' }}>
                            📎 <span style={{ textDecoration: 'underline', wordBreak: 'break-all' }}>{fileName}</span>
                          </a>
                        ) : renderBody(m.body)}
                        {isFile && fileCaption && (
                          <div style={{ marginTop: 5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fileCaption}</div>
                        )}
                        </>)}
                      </div>
                      <div className="msg-time" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                        <span>
                          {m.createdAt ? new Date(m.createdAt).toLocaleString(i.locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
                          {m.editedAt && !m.deletedAt ? ' · editado' : ''}
                        </span>
                        {m.direction === 'outbound' && conv?.channelType?.startsWith('whatsapp') && (
                          <span title={m.status} style={{ fontSize: 12, lineHeight: 1 }}>
                            {m.status === 'read'      ? <span style={{ color: '#3b82f6' }}>✓✓</span>
                           : m.status === 'delivered' ? <span style={{ color: 'var(--text-muted)' }}>✓✓</span>
                           :                            <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>✓</span>}
                          </span>
                        )}
                        {!m.isPrivate && !m.deletedAt && editingMsgId !== m.id && m.contentType !== 'activity' && (
                          <span className="msg-actions" style={{ display: 'inline-flex', gap: 6 }}>
                            {!isTranscript && (
                              <button onClick={() => { setReplyToMsg(m); setComposerTab('message'); textareaRef.current?.focus(); }} title={i.inbxReply} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0 }}>↩</button>
                            )}
                            {m.direction === 'outbound' && !fileUrl && (
                              <button onClick={() => startEditMsg(m)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0 }}>✎</button>
                            )}
                            <button onClick={() => deleteMsg(m)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0 }}>🗑</button>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {composerTab === 'message' && scheduledMsgs.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      🕐 {i.inbxScheduled} ({scheduledMsgs.length})
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
                            <span>🕐 {new Date(s.scheduled_at).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            {s.author_name && <span>· {s.author_name}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelScheduled(s.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}
                          title={i.inbxCancelSchedBtn}
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
                {i.inbxMsgTab}
              </button>
              <button
                className="composer-tab"
                style={composerTab === 'note' ? { background: '#fef9c3', borderColor: '#fde047', color: '#713f12' } : {}}
                onClick={() => setComposerTab('note')}
              >
                📝 {i.inbxNoteTab}
              </button>
            </div>
            <form onSubmit={handleSend} style={{ position: 'relative' }}>
              {/* Replying-to (quote) bar */}
              {replyToMsg && composerTab === 'message' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 6, borderLeft: '3px solid var(--primary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <span style={{ fontSize: 14 }}>↩</span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {quotedPreview(replyToMsg.body)}
                  </div>
                  <button type="button" onClick={() => setReplyToMsg(null)} title={i.inbxCancelReply} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)' }}>✕</button>
                </div>
              )}
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
                    <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>{i.noResults}</div>
                  ) : filteredCanned.map((cr) => (
                    <div key={cr.id} className="quick-resp-item" onClick={() => insertCanned(cr)}>
                      <div className="quick-resp-item-title">
                        {cr.category && <span style={{ color: 'var(--primary)', marginRight: 4 }}>[{cr.category}]</span>}
                        {cr.title}
                      </div>
                      <div className="quick-resp-item-preview">{cr.content}</div>
                    </div>
                  ))}
                  <div style={{
                    padding: '6px 10px', borderTop: '1px solid var(--border)',
                    background: 'var(--bg-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 8px',
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: '100%', marginBottom: 2 }}>{i.inbxVarsAvail}</span>
                    {['{{nombre_contacto}}','{{email_contacto}}','{{telefono_contacto}}','{{agente}}','{{fecha}}','{{asunto}}','{{canal}}'].map(v => (
                      <code key={v} style={{
                        fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 3, padding: '1px 4px', color: 'var(--primary)', cursor: 'pointer',
                      }} title={i.inbxClickCopy} onClick={() => navigator.clipboard?.writeText(v).catch(() => {})}>{v}</code>
                    ))}
                  </div>
                </div>
              )}
              {/* @mention autocomplete dropdown */}
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,.15)', overflow: 'hidden', marginBottom: 4,
                }}>
                  {mentionSuggestions.slice(0, 6).map((a, aIdx) => (
                    <div
                      key={a.id}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(a); }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: aIdx === mentionCursor ? 'var(--primary)' : 'transparent',
                        color: aIdx === mentionCursor ? '#fff' : 'var(--text)',
                      }}
                      onMouseEnter={() => setMentionCursor(aIdx)}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: aIdx === mentionCursor ? 'rgba(255,255,255,0.25)' : 'var(--primary)',
                        color: aIdx === mentionCursor ? '#fff' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {a.fullName.charAt(0).toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 500 }}>{a.fullName}</span>
                      <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 'auto' }}>@{a.fullName.replace(/\s+/g, '')}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* File chip — shown when a file is staged */}
              {pendingFile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                  background: 'var(--bg-hover, #f1f5f9)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '6px 10px',
                }}>
                  <span style={{ fontSize: 18 }}>
                    {/\.(jpg|jpeg|png|gif|webp)$/i.test(pendingFile.name) ? '🖼️'
                      : /\.(mp3|ogg|wav|m4a|opus)$/i.test(pendingFile.name) ? '🎵'
                      : /\.(mp4|mov|avi|webm)$/i.test(pendingFile.name) ? '🎬'
                      : /\.pdf$/i.test(pendingFile.name) ? '📄' : '📎'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(pendingFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button type="button" onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '2px 4px' }}>✕</button>
                </div>
              )}
              {/* Voice recording bar */}
              {recording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #ef4444', background: 'var(--bg-hover, #fef2f2)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>
                    Grabando nota de voz… {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => stopRecording(true)} title="Cancelar"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
                    <button type="button" onClick={() => stopRecording(false)} title="Enviar nota de voz"
                      style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 14 }}>➤</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {/* Hidden file input */}
                <input ref={fileInputRef} type="file" accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                {composerTab === 'message' && (
                  <button
                    type="button"
                    title={i.inbxAttach}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || recording}
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, flexShrink: 0, alignSelf: 'flex-end',
                    }}
                  >📎</button>
                )}
                {composerTab === 'message' && (
                  <button
                    type="button"
                    title="Grabar nota de voz"
                    onClick={startRecording}
                    disabled={sending || recording}
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                      background: recording ? '#fee2e2' : 'none', color: recording ? '#ef4444' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, flexShrink: 0, alignSelf: 'flex-end',
                    }}
                  >🎤</button>
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
                    title={i.inbxAiTitle}
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
                  placeholder={pendingFile
                    ? (composerTab === 'message' ? 'Escribe un mensaje con el archivo… (opcional)' : i.inbxNoteHint)
                    : composerTab === 'message'
                    ? (scheduleMode ? i.inbxScheduleMsg : i.inbxMsgHint)
                    : i.inbxNoteHint}
                  value={body}
                  onChange={handleBodyChange}
                  onKeyDown={(e) => {
                    if (mentionQuery !== null && mentionSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionCursor((c) => Math.min(c + 1, mentionSuggestions.length - 1)); return; }
                      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionCursor((c) => Math.max(c - 1, 0)); return; }
                      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionCursor]); return; }
                      if (e.key === 'Escape') { setMentionQuery(null); return; }
                    }
                    if (e.key === 'Enter' && !e.shiftKey && !scheduleMode && !isTouchDevice()) { e.preventDefault(); if (pendingFile) handleFileSend(); else handleSend(e as any); }
                    if (e.key === 'Escape') setShowCanned(false);
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'flex-end', flexShrink: 0 }}>
                  {/* Schedule toggle — only for outbound messages */}
                  {composerTab === 'message' && (
                    <button
                      type="button"
                      title={scheduleMode ? i.inbxCancelSchedule : i.inbxScheduleFor}
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
                    type={pendingFile ? 'button' : 'submit'}
                    className="btn btn-primary"
                    disabled={sending || (!pendingFile && (!body.trim() || (scheduleMode && !scheduledAt)))}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={pendingFile ? handleFileSend : undefined}
                  >{sending ? '…' : scheduleMode ? i.inbxScheduleBtn : i.send}</button>
                </div>
              </div>
              {/* Schedule datetime picker */}
              {scheduleMode && composerTab === 'message' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '8px 10px', background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a' }}>
                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600, whiteSpace: 'nowrap' }}>🕐 {i.inbxSendAt}</span>
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
          <div style={{ fontSize: 14, fontWeight: 500 }}>{i.inbxSelectConv}</div>
          <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-muted)' }}>{i.inbxCreateToStart}</div>
        </div>
      )}

      {/* ── RIGHT: Detail panel ──────────────────────────────────────────── */}
      {activeId && conv && listConv && (
        <div className="inbox-detail">

          {/* Mobile back button */}
          <div className="mobile-detail-back" style={{ display: 'none', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 8 }}>
            <button onClick={() => setMobilePanel('chat')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text)', padding: 0 }}>←</button>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Detalles</span>
          </div>

          {/* Contact */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">{i.inbxContactSect}</div>
            {listConv.contact ? (
              <>
                <div className="inbox-detail-row">
                  <span className="inbox-detail-label">{i.name}</span>
                  <Link href={`/contacts/${listConv.contact.id}`}
                    style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                    {listConv.contact.fullName} ↗
                  </Link>
                </div>
                {listConv.contact.email && (
                  <div className="inbox-detail-row">
                    <span className="inbox-detail-label">{i.email}</span>
                    <span className="inbox-detail-value" style={{ fontSize: 12 }}>{listConv.contact.email}</span>
                  </div>
                )}
                {listConv.contact.phone && !listConv.contact.phone.startsWith('lid:') && (
                  <div className="inbox-detail-row">
                    <span className="inbox-detail-label">{i.phone}</span>
                    <span className="inbox-detail-value" style={{ fontSize: 12 }}>{listConv.contact.phone}</span>
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.inbxNoContactAsgn}</span>
            )}
          </div>

          {/* Contact Timeline */}
          {listConv?.contact && timeline && (
            <div className="inbox-detail-section">
              <button
                onClick={() => setTimelineOpen((o) => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span className="inbox-detail-section-title" style={{ marginBottom: 0 }}>{i.inbxContactHistory}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timelineOpen ? '▲' : '▼'}</span>
              </button>
              {timelineOpen && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Conversations */}
                  {timeline.conversations.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>{i.inbxConvSect}</div>
                      {timeline.conversations.map((c) => (
                        <div key={c.id}
                          onClick={() => selectConv(c.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', marginBottom: 2 }}
                          onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontSize: 12 }}>{CHANNEL_ICONS[c.channel_type] ?? '💬'}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.subject || i.noSubject}
                            </span>
                            {c.last_message && (
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.last_message}
                              </span>
                            )}
                          </span>
                          <span className={`inbox-status-badge ${STATUS_CSS[c.status] ?? 'status-open'}`} style={{ fontSize: 10, padding: '1px 6px', flexShrink: 0 }}>
                            {statusLabels[c.status] ?? c.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Deals */}
                  {timeline.deals.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Deals</div>
                      {timeline.deals.map((d) => (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12 }}>💼</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                              {d.value > 0 ? `${d.value} ${d.currency}` : ''}{d.stage_name ? ` · ${d.stage_name}` : ''}
                            </span>
                          </span>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, flexShrink: 0, background: d.status === 'won' ? '#dcfce7' : d.status === 'lost' ? '#fee2e2' : 'var(--surface)', color: d.status === 'won' ? '#166534' : d.status === 'lost' ? '#991b1b' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            {d.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tasks */}
                  {timeline.tasks.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>{i.tasks}</div>
                      {timeline.tasks.map((t) => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12 }}>{t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '📋'}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'completed' ? 'line-through' : 'none', opacity: t.status === 'completed' ? 0.6 : 1 }}>{t.title}</span>
                            {t.due_date && (
                              <span style={{ display: 'block', fontSize: 11, color: new Date(t.due_date) < new Date() && t.status !== 'completed' ? '#ef4444' : 'var(--text-muted)' }}>
                                {i.inbxDueOn} {new Date(t.due_date).toLocaleDateString(i.locale, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {timeline.conversations.length === 0 && timeline.deals.length === 0 && timeline.tasks.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.inbxNoPrevHistory}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Custom fields for conversation */}
          {activeId && (
            <div className="inbox-detail-section">
              <CustomFieldsPanel entityType="conversation" entityId={activeId} />
            </div>
          )}

          {/* Conversation */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">{i.inbxConvSect}</div>
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">{i.status}</span>
              <span className={`inbox-status-badge ${STATUS_CSS[conv.status] ?? 'status-open'}`} style={{ marginTop: 2 }}>
                {statusLabels[conv.status] ?? conv.status}
              </span>
            </div>
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">{i.channelLabel}</span>
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
                <span className="inbox-detail-label">{i.inbxAgent}</span>
                <span className="inbox-detail-value">{listConv.assignedAgent.fullName}</span>
              </div>
            )}
            {attendedBy.length > 0 && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">{lang === 'en' ? 'Attended by' : 'Atendido por'}</span>
                <span className="inbox-detail-value">{attendedBy.join(', ')}</span>
              </div>
            )}
            {conv.teamId && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">{i.inbxTeam}</span>
                <span className="inbox-detail-value" style={{ color: teams.find(t => t.id === conv.teamId)?.color ?? 'inherit', fontWeight: 600 }}>
                  {teams.find(t => t.id === conv.teamId)?.name ?? conv.teamId}
                </span>
              </div>
            )}
            {conv.queueId && (
              <div className="inbox-detail-row">
                <span className="inbox-detail-label">{i.queueLabel}</span>
                <span className="inbox-detail-value">{queues.find(q => q.id === conv.queueId)?.name ?? conv.queueId}</span>
              </div>
            )}
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">{i.inbxMsgsLbl}</span>
              <span className="inbox-detail-value">{messages.length} {i.inbxMsgsUnit} · {notes.length} {i.inbxNoteTab}</span>
            </div>
            <div className="inbox-detail-row">
              <span className="inbox-detail-label">{i.createdAt}</span>
              <span className="inbox-detail-value" style={{ fontSize: 12 }}>
                {new Date(conv.createdAt).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">{i.actions}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conv.status !== 'resolved' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('resolved')}>
                  {i.inbxMarkResolved}
                </button>
              )}
              {conv.status !== 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('open')}>
                  {i.inbxReopen}
                </button>
              )}
              {conv.status === 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('pending')}>
                  {i.inbxPutWait}
                </button>
              )}
              {conv.status === 'open' && (
                <button className="btn btn-secondary" style={{ fontSize: 12, justifyContent: 'center' }} onClick={() => setStatus('snoozed')}>
                  {i.inbxSnooze}
                </button>
              )}
              {conv.status === 'resolved' && isAdmin && (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, justifyContent: 'center', color: '#ef4444', borderColor: '#ef444433' }}
                  onClick={async () => {
                    if (!activeId) return;
                    if (!confirm('¿Eliminar esta conversación permanentemente? Esta acción no se puede deshacer.')) return;
                    await deleteConversation(activeId);
                    setActiveId(null);
                    loadList();
                  }}
                >🗑 {'Eliminar conversación'}</button>
              )}
            </div>
          </div>

          {/* Assignment: Team + Queue + Agent */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">{i.inbxAssignSect}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Team */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{i.inbxTeam}</div>
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
                    } catch { alert(i.inbxErrTeam); }
                  }}
                >
                  <option value="">{i.inbxNoTeam}</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {/* Queue */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{i.queueLabel}</div>
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
                    } catch { alert(i.inbxErrQueue); }
                  }}
                >
                  <option value="">{i.inbxNoQueue}</option>
                  {queues.filter(q => q.isActive).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
              {/* Agent */}
              {agents.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{i.inbxAgent}</div>
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
                      } catch { alert(i.inbxErrAgent); }
                    }}
                  >
                    <option value="">— {i.unassigned} —</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Bot session */}
          {botSession && (
            <div className="inbox-detail-section">
              <div className="inbox-detail-section-title">{i.inbxBotSect}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: botSession.status === 'active' ? '#dcfce7' : '#fef9c3',
                    color: botSession.status === 'active' ? '#15803d' : '#92400e',
                    border: `1px solid ${botSession.status === 'active' ? '#86efac' : '#fde047'}`,
                  }}>
                    {botSession.status === 'active' ? i.inbxBotActive : i.inbxHumanAgent}
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
                    {i.inbxTakeOver}
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
                    {i.inbxRestoreBot}
                  </button>
                )}
                {botSession.handed_off_at && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {i.inbxHandedOff}: {new Date(botSession.handed_off_at).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title">{i.inbxTagsSect}</div>
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
                    title={i.inbxRemoveTag}
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
                <option value="">+ {i.inbxAddTag}</option>
                {tags.filter((t) => !convTags.some((ct) => ct.id === t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {tags.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.inbxNoTags}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Nueva conversación ────────────────────────────────────── */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{i.inbxNewConvTitle}</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group">
                  <label className="form-label">{i.inbxSubjectLbl}</label>
                  <input className="form-input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder={i.inbxSubjectPh} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">{i.channelLabel}</label>
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
                  <label className="form-label">{i.contactLabel}</label>
                  <input
                    className="form-input"
                    placeholder="🔍 Buscar contacto..."
                    value={contactSearch}
                    onChange={(e) => { setContactSearch(e.target.value); setNewContactId(''); }}
                    style={{ marginBottom: 4 }}
                  />
                  <select
                    className="form-input"
                    value={newContactId}
                    onChange={(e) => {
                      setNewContactId(e.target.value);
                      const c = contacts.find((x) => x.id === e.target.value);
                      if (c) setContactSearch(c.fullName ?? '');
                    }}
                    size={Math.min(6, contacts.length + 1)}
                    style={{ height: 'auto' }}
                  >
                    <option value="">— {i.noContact} —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}{c.phone ? ` · ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Inbox</label>
                  <select className="form-input" value={newInboxId} onChange={(e) => setNewInboxId(e.target.value)}>
                    <option value="">— {i.inbxNoInboxOpt} —</option>
                    {inboxes
                      .filter((inb) => inb.isEnabled !== false)
                      .filter((inb, idx, arr) => idx === arr.findIndex((x) => x.name === inb.name && x.channelType === inb.channelType))
                      .map((inb) => <option key={inb.id} value={inb.id}>{inb.name} ({inb.channelType})</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? i.creating : i.create}</button>
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

      {/* Mention toast */}
      {mentionToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '12px 20px',
          borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          boxShadow: '0 4px 20px rgba(0,0,0,.3)', zIndex: 9998,
          maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
          animation: 'fadeInUp .2s ease',
        }}>
          {mentionToast}
        </div>
      )}
    </div>
  );
}
