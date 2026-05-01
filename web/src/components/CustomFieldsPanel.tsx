'use client';

import { useEffect, useState } from 'react';
import { getCustomFieldValues, setCustomFieldValues, type CustomFieldValue } from '@/lib/api';

interface Props {
  entityType: 'contact' | 'deal' | 'conversation';
  entityId: string;
}

export function CustomFieldsPanel({ entityType, entityId }: Props) {
  const [fields,  setFields]  = useState<CustomFieldValue[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    getCustomFieldValues(entityType, entityId).then((f) => {
      setFields(f);
      const init: Record<string, string> = {};
      f.forEach((v) => { if (v.value != null) init[v.definitionId] = v.value; });
      setDraft(init);
    }).catch(() => {});
  }, [entityType, entityId]);

  if (fields.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const values = fields.map((f) => ({ definitionId: f.definitionId, value: draft[f.definitionId] ?? null }));
      await setCustomFieldValues(entityType, entityId, values);
      setFields((prev) => prev.map((f) => ({ ...f, value: draft[f.definitionId] ?? undefined })));
      setEditing(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function renderValue(f: CustomFieldValue) {
    const val = f.value;
    if (val == null || val === '') return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
    if (f.fieldType === 'checkbox') return <span>{val === 'true' ? '✓' : '✗'}</span>;
    if (f.fieldType === 'url') return <a href={val} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: 12 }}>{val}</a>;
    return <span style={{ fontSize: 13 }}>{val}</span>;
  }

  function renderInput(f: CustomFieldValue) {
    const val = draft[f.definitionId] ?? '';
    const onChange = (v: string) => setDraft((p) => ({ ...p, [f.definitionId]: v }));
    if (f.fieldType === 'select' && f.options?.length) {
      return (
        <select className="form-input" style={{ fontSize: 12, padding: '4px 6px' }} value={val} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.fieldType === 'checkbox') {
      return (
        <input type="checkbox" checked={val === 'true'} onChange={(e) => onChange(String(e.target.checked))} />
      );
    }
    if (f.fieldType === 'textarea') {
      return <textarea className="form-input" style={{ fontSize: 12, padding: '4px 6px' }} rows={2} value={val} onChange={(e) => onChange(e.target.value)} />;
    }
    const type = f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : f.fieldType === 'url' ? 'url' : 'text';
    return <input className="form-input" type={type} style={{ fontSize: 12, padding: '4px 6px' }} value={val} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Campos personalizados
        </span>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
            Editar
          </button>
        )}
      </div>
      {fields.map((f) => (
        <div key={f.definitionId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>
            {f.label}{f.isRequired ? ' *' : ''}
          </span>
          {editing ? renderInput(f) : renderValue(f)}
        </div>
      ))}
      {editing && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={handleSave} disabled={saving}>
            {saving ? '…' : 'Guardar'}
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
