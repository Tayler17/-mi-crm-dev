'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { globalSearch, type SearchResults } from '@/lib/api';

const CHANNEL_ICONS: Record<string, string> = {
  email: '📧', chat: '💬', whatsapp: '📱', whatsapp_web: '📱',
  instagram: '📷', telegram: '✈️', phone: '📞',
};

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQ = useDebounce(query, 220);

  // ── Keyboard shortcut to open ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Focus input when opened ────────────────────────────────────────────────
  useEffect(() => {
    if (open) { setQuery(''); setResults(null); setCursor(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // ── Fetch on debounced query ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || debouncedQ.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    globalSearch(debouncedQ)
      .then(setResults)
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQ, open]);

  // ── Flatten results for keyboard nav ──────────────────────────────────────
  const items = results
    ? [
        ...results.contacts.map((c) => ({ type: 'contact' as const, id: c.id, label: c.full_name || c.email, sub: c.email || c.phone, href: `/contacts?id=${c.id}` })),
        ...results.conversations.map((c) => ({ type: 'conv' as const, id: c.id, label: c.subject || c.contact_name || 'Sin asunto', sub: c.contact_name, href: `/inbox?id=${c.id}` })),
        ...results.deals.map((d) => ({ type: 'deal' as const, id: d.id, label: d.title, sub: d.contact_name ? `${d.contact_name} · ${d.value} ${d.currency}` : `${d.value} ${d.currency}`, href: `/kanban?deal=${d.id}` })),
      ]
    : [];

  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  // ── Arrow key + Enter navigation ──────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); if (items[cursor]) navigate(items[cursor].href); }
  };

  useEffect(() => { setCursor(0); }, [results]);

  if (!open) return null;

  const typeIcon: Record<string, string> = { contact: '👤', conv: '💬', deal: '💼' };
  const typeLabel: Record<string, string> = { contact: 'Contactos', conv: 'Conversaciones', deal: 'Deals' };

  const grouped: { type: string; items: typeof items }[] = [];
  for (const type of ['contact', 'conv', 'deal'] as const) {
    const g = items.filter((i) => i.type === type);
    if (g.length) grouped.push({ type, items: g });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--bg)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18, opacity: .5 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar contactos, conversaciones, deals…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--text)' }}
          />
          {loading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>…</span>}
          <kbd style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', background: 'var(--surface)' }}>ESC</kbd>
        </div>

        {/* Results */}
        {results && items.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin resultados para "{query}"</div>
        )}
        {!results && query.trim().length < 2 && (
          <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            Escribe al menos 2 caracteres · <kbd style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--border)', borderRadius: 3 }}>↑↓</kbd> navegar · <kbd style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--border)', borderRadius: 3 }}>↵</kbd> abrir
          </div>
        )}
        {grouped.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {grouped.map(({ type, items: gItems }) => (
              <div key={type}>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                  {typeLabel[type]}
                </div>
                {gItems.map((item) => {
                  const idx = items.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => navigate(item.href)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '9px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: idx === cursor ? 'var(--primary)' : 'transparent',
                        color: idx === cursor ? '#fff' : 'var(--text)',
                        transition: 'background 0.1s',
                      }}
                    >
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{typeIcon[item.type]}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                        {item.sub && <span style={{ display: 'block', fontSize: 11, opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</span>}
                      </span>
                      <span style={{ fontSize: 10, opacity: .5, flexShrink: 0 }}>→</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
