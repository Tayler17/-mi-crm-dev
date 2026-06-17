'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getMyChats, createOrFindDm, getChatMessages, sendChatMessage, markChatRead,
  editChatMessage, deleteChatMessage, uploadChatFile,
  createGroupChat, addGroupMembers, removeGroupMember, deleteChatConversation,
  getAgents, InternalChat, ChatMessage, Agent, API_URL,
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
  // Groups show their name + member count; DMs show the other person.
  if (chat.isGroup) {
    const count = chat.memberDetails?.length ?? chat.members?.length ?? 0;
    return { id: '', name: chat.name || 'Grupo', email: `${count} miembros` };
  }
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
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRecordRef = useRef(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newMode, setNewMode] = useState<'dm' | 'group'>('dm');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat'>('list');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const justOpenedRef = useRef(false);
  const lastMsgIdRef = useRef<string | null>(null);

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

  // Jump to the bottom instantly when opening a chat; smooth-scroll only when a
  // genuinely new message arrives. Idle polls (same last message) don't scroll,
  // so reading older messages isn't interrupted.
  const scrollToBottom = (smooth: boolean) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    const lastId = messages.length ? messages[messages.length - 1].id : null;
    if (justOpenedRef.current) {
      // Scroll after layout settles (and once more shortly after, in case images grow the height).
      requestAnimationFrame(() => scrollToBottom(false));
      setTimeout(() => scrollToBottom(false), 120);
      justOpenedRef.current = false;
      lastMsgIdRef.current = lastId;
    } else if (lastId && lastId !== lastMsgIdRef.current) {
      requestAnimationFrame(() => scrollToBottom(true));
      lastMsgIdRef.current = lastId;
    }
  }, [messages]);

  // Persist the draft per chat so it survives navigating away / coming back.
  useEffect(() => {
    if (!activeChat) return;
    const key = `chat_draft_${activeChat.id}`;
    if (input) localStorage.setItem(key, input);
    else localStorage.removeItem(key);
  }, [input, activeChat]);

  async function openChat(chat: InternalChat) {
    setActiveChat(chat);
    setMobilePanel('chat');
    setInput(localStorage.getItem(`chat_draft_${chat.id}`) ?? '');
    justOpenedRef.current = true;
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
    } catch (e: any) {
      // Don't lose what the user typed, and surface the real reason instead of silently dropping it
      setInput(body);
      alert(e?.message || 'No se pudo enviar el mensaje');
    } finally { setSending(false); }
  }

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // allow re-selecting the same file
    if (!file || !activeChat) return;
    setUploading(true);
    try {
      const up = await uploadChatFile(file);
      const caption = input.trim();
      setInput('');
      const msg = await sendChatMessage(activeChat.id, {
        body: caption,
        attachmentUrl: up.url, attachmentType: up.attachmentType, attachmentName: up.attachmentName,
      });
      setMessages((prev) => [...prev, msg]);
    } catch (err: any) {
      alert(err?.message || 'No se pudo enviar el archivo');
    } finally { setUploading(false); }
  }

  async function startRecording() {
    if (!activeChat || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      cancelRecordRef.current = false;
      mr.ondataavailable = (e) => { if (e.data.size) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecording(false);
        setRecordSecs(0);
        if (cancelRecordRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 800) return; // too short / empty
        const file = new File([blob], `voz-${Date.now()}.webm`, { type: 'audio/webm' });
        setUploading(true);
        try {
          const up = await uploadChatFile(file);
          const msg = await sendChatMessage(activeChat.id, { attachmentUrl: up.url, attachmentType: 'audio', attachmentName: up.attachmentName });
          setMessages((prev) => [...prev, msg]);
        } catch (e: any) { alert(e?.message || 'No se pudo enviar la nota de voz'); }
        finally { setUploading(false); }
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

  async function handleDelete(id: string) {
    if (!activeChat || !confirm('¿Eliminar este mensaje?')) return;
    try { await deleteChatMessage(id); await loadMessages(activeChat.id, true); }
    catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  function startEdit(m: ChatMessage) { setEditingId(m.id); setEditText(m.body); }

  async function saveEdit() {
    if (!editingId || !activeChat || !editText.trim()) return;
    try {
      await editChatMessage(editingId, editText.trim());
      setEditingId(null); setEditText('');
      await loadMessages(activeChat.id, true);
    } catch (e: any) { alert(e?.message || 'No se pudo editar'); }
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

  function closeNewModal() {
    setShowNewDm(false); setAgentSearch(''); setNewMode('dm');
    setGroupName(''); setGroupMembers(new Set());
  }

  function toggleGroupMember(id: string) {
    setGroupMembers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || groupMembers.size === 0 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const chat = await createGroupChat(groupName.trim(), [...groupMembers]);
      closeNewModal();
      await loadChats();
      if (chat) openChat(chat as any);
    } catch (e: any) { alert(e?.message || 'No se pudo crear el grupo'); }
    finally { setCreatingGroup(false); }
  }

  async function handleAddMember(agentId: string) {
    if (!activeChat) return;
    try {
      const updated = await addGroupMembers(activeChat.id, [agentId]);
      if (updated) setActiveChat(updated as any);
      await loadChats();
    } catch (e: any) { alert(e?.message || 'Error'); }
  }

  async function handleDeleteChat() {
    if (!activeChat) return;
    const what = activeChat.isGroup ? 'el grupo' : 'esta conversación';
    if (!confirm(`¿Eliminar ${what}? Se borrará para todos los miembros y no se puede deshacer.`)) return;
    try {
      await deleteChatConversation(activeChat.id);
      setShowMembers(false);
      setActiveChat(null);
      setMessages([]);
      setMobilePanel('list');
      await loadChats();
    } catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeChat || !confirm('¿Quitar a este miembro del grupo?')) return;
    try {
      await removeGroupMember(activeChat.id, userId);
      const fresh = (await getMyChats()).find((c) => c.id === activeChat.id);
      if (fresh) setActiveChat(fresh);
      await loadChats();
    } catch (e: any) { alert(e?.message || 'Error'); }
  }

  const filteredAgents = agents.filter(
    (a) => a.id !== myId && (
      a.fullName.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.email.toLowerCase().includes(agentSearch.toLowerCase())
    ),
  );

  const peer = activeChat ? getChatPeer(activeChat, myId) : null;

  return (
    <div className="chat-layout" data-panel={mobilePanel} style={{ display: 'flex', overflow: 'hidden', position: 'fixed', top: 'var(--header-h, 56px)', left: 'var(--sidebar-w, 220px)', right: 0, bottom: 0 }}>

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
              <Avatar name={activeChat.isGroup ? '👥' : peer!.name} email={peer!.email} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{activeChat.isGroup ? '👥 ' : ''}{peer!.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{peer!.email}</div>
              </div>
              {activeChat.isGroup && (
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }} onClick={() => setShowMembers(true)}>
                  👥 Miembros
                </button>
              )}
              <button
                title="Eliminar conversación"
                style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0, color: '#fff', background: 'var(--danger, #ef4444)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                onClick={handleDeleteChat}
              >
                🗑 Eliminar
              </button>
            </div>

            <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      <div className="chat-msg-wrap" style={{ maxWidth: '65%' }}>
                        {!isMe && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                            {msg.sender?.full_name || msg.sender?.email}
                          </div>
                        )}
                        {editingId === msg.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { setEditingId(null); } }}
                              rows={1} autoFocus
                              style={{ resize: 'none', padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 14, minWidth: 180 }}
                            />
                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={saveEdit}>✓</button>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditingId(null); setEditText(''); }}>✕</button>
                          </div>
                        ) : msg.deletedAt ? (
                          <div style={{
                            background: isMe ? 'var(--primary)' : 'var(--bg-secondary)', opacity: 0.6,
                            color: isMe ? '#fff' : 'var(--text)', padding: '8px 12px',
                            borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            fontSize: 13, fontStyle: 'italic',
                          }}>
                            🚫 Mensaje eliminado
                          </div>
                        ) : (
                          <div style={{
                            background: isMe ? 'var(--primary)' : 'var(--bg-secondary)',
                            color: isMe ? '#fff' : 'var(--text)',
                            padding: msg.attachmentType === 'image' ? 4 : '8px 12px',
                            borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
                          }}>
                            {msg.attachmentUrl && msg.attachmentType === 'image' && (
                              <a href={`${API_URL}${msg.attachmentUrl}`} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`${API_URL}${msg.attachmentUrl}`} alt={msg.attachmentName || ''} style={{ maxWidth: 240, maxHeight: 240, borderRadius: 12, display: 'block' }} />
                              </a>
                            )}
                            {msg.attachmentUrl && msg.attachmentType === 'audio' && (
                              <audio controls src={`${API_URL}${msg.attachmentUrl}`} style={{ maxWidth: 240 }} />
                            )}
                            {msg.attachmentUrl && msg.attachmentType === 'file' && (
                              <a href={`${API_URL}${msg.attachmentUrl}`} target="_blank" rel="noopener noreferrer"
                                style={{ color: isMe ? '#fff' : 'var(--primary)', textDecoration: 'underline', wordBreak: 'break-all' }}>
                                📎 {msg.attachmentName || 'Archivo'}
                              </a>
                            )}
                            {msg.body && <div style={{ marginTop: msg.attachmentUrl ? 6 : 0, padding: msg.attachmentType === 'image' ? '0 8px 4px' : 0 }}>{msg.body}</div>}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textAlign: isMe ? 'right' : 'left', display: 'flex', gap: 8, justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                          <span>{formatTime(msg.createdAt, i.locale)}{msg.editedAt && !msg.deletedAt ? ' · editado' : ''}</span>
                          {isMe && !msg.deletedAt && editingId !== msg.id && (
                            <span className="chat-msg-actions" style={{ display: 'flex', gap: 6 }}>
                              {!msg.attachmentUrl && (
                                <button onClick={() => startEdit(msg)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0 }}>✎</button>
                              )}
                              <button onClick={() => handleDelete(msg.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0 }}>🗑</button>
                            </span>
                          )}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*"
                style={{ display: 'none' }}
                onChange={handleAttach}
              />
              {recording ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderRadius: 20, border: '1px solid var(--danger, #ef4444)', background: 'var(--input-bg)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: 14, color: 'var(--text)' }}>
                    Grabando… {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => stopRecording(true)} title="Cancelar"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}>✕</button>
                    <button type="button" onClick={() => stopRecording(false)} title="Enviar nota de voz"
                      style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 14 }}>➤</button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
                    title="Adjuntar imagen o audio"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 40, height: 40, flexShrink: 0, cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}
                  >
                    {uploading ? '…' : '📎'}
                  </button>
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={uploading || sending}
                    title="Grabar nota de voz"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 40, height: 40, flexShrink: 0, cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}
                  >
                    🎤
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !(typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window))) { e.preventDefault(); handleSend(); } }}
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
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* New DM / Group modal */}
      {showNewDm && (
        <div className="modal-overlay" onClick={closeNewModal}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: 16 }}>{newMode === 'group' ? 'Nuevo grupo' : i.newDirectMessage}</h2>
              <button className="btn btn-ghost" onClick={closeNewModal}>✕</button>
            </div>

            {/* DM / Group toggle */}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className={`btn ${newMode === 'dm' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: 13 }} onClick={() => setNewMode('dm')}>💬 Directo</button>
              <button className={`btn ${newMode === 'group' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: 13 }} onClick={() => setNewMode('group')}>👥 Grupo</button>
            </div>

            {newMode === 'group' && (
              <input
                className="form-input"
                style={{ marginTop: 10 }}
                placeholder="Nombre del grupo"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            )}

            <div style={{ padding: '10px 0 0' }}>
              <input
                className="form-input"
                placeholder={i.searchAgentHint}
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
                {filteredAgents.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
                    {i.noAgentsFound}
                  </div>
                ) : (
                  filteredAgents.map((agent) => {
                    const selected = groupMembers.has(agent.id);
                    return (
                      <div
                        key={agent.id}
                        onClick={() => newMode === 'group' ? toggleGroupMember(agent.id) : startDm(agent)}
                        style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {newMode === 'group' && (
                          <input type="checkbox" checked={selected} readOnly style={{ pointerEvents: 'none' }} />
                        )}
                        <Avatar name={agent.fullName} email={agent.email} size={34} />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{agent.fullName}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.email}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {newMode === 'group' && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 10 }}
                  disabled={!groupName.trim() || groupMembers.size === 0 || creatingGroup}
                  onClick={handleCreateGroup}
                >
                  {creatingGroup ? 'Creando…' : `Crear grupo (${groupMembers.size})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group members panel */}
      {showMembers && activeChat?.isGroup && (
        <div className="modal-overlay" onClick={() => { setShowMembers(false); setAgentSearch(''); }}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: 16 }}>👥 {activeChat.name || 'Grupo'}</h2>
              <button className="btn btn-ghost" onClick={() => { setShowMembers(false); setAgentSearch(''); }}>✕</button>
            </div>
            <div style={{ padding: '12px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>MIEMBROS ({activeChat.memberDetails?.length ?? 0})</div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {activeChat.memberDetails?.map((m) => (
                  <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px' }}>
                    <Avatar name={m.full_name} email={m.email} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>{m.full_name || m.email}{m.id === myId ? ' (tú)' : ''}</div>
                    </div>
                    {m.id !== myId && (
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => handleRemoveMember(m.id)}>Quitar</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '12px 0 6px' }}>AGREGAR</div>
              <input className="form-input" placeholder={i.searchAgentHint} value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
              <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
                {agents.filter((a) => a.id !== myId
                  && !activeChat.memberDetails?.some((m) => m.id === a.id)
                  && (a.fullName.toLowerCase().includes(agentSearch.toLowerCase()) || a.email.toLowerCase().includes(agentSearch.toLowerCase())))
                  .map((a) => (
                    <div key={a.id} onClick={() => handleAddMember(a.id)}
                      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <Avatar name={a.fullName} email={a.email} size={28} />
                      <div style={{ fontSize: 13 }}>{a.fullName}</div>
                      <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 16 }}>＋</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
