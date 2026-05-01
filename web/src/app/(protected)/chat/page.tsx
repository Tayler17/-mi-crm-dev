'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getMyChats, createOrFindDm, getChatMessages, sendChatMessage, markChatRead,
  getAgents, InternalChat, ChatMessage, Agent,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

function getStoredUserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.id || '';
  } catch { return ''; }
}

function timeAgo(dateStr: string, locale: string, justNow: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return justNow;
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function formatTime(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function initials(name?: string, email?: string) {
  const n = name || email || '?';
  return n.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase();
}

function Avatar({ name, email, size = 32 }: { name?: string; email?: string; size?: number }) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
  const str = name || email || '?';
  const color = colors[str.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name, email)}
    </div>
  );
}

function getChatPeer(chat: InternalChat, myId: string): { id: string; name: string; email: string } {
  const peer = chat.memberDetails?.find((m) => m.id !== myId);
  return { id: peer?.id ?? '', name: peer?.full_name ?? peer?.email ?? '?', email: peer?.email ?? '' };
}

export default function ChatPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const myId = getStoredUserId();
  const [chats, setChats] = useState<InternalChat[]>([]);
  const [activeChat, setActiveChat] = useState<InternalChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat'>('list');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChats = useCallback(async () => {
    try { const data = await getMyChats(); setChats(data); } catch {}
  }, []);

  const loadMessages = useCallback(async (chatId: string, silent = false) => {
    if (!silent) setLoadingMsgs(true);
    try {
      const data = await getChatMessages(chatId);
      setMessages(data);
      await markChatRead(chatId);
      setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
    } catch {} finally {
      if (!silent) setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    loadChats().finally(() => setLoadingChats(false));
    getAgents().then(setAgents).catch(() => {});
  }, [loadChats]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeChat) return;
    pollRef.current = setInterval(() => {
      loadMessages(activeChat.id, true);
      loadChats();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChat, loadMessages, loadChats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function openChat(chat: InternalChat) {
    setActiveChat(chat);
    setMobilePanel('chat');
    await loadMessages(chat.id);
  }

  async function handleSend() {
    if (!input.trim() || !activeChat || sending) return;
    const body = input.trim();
    setInput('');
    setSending(true);
    try {
      const msg = await sendChatMessage(activeChat.id, body);
      setMessages((prev) => [...prev, msg]);
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? { ...c, lastMessage: { body, senderId: myId, createdAt: msg.createdAt }, updatedAt: msg.createdAt }
            : c,
        ),
      );
    } catch {} finally { setSending(false); }
  }

  async function startDm(agent: Agent) {
    setShowNewDm(false);
    setAgentSearch('');
    try {
      const chat = await createOrFindDm(agent.id);
      await loadChats();
      if (chat) openChat(chat as any);
    } catch {}
  }

  const filteredAgents = agents.filter(
    (a) => a.id !== myId && (
      a.fullName.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.email.toLowerCase().includes(agentSearch.toLowerCase())
    ),
  );

  const peer = activeChat ? getChatPeer(activeChat, myId) : null;

  return (
    <div className="chat-layout" data-panel={mobilePanel} style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'fixed', top: 0, left: 'var(--sidebar-w, 220px)', right: 0, bottom: 0 }}>

      {/* Left: chat list */}
      <div className="chat-list-panel" style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', flexShrink: 0 }}>
        <div style={{ padding: '16px 12px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{i.chatInternalTitle}</span>
          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setShowNewDm(true)}>
            {i.newChatBtn}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingChats ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>{i.loading}</div>
          ) : chats.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              {i.noChats}
            </div>
          ) : (
            chats.map((chat) => {
              const p = getChatPeer(chat, myId);
              const isActive = activeChat?.id === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => openChat(chat)}
                  style={{
                    padding: '10px 12px', cursor: 'pointer',
                    background: isActive ? 'var(--primary-light, #ede9fe)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', gap: 10, alignItems: 'center',
                  }}
                >
                  <Avatar name={p.name} email={p.email} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      {chat.lastMessage && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }}>
                          {timeAgo(chat.lastMessage.createdAt, i.locale, i.justNow)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {chat.lastMessage ? (
                          <>
                            {chat.lastMessage.senderId === myId ? i.youPrefix : ''}
                            {chat.lastMessage.body.length > 30
                              ? chat.lastMessage.body.substring(0, 30) + '…'
                              : chat.lastMessage.body}
                          </>
                        ) : (
                          <em>{i.noMessages}</em>
                        )}
                      </span>
                      {chat.unreadCount > 0 && (
                        <span style={{
                          background: 'var(--primary)', color: '#fff',
                          borderRadius: '50%', width: 18, height: 18,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, flexShrink: 0, marginLeft: 4,
                        }}>
                          {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: chat window */}
      <div className="chat-chat-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)' }}>
        {!activeChat ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 12 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 16 }}>{i.selectConversation}</div>
            <button className="btn btn-primary" onClick={() => setShowNewDm(true)}>{i.newChatBtn}</button>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)' }}>
              <button
                className="mobile-back-btn"
                onClick={() => setMobilePanel('list')}
                style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text)', padding: '0 8px 0 0', flexShrink: 0 }}
                aria-label={i.back}
              >←</button>
              <Avatar name={peer!.name} email={peer!.email} size={36} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{peer!.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{peer!.email}</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingMsgs ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 40 }}>{i.loadingMessages}</div>
              ) : messages.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 40 }}>{i.noMessagesYet}</div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === myId;
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                      {!isMe && <Avatar name={msg.sender?.full_name} email={msg.sender?.email} size={28} />}
                      <div style={{ maxWidth: '65%' }}>
                        {!isMe && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                            {msg.sender?.full_name || msg.sender?.email}
                          </div>
                        )}
                        <div style={{
                          background: isMe ? 'var(--primary)' : 'var(--bg-secondary)',
                          color: isMe ? '#fff' : 'var(--text)',
                          padding: '8px 12px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
                        }}>
                          {msg.body}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>
                          {formatTime(msg.createdAt, i.locale)}
                        </div>
                      </div>
                      {isMe && <Avatar name={peer!.name} email={peer!.email} size={28} />}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={i.chatInputPlaceholder}
                rows={1}
                style={{
                  flex: 1, resize: 'none', padding: '10px 14px',
                  borderRadius: 20, border: '1px solid var(--border)',
                  background: 'var(--input-bg)', color: 'var(--text)',
                  fontSize: 14, outline: 'none', lineHeight: 1.5,
                  maxHeight: 120, overflowY: 'auto',
                }}
              />
              <button
                className="btn btn-primary"
                style={{ borderRadius: '50%', width: 40, height: 40, padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                onClick={handleSend}
                disabled={!input.trim() || sending}
              >
                ➤
              </button>
            </div>
          </>
        )}
      </div>

      {/* New DM modal */}
      {showNewDm && (
        <div className="modal-overlay" onClick={() => { setShowNewDm(false); setAgentSearch(''); }}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: 16 }}>{i.newDirectMessage}</h2>
              <button className="btn btn-ghost" onClick={() => { setShowNewDm(false); setAgentSearch(''); }}>✕</button>
            </div>
            <div style={{ padding: '12px 0' }}>
              <input
                className="form-input"
                placeholder={i.searchAgentHint}
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                autoFocus
              />
              <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
                {filteredAgents.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
                    {i.noAgentsFound}
                  </div>
                ) : (
                  filteredAgents.map((agent) => (
                    <div
                      key={agent.id}
                      onClick={() => startDm(agent)}
                      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', cursor: 'pointer', borderRadius: 6 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar name={agent.fullName} email={agent.email} size={34} />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{agent.fullName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.email}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
