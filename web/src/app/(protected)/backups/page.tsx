'use client';

import { useEffect, useState, useCallback } from 'react';
import { getBackups, triggerBackup, deleteBackup, type BackupLog } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function fmtDate(d: string | null | undefined, locale: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes: number | null) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(ms?: number | null) {
  if (!ms) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function BackupsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
    success: { label: i.statusSuccess, color: '#15803d', bg: '#dcfce7' },
    failed:  { label: i.error,         color: '#dc2626', bg: '#fee2e2' },
    running: { label: i.statusRunning, color: '#2563eb', bg: '#dbeafe' },
    pending: { label: i.connPending,   color: '#92400e', bg: '#fef3c7' },
  };

  const [backups, setBackups]       = useState<BackupLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError]           = useState('');
  const [pollId, setPollId]         = useState<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const data = await getBackups().catch(() => []);
    setBackups(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const running = backups.some((b) => b.status === 'running' || b.status === 'pending');
    if (running && !pollId) {
      const id = setInterval(load, 3000);
      setPollId(id);
    } else if (!running && pollId) {
      clearInterval(pollId);
      setPollId(null);
    }
    return () => { if (pollId) clearInterval(pollId); };
  }, [backups, pollId, load]);

  async function handleTrigger() {
    setTriggering(true); setError('');
    try { await triggerBackup(); await load(); }
    catch (e: any) { setError(e.message || i.errorStartingBackup); }
    finally { setTriggering(false); }
  }

  async function handleDelete(b: BackupLog) {
    if (!confirm(`${i.delete} "${b.filename}"?`)) return;
    await deleteBackup(b.id);
    setBackups((prev) => prev.filter((x) => x.id !== b.id));
  }

  const successList = backups.filter((b) => b.status === 'success');
  const failedList  = backups.filter((b) => b.status === 'failed');
  const lastGood    = successList[0];
  const totalSize   = successList.reduce((s, b) => s + (b.size_bytes ?? 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.backupsTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.backupsSubtitle}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleTrigger}
          disabled={triggering || backups.some((b) => b.status === 'running')}
        >
          {triggering ? i.starting : `▶ ${i.manualBackup}`}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#fee2e2', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: i.totalBackups,  value: backups.length,     color: '#6366f1' },
          { label: i.successful,    value: successList.length,  color: '#10b981' },
          { label: i.failed,        value: failedList.length,   color: '#ef4444' },
          { label: i.storageCol,    value: fmtSize(totalSize),  color: '#f59e0b' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {lastGood && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #10b981' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>✅ {i.lastSuccessfulBackup}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {fmtDate(lastGood.created_at, i.locale)} · {fmtSize(lastGood.size_bytes)} · {lastGood.storage.toUpperCase()} · {fmtDuration(lastGood.duration_ms)}
            </div>
          </div>
          {lastGood.storage === 'local' && (
            <a
              href={`${API_URL}/backups/${encodeURIComponent(lastGood.filename)}/download`}
              download
              className="btn btn-secondary"
              style={{ fontSize: 13, textDecoration: 'none' }}
            >
              ⬇ {i.download}
            </a>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{i.loading}</div>
      ) : backups.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💾</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>{i.noBackupsYet}</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{i.noBackupsHint}</div>
          <button className="btn btn-primary" onClick={handleTrigger} disabled={triggering}>
            {triggering ? i.starting : i.createFirstBackup}
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[i.fileCol, i.status, i.sizeCol, i.storageCol, i.durationCol, i.originCol, i.dateCol, ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => {
                const sc = STATUS_CFG[b.status] ?? STATUS_CFG.pending;
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>{b.filename}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.color }}>
                        {b.status === 'running' && '⟳ '}{sc.label}
                      </span>
                      {b.error_message && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.error_message}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtSize(b.size_bytes)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: b.storage === 's3' ? '#eff6ff' : 'var(--bg-secondary)',
                        color: b.storage === 's3' ? '#1d4ed8' : 'var(--text-muted)' }}>
                        {b.storage === 's3' ? '☁ S3' : '💻 Local'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtDuration(b.duration_ms)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {b.triggered_by === 'manual' ? `👤 ${i.manual}` : `⏰ ${i.automatic}`}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtDate(b.created_at, i.locale)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {b.status === 'success' && b.storage === 'local' && (
                          <a
                            href={`${API_URL}/backups/${encodeURIComponent(b.filename)}/download`}
                            download
                            className="btn btn-ghost"
                            style={{ padding: '3px 8px', fontSize: 11, textDecoration: 'none' }}
                          >⬇</a>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '3px 8px', fontSize: 11, color: 'var(--danger)' }}
                          onClick={() => handleDelete(b)}
                        >{i.delete}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
