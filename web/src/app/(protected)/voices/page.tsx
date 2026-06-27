'use client';

import { useEffect, useState } from 'react';
import { getVoices, createVoice, updateVoice, deleteVoice, previewVoice, type Voice } from '@/lib/api';

const LANGUAGES = ['es-MX', 'es-ES', 'es-AR', 'es-CO', 'en-US', 'en-GB', 'pt-BR'];
const TTS_PROVIDERS = [
  { value: 'deepgram',     label: '⚡ Deepgram Aura-2 (llamadas en tiempo real)' },
  { value: 'twilio_basic', label: '🔊 Twilio Polly (incluido)' },
  { value: 'openai_tts',   label: '🟢 OpenAI TTS' },
  { value: 'elevenlabs',   label: '🎙️ ElevenLabs (hiperrealista)' },
];

// Full Deepgram Aura-2 catalog (es + en). Source: developers.deepgram.com/docs/tts-models
const AURA2_VOICES: { es: { id: string; label: string }[]; en: { id: string; label: string }[] } = {
  es: [
    { id: 'aura-2-celeste-es',  label: 'Celeste — es-CO (femenina)' },
    { id: 'aura-2-diana-es',    label: 'Diana — es-ES (femenina)' },
    { id: 'aura-2-carina-es',   label: 'Carina — es-ES (femenina)' },
    { id: 'aura-2-agustina-es', label: 'Agustina — es-ES (femenina)' },
    { id: 'aura-2-silvia-es',   label: 'Silvia — es-ES (femenina)' },
    { id: 'aura-2-gloria-es',   label: 'Gloria — es-CO (femenina)' },
    { id: 'aura-2-estrella-es', label: 'Estrella — es-MX (femenina)' },
    { id: 'aura-2-olivia-es',   label: 'Olivia — es-MX (femenina)' },
    { id: 'aura-2-antonia-es',  label: 'Antonia — es-AR (femenina)' },
    { id: 'aura-2-selena-es',   label: 'Selena — es-419 (femenina)' },
    { id: 'aura-2-javier-es',   label: 'Javier — es-MX (masculino)' },
    { id: 'aura-2-alvaro-es',   label: 'Álvaro — es-ES (masculino)' },
    { id: 'aura-2-nestor-es',   label: 'Néstor — es-ES (masculino)' },
    { id: 'aura-2-luciano-es',  label: 'Luciano — es-MX (masculino)' },
    { id: 'aura-2-sirio-es',    label: 'Sirio — es-MX (masculino)' },
    { id: 'aura-2-valerio-es',  label: 'Valerio — es-MX (masculino)' },
    { id: 'aura-2-aquila-es',   label: 'Aquila — es-419 (masculino)' },
  ],
  en: [
    { id: 'aura-2-thalia-en',    label: 'Thalia — en-US (female)' },
    { id: 'aura-2-andromeda-en', label: 'Andromeda — en-US (female)' },
    { id: 'aura-2-asteria-en',   label: 'Asteria — en-US (female)' },
    { id: 'aura-2-athena-en',    label: 'Athena — en-US (female)' },
    { id: 'aura-2-aurora-en',    label: 'Aurora — en-US (female)' },
    { id: 'aura-2-luna-en',      label: 'Luna — en-US (female)' },
    { id: 'aura-2-selene-en',    label: 'Selene — en-US (female)' },
    { id: 'aura-2-hera-en',      label: 'Hera — en-US (female)' },
    { id: 'aura-2-iris-en',      label: 'Iris — en-US (female)' },
    { id: 'aura-2-helena-en',    label: 'Helena — en-US (female)' },
    { id: 'aura-2-phoebe-en',    label: 'Phoebe — en-US (female)' },
    { id: 'aura-2-cora-en',      label: 'Cora — en-US (female)' },
    { id: 'aura-2-cordelia-en',  label: 'Cordelia — en-US (female)' },
    { id: 'aura-2-delia-en',     label: 'Delia — en-US (female)' },
    { id: 'aura-2-electra-en',   label: 'Electra — en-US (female)' },
    { id: 'aura-2-harmonia-en',  label: 'Harmonia — en-US (female)' },
    { id: 'aura-2-callista-en',  label: 'Callista — en-US (female)' },
    { id: 'aura-2-janus-en',     label: 'Janus — en-US (female)' },
    { id: 'aura-2-juno-en',      label: 'Juno — en-US (female)' },
    { id: 'aura-2-minerva-en',   label: 'Minerva — en-US (female)' },
    { id: 'aura-2-ophelia-en',   label: 'Ophelia — en-US (female)' },
    { id: 'aura-2-vesta-en',     label: 'Vesta — en-US (female)' },
    { id: 'aura-2-pandora-en',   label: 'Pandora — en-GB (female)' },
    { id: 'aura-2-theia-en',     label: 'Theia — en-AU (female)' },
    { id: 'aura-2-amalthea-en',  label: 'Amalthea — en-PH (female)' },
    { id: 'aura-2-apollo-en',    label: 'Apollo — en-US (male)' },
    { id: 'aura-2-arcas-en',     label: 'Arcas — en-US (male)' },
    { id: 'aura-2-aries-en',     label: 'Aries — en-US (male)' },
    { id: 'aura-2-atlas-en',     label: 'Atlas — en-US (male)' },
    { id: 'aura-2-hermes-en',    label: 'Hermes — en-US (male)' },
    { id: 'aura-2-jupiter-en',   label: 'Jupiter — en-US (male)' },
    { id: 'aura-2-mars-en',      label: 'Mars — en-US (male)' },
    { id: 'aura-2-neptune-en',   label: 'Neptune — en-US (male)' },
    { id: 'aura-2-odysseus-en',  label: 'Odysseus — en-US (male)' },
    { id: 'aura-2-orion-en',     label: 'Orion — en-US (male)' },
    { id: 'aura-2-orpheus-en',   label: 'Orpheus — en-US (male)' },
    { id: 'aura-2-pluto-en',     label: 'Pluto — en-US (male)' },
    { id: 'aura-2-saturn-en',    label: 'Saturn — en-US (male)' },
    { id: 'aura-2-zeus-en',      label: 'Zeus — en-US (male)' },
    { id: 'aura-2-draco-en',     label: 'Draco — en-GB (male)' },
    { id: 'aura-2-hyperion-en',  label: 'Hyperion — en-AU (male)' },
  ],
};

const ELEVENLABS_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah — EN, neutral' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam — EN, masculina' },
  { id: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte — EN, femenina' },
  { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian — EN, grave' },
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica — ES, femenina' },
  { id: 'iP95p4xoKVk53GoZ742B', label: 'Chris — ES, masculina' },
  { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel — ES, autoritativa' },
];

type VoiceForm = {
  name: string; description: string; language: string; gender: string;
  ttsProvider: string; ttsVoiceId: string; isActive: boolean; isDefault: boolean; sortOrder: number;
};

const EMPTY_FORM: VoiceForm = {
  name: '', description: '', language: 'es-MX', gender: 'neutral',
  ttsProvider: 'twilio_basic', ttsVoiceId: '', isActive: true, isDefault: false, sortOrder: 0,
};

// ── Voice Modal ───────────────────────────────────────────────────────────────

function VoiceModal({ voice, onSave, onClose }: {
  voice: Voice | null;
  onSave: (form: VoiceForm) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<VoiceForm>(
    voice
      ? { name: voice.name, description: voice.description ?? '', language: voice.language, gender: voice.gender, ttsProvider: voice.ttsProvider, ttsVoiceId: voice.ttsVoiceId ?? '', isActive: voice.isActive, isDefault: !!voice.isDefault, sortOrder: voice.sortOrder }
      : { ...EMPTY_FORM },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function upd<K extends keyof VoiceForm>(k: K, v: VoiceForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (e: any) { setError(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{voice ? 'Editar voz' : 'Nueva voz'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>{error}</div>}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombre visible * <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(lo ven los tenants)</span></label>
            <input className="form-input" value={form.name} autoFocus
              onChange={(e) => upd('name', e.target.value)}
              placeholder="María — ES MX · Femenina (ElevenLabs)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Idioma</label>
              <select className="form-input" value={form.language} onChange={(e) => upd('language', e.target.value)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Género</label>
              <select className="form-input" value={form.gender} onChange={(e) => upd('gender', e.target.value)}>
                <option value="neutral">Neutral</option>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Proveedor TTS</label>
            <select className="form-input" value={form.ttsProvider} onChange={(e) => upd('ttsProvider', e.target.value)}>
              {TTS_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {form.ttsProvider === 'elevenlabs' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Voice ID — ElevenLabs</label>
              <select className="form-input" value={form.ttsVoiceId} onChange={(e) => upd('ttsVoiceId', e.target.value)}>
                <option value="">— Voz por defecto (Sarah) —</option>
                {ELEVENLABS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <div style={{ marginTop: 6 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>O escribe un ID personalizado</label>
                <input className="form-input" value={form.ttsVoiceId}
                  onChange={(e) => upd('ttsVoiceId', e.target.value)}
                  placeholder="EXAVITQu4vr4xnSDxMaL" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Requiere API Key de ElevenLabs en Configuración → Plataforma.
              </div>
            </div>
          )}

          {form.ttsProvider === 'openai_tts' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Voice ID — OpenAI TTS</label>
              <select className="form-input" value={form.ttsVoiceId} onChange={(e) => upd('ttsVoiceId', e.target.value)}>
                <option value="">alloy (por defecto)</option>
                <option value="alloy">alloy — neutral</option>
                <option value="echo">echo — masculina</option>
                <option value="fable">fable — expresiva</option>
                <option value="onyx">onyx — grave</option>
                <option value="nova">nova — femenina</option>
                <option value="shimmer">shimmer — suave</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Requiere API Key de OpenAI en Configuración → Plataforma → IA.
              </div>
            </div>
          )}

          {form.ttsProvider === 'twilio_basic' && (
            <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Twilio Polly usa la voz (masculina/femenina/neutral) configurada en cada bot. No se requiere Voice ID aquí.
            </div>
          )}

          {form.ttsProvider === 'deepgram' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Voice ID — Deepgram Aura-2</label>
              <select className="form-input" value={form.ttsVoiceId} onChange={(e) => upd('ttsVoiceId', e.target.value)}>
                <option value="">— Elige una voz Aura-2 —</option>
                <optgroup label="Español">
                  {AURA2_VOICES.es.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </optgroup>
                <optgroup label="English">
                  {AURA2_VOICES.en.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </optgroup>
              </select>
              <div style={{ marginTop: 6 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>O escribe un ID Aura-2 personalizado</label>
                <input className="form-input" value={form.ttsVoiceId}
                  onChange={(e) => upd('ttsVoiceId', e.target.value)}
                  placeholder="aura-2-celeste-es" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                ⚡ Es la única que funciona en llamadas en tiempo real. Requiere Deepgram API Key en Configuración → Plataforma.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Orden de aparición</label>
              <input type="number" className="form-input" value={form.sortOrder}
                onChange={(e) => upd('sortOrder', +e.target.value)} min={0} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Estado</label>
              <select className="form-input" value={form.isActive ? 'true' : 'false'}
                onChange={(e) => upd('isActive', e.target.value === 'true')}>
                <option value="true">✅ Activa</option>
                <option value="false">⏸ Inactiva</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isDefault} onChange={(e) => upd('isDefault', e.target.checked)} />
              ⭐ Voz predeterminada para su idioma
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Los Call Bots sin voz elegida usarán esta voz (una predeterminada por idioma: es / en).
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descripción interna <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(solo tú la ves)</span></label>
            <input className="form-input" value={form.description}
              onChange={(e) => upd('description', e.target.value)}
              placeholder="Nota interna: voz principal para clientes hispanohablantes" />
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={handleSubmit}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Voice | null>(null);

  async function load() {
    setLoading(true);
    try { setVoices(await getVoices()); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(form: VoiceForm) {
    if (editing) await updateVoice(editing.id, form as any);
    else await createVoice(form as any);
    await load();
  }

  async function handleDelete(v: Voice) {
    if (!confirm(`¿Eliminar la voz "${v.name}"? Los bots que la usen pasarán a configuración manual.`)) return;
    await deleteVoice(v.id);
    setVoices((p) => p.filter((x) => x.id !== v.id));
  }

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  async function playPreview(v: Voice) {
    if (previewingId) return;
    setPreviewingId(v.id);
    try {
      const url = await previewVoice(v.id);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e: any) {
      alert(e?.message || 'No se pudo reproducir la muestra');
    } finally {
      setPreviewingId(null);
    }
  }

  function openModal(voice: Voice | null) {
    setEditing(voice);
    setShowModal(true);
  }

  const activeCount   = voices.filter((v) => v.isActive).length;
  const inactiveCount = voices.length - activeCount;

  const providerColor: Record<string, string> = {
    deepgram:     '#f59e0b',
    twilio_basic: '#3b82f6',
    openai_tts:   '#10b981',
    elevenlabs:   '#8b5cf6',
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🔊 Catálogo de Voces</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Gestiona las voces disponibles para todos los Call Bots. Los tenants solo ven el nombre, no el proveedor ni las claves API.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal(null)}>+ Nueva voz</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total voces',     value: voices.length,  color: 'var(--text)' },
          { label: 'Activas',         value: activeCount,    color: '#10b981' },
          { label: 'Inactivas',       value: inactiveCount,  color: '#6b7280' },
          { label: 'Deepgram Aura',   value: voices.filter((v) => v.ttsProvider === 'deepgram').length,     color: '#f59e0b' },
          { label: 'Twilio Polly',    value: voices.filter((v) => v.ttsProvider === 'twilio_basic').length,  color: '#3b82f6' },
          { label: 'ElevenLabs',      value: voices.filter((v) => v.ttsProvider === 'elevenlabs').length,   color: '#8b5cf6' },
          { label: 'OpenAI TTS',      value: voices.filter((v) => v.ttsProvider === 'openai_tts').length,   color: '#10b981' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div style={{ padding: '12px 16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#0369a1' }}>
        <strong>💡 Cómo funciona:</strong> Cada Call Bot puede seleccionar una voz del catálogo. La voz elegida toma prioridad sobre la configuración manual de TTS. Los tenants ven solo el nombre — el Voice ID y el proveedor son invisibles para ellos.
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
      ) : voices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>🎙️</div>
          <div style={{ fontSize: 16 }}>No hay voces todavía</div>
          <div style={{ fontSize: 13, maxWidth: 400, lineHeight: 1.6 }}>
            Crea una voz para que los Call Bots puedan seleccionarla. Puedes usar Twilio Polly (sin coste adicional), OpenAI TTS o ElevenLabs para voces más realistas.
          </div>
          <button className="btn btn-primary" onClick={() => openModal(null)}>+ Crear primera voz</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-secondary)' }}>
                {['#', 'Nombre', 'Idioma', 'Género', 'Proveedor TTS', 'Voice ID', 'Estado', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...voices].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', opacity: v.isActive ? 1 : 0.55 }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{v.sortOrder}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600 }}>
                      {v.name}
                      {v.isDefault && <span title="Predeterminada para su idioma" style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#d97706' }}>⭐ Predet.</span>}
                    </div>
                    {v.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{v.description}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{v.language}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                      {v.gender === 'female' ? '👩 Femenino' : v.gender === 'male' ? '👨 Masculino' : '⚪ Neutral'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: `${providerColor[v.ttsProvider] ?? '#6b7280'}15`, color: providerColor[v.ttsProvider] ?? '#6b7280' }}>
                      {TTS_PROVIDERS.find((p) => p.value === v.ttsProvider)?.label.split(' ').slice(0, 2).join(' ') ?? v.ttsProvider}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.ttsVoiceId || <span style={{ fontStyle: 'italic' }}>— por defecto</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: v.isActive ? '#dcfce7' : '#f3f4f6', color: v.isActive ? '#15803d' : '#6b7280' }}>
                      {v.isActive ? '✅ Activa' : '⏸ Inactiva'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {v.ttsProvider === 'deepgram' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={previewingId === v.id} title="Escuchar muestra" onClick={() => playPreview(v)}>
                          {previewingId === v.id ? '⏳' : '▶'}
                        </button>
                      )}
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openModal(v)}>Editar</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(v)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <VoiceModal
          voice={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
