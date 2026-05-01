'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

export default function ApiDocsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const docsUrl = `${API_URL}/api/docs`;

  useEffect(() => {
    window.open(docsUrl, '_blank', 'noopener');
  }, [docsUrl]);

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
      <h2 style={{ margin: '0 0 8px' }}>API Reference</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
        {i.apiDocsOpened}
      </p>
      <a
        href={docsUrl}
        target="_blank"
        rel="noreferrer"
        className="btn btn-primary"
      >
        {i.openApiDocs}
      </a>
      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, display: 'inline-block', textAlign: 'left' }}>
        <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{docsUrl}</code>
      </div>
    </div>
  );
}
