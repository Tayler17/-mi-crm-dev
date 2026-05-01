'use client';

import { useEffect, useState } from 'react';
import {
  getCustomFieldDefs, createCustomFieldDef, updateCustomFieldDef, deleteCustomFieldDef,
  type CustomFieldDef,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

export default function CustomFieldsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const ENTITY_LABELS: Record<string, string> = {
    contact:      i.contacts,
    deal:         i.deals,
    conversation: i.conversations,
  };

  const TYPE_LABELS: Record<string, string> = {
    text: i.typeText, number: i.typeNumber, date: i.typeDate,
    select: i.typeSelect, checkbox: i.typeCheckbox, url: i.typeUrl, textarea: i.typeTextarea,
  };

  const [defs,     setDefs]     = useState<CustomFieldDef[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CustomFieldDef | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [activeTab, setActiveTab] = useState<string>('contact');

  const [fEntity,   setFEntity]   = useState('contact');
  const [fName,     setFName]     = useState('');
  const [fLabel,    setFLabel]    = useState('');
  const [fType,     setFType]     = useState('text');
  const [fOptions,  setFOptions]  = useState('');
  const [fRequired, setFRequired] = useState(false);

  function toast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); }

  useEffect(() => {
    getCustomFieldDefs()
      .then(setDefs)
      .catch(() => setError(i.errorLoadingFields))
      .finally(() => setLoading(false));
  }, []);

  const tabs = Object.keys(ENTITY_LABELS);
  const filtered = defs.filter((d) => d.entityType === activeTab);

  function openCreate() {
    setEditItem(null);
    setFEntity(activeTab); setFName(''); setFLabel('');
    setFType('text'); setFOptions(''); setFRequired(false);
    setShowForm(true);
  }

  function openEdit(d: CustomFieldDef) {
    setEditItem(d);
    setFEntity(d.entityType); setFName(d.name); setFLabel(d.label);
    setFType(d.fieldType); setFOptions((d.options ?? []).join('\n')); setFRequired(d.isRequired);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim() || !fLabel.trim()) return;
    setSaving(true);
    try {
      const options = fType === 'select' ? fOptions.split('\n').map(s => s.trim()).filter(Boolean) : undefined;
      const dto: Partial<CustomFieldDef> = { entityType: fEntity, name: fName.trim(), label: fLabel.trim(), fieldType: fType, options, isRequired: fRequired };
      if (editItem) {
        const updated = await updateCustomFieldDef(editItem.id, { label: fLabel.trim(), options, isRequired: fRequired });
        setDefs((p) => p.map((d) => d.id === editItem.id ? { ...d, ...updated } : d));
        toast(i.fieldUpdated);
      } else {
        const created = await createCustomFieldDef(dto);
        setDefs((p) => [...p, created]);
        toast(i.fieldCreated);
      }
      setShowForm(false);
    } catch { toast(i.error); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm(i.deleteFieldConfirm)) return;
    await deleteCustomFieldDef(id).catch(() => {});
    setDefs((p) => p.filter((d) => d.id !== id));
    toast(i.fieldDeleted);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.customFieldsTitle}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {i.customFieldsSubtitle}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>{i.newCustomField}</button>
      </div>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#1e293b', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13 }}>
          {toastMsg}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none', marginBottom: -1,
            borderBottom: `2px solid ${activeTab === tab ? 'var(--primary)' : 'transparent'}`,
            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
          }}>
            {ENTITY_LABELS[tab]}
            <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 6px' }}>
              {defs.filter(d => d.entityType === tab).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
          <p>{i.noFieldsFor} {ENTITY_LABELS[activeTab]}.</p>
          <button className="btn btn-primary" onClick={openCreate}>{i.createFieldBtn}</button>
        </div>
      )}

      {filtered.map((d, idx) => (
        <div key={d.id} className="card" style={{ marginBottom: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, width: 24, textAlign: 'center' }}>{idx + 1}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{d.label}</span>
            <code style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 3 }}>{d.name}</code>
          </div>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)',
          }}>
            {TYPE_LABELS[d.fieldType] ?? d.fieldType}
          </span>
          {d.isRequired && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>{i.requiredShort}</span>}
          {d.options?.length ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.options.join(' · ')}</span> : null}
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openEdit(d)}>✏</button>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444' }} onClick={() => handleDelete(d.id)}>🗑</button>
        </div>
      ))}

      {showForm && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editItem ? i.edit + ' ' + i.fieldTypeLabel.toLowerCase() : i.newCustomField}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {!editItem && (
                  <div className="form-group">
                    <label className="form-label">{i.status.replace('Estado', 'Entidad') || 'Entidad'} *</label>
                    <select className="form-input" value={fEntity} onChange={(e) => setFEntity(e.target.value)}>
                      {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}
                {!editItem && (
                  <div className="form-group">
                    <label className="form-label">
                      {i.internalNameLabel} *
                      <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({i.noSpacesHint})</span>
                    </label>
                    <input className="form-input" value={fName} onChange={(e) => setFName(e.target.value.replace(/\s/g, '_').toLowerCase())} placeholder="ej: numero_cliente" required />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">{i.visibleLabelField} *</label>
                  <input className="form-input" value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="ej: Nº de cliente" required />
                </div>
                {!editItem && (
                  <div className="form-group">
                    <label className="form-label">{i.fieldTypeLabel} *</label>
                    <select className="form-input" value={fType} onChange={(e) => setFType(e.target.value)}>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}
                {fType === 'select' && (
                  <div className="form-group">
                    <label className="form-label">
                      {i.optionsLabel}
                    </label>
                    <textarea className="form-input" rows={4} value={fOptions} onChange={(e) => setFOptions(e.target.value)} placeholder={'Option A\nOption B\nOption C'} />
                  </div>
                )}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={fRequired} onChange={(e) => setFRequired(e.target.checked)} />
                    {i.fieldRequiredLabel}
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '…' : editItem ? i.update : i.createFieldBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
