'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getFlows, createFlow, updateFlow, deleteFlow, toggleFlow, duplicateFlow, getFlowSessions,
  getInboxes, getAgents, getTags, getTeams, getQueues,
  type ConversationFlow, type FlowStep,
  type Inbox, type Agent, type Tag, type Team, type Queue,
} from '@/lib/api';

// ── Step type catalog ─────────────────────────────────────────────────────────

const STEP_TYPES = [
  { type: 'message',   label: 'Enviar mensaje',     icon: '💬', color: '#3b82f6' },
  { type: 'menu',      label: 'Menú de opciones',   icon: '📋', color: '#8b5cf6' },
  { type: 'input',     label: 'Pedir respuesta',     icon: '⌨️',  color: '#06b6d4' },
  { type: 'condition', label: 'Condición',           icon: '🔀', color: '#f59e0b' },
  { type: 'assign',    label: 'Asignar',             icon: '👤', color: '#22c55e' },
  { type: 'tag',       label: 'Añadir tag',          icon: '🏷',  color: '#ec4899' },
  { type: 'wait',      label: 'Esperar',             icon: '⏱',  color: '#6366f1' },
  { type: 'end',       label: 'Fin del flujo',       icon: '🏁', color: '#64748b' },
] as const;

const STEP_META = Object.fromEntries(STEP_TYPES.map((s) => [s.type, s]));

const TRIGGERS = [
  { value: 'new_conversation', label: '🆕 Nueva conversación' },
  { value: 'keyword',          label: '🔑 Palabra clave' },
  { value: 'first_message',    label: '👋 Primer mensaje del contacto' },
  { value: 'reopened',         label: '↩️ Conversación reabierta' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function newStep(type: FlowStep['type']): FlowStep {
  const base = { id: uid(), type };
  switch (type) {
    case 'message':   return { ...base, text: '' };
    case 'menu':      return { ...base, text: '¿Cómo podemos ayudarte?', options: [{ label: 'Opción 1', nextStepId: '' }] };
    case 'input':     return { ...base, text: '¿Cuál es tu nombre?', saveAs: 'nombre' };
    case 'condition': return { ...base, field: 'message.body', operator: 'contains', value: '', trueStepId: '', falseStepId: '' };
    case 'assign':    return { ...base, assignTo: 'queue', assignId: '' };
    case 'tag':       return { ...base, tagName: '' };
    case 'wait':      return { ...base, seconds: 60 };
    case 'end':       return { ...base, text: 'Gracias por contactarnos. ¡Hasta pronto!' };
    default:          return base as FlowStep;
  }
}

// ── Step Editor ───────────────────────────────────────────────────────────────

function StepEditor({ step, allSteps, agents, tags, teams, queues, onChange }: {
  step: FlowStep;
  allSteps: FlowStep[];
  agents: Agent[];
  tags: Tag[];
  teams: Team[];
  queues: Queue[];
  onChange: (s: FlowStep) => void;
}) {
  const set = (k: keyof FlowStep, v: any) => onChange({ ...step, [k]: v });
  const otherSteps = allSteps.filter((s) => s.id !== step.id);

  function StepSelect({ value, onChange: oc, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
      <select className="form-input" style={{ fontSize: 12 }} value={value ?? ''} onChange={(e) => oc(e.target.value)}>
        <option value="">{placeholder}</option>
        {otherSteps.map((s) => {
          const m = STEP_META[s.type];
          return <option key={s.id} value={s.id}>{m?.icon} {s.label || m?.label} ({s.id.slice(0, 4)})</option>;
        })}
        <option value="__end__">🏁 Fin del flujo</option>
      </select>
    );
  }

  switch (step.type) {
    case 'message':
    case 'end':
      return (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mensaje</label>
          <textarea className="form-input" rows={3} value={step.text ?? ''} onChange={(e) => set('text', e.target.value)} placeholder="Escribe el mensaje que verá el contacto..." />
          {step.type === 'message' && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
              <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
            </div>
          )}
        </div>
      );

    case 'menu':
      return (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Pregunta del menú</label>
          <input className="form-input" style={{ fontSize: 12, marginBottom: 10 }} value={step.text ?? ''} onChange={(e) => set('text', e.target.value)} placeholder="¿Cómo podemos ayudarte?" />
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Opciones</label>
          {(step.options ?? []).map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 20, flexShrink: 0 }}>{i + 1}.</span>
              <input className="form-input" style={{ fontSize: 12, flex: 1 }} value={opt.label} onChange={(e) => {
                const opts = [...(step.options ?? [])];
                opts[i] = { ...opts[i], label: e.target.value };
                set('options', opts);
              }} placeholder={`Opción ${i + 1}`} />
              <div style={{ flex: 1 }}>
                <StepSelect value={opt.nextStepId} onChange={(v) => {
                  const opts = [...(step.options ?? [])];
                  opts[i] = { ...opts[i], nextStepId: v };
                  set('options', opts);
                }} placeholder="→ ir a paso" />
              </div>
              <button onClick={() => set('options', (step.options ?? []).filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
            </div>
          ))}
          <button className="btn btn-secondary" style={{ fontSize: 11, marginTop: 4 }} onClick={() => set('options', [...(step.options ?? []), { label: '', nextStepId: '' }])}>
            + Añadir opción
          </button>
        </div>
      );

    case 'input':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Pregunta al contacto</label>
            <input className="form-input" style={{ fontSize: 12 }} value={step.text ?? ''} onChange={(e) => set('text', e.target.value)} placeholder="¿Cuál es tu nombre?" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Guardar respuesta como</label>
            <input className="form-input" style={{ fontSize: 12 }} value={step.saveAs ?? ''} onChange={(e) => set('saveAs', e.target.value)} placeholder="nombre, email, telefono..." />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );

    case 'condition':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Campo</label>
              <select className="form-input" style={{ fontSize: 12 }} value={step.field ?? ''} onChange={(e) => set('field', e.target.value)}>
                <option value="">— Campo —</option>
                <option value="message.body">Mensaje recibido</option>
                <option value="contact.tag">Tag del contacto</option>
                <option value="saved.nombre">Variable: nombre</option>
                <option value="saved.email">Variable: email</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Operador</label>
              <select className="form-input" style={{ fontSize: 12 }} value={step.operator ?? 'contains'} onChange={(e) => set('operator', e.target.value)}>
                <option value="contains">contiene</option>
                <option value="equals">es igual a</option>
                <option value="not_equals">no es igual a</option>
                <option value="starts_with">empieza con</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Valor</label>
              <input className="form-input" style={{ fontSize: 12 }} value={step.value ?? ''} onChange={(e) => set('value', e.target.value)} placeholder="valor..." />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, display: 'block', marginBottom: 3 }}>✓ Si es verdadero → ir a</label>
              <StepSelect value={step.trueStepId ?? ''} onChange={(v) => set('trueStepId', v)} placeholder="— seleccionar paso —" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, display: 'block', marginBottom: 3 }}>✗ Si es falso → ir a</label>
              <StepSelect value={step.falseStepId ?? ''} onChange={(v) => set('falseStepId', v)} placeholder="— seleccionar paso —" />
            </div>
          </div>
        </div>
      );

    case 'assign':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Asignar a</label>
            <select className="form-input" style={{ fontSize: 12 }} value={step.assignTo ?? 'queue'} onChange={(e) => set('assignTo', e.target.value)}>
              <option value="queue">Cola</option>
              <option value="team">Equipo</option>
              <option value="agent">Agente</option>
            </select>
          </div>
          <div>
            {step.assignTo === 'queue' && (
              <select className="form-input" style={{ fontSize: 12 }} value={step.assignId ?? ''} onChange={(e) => set('assignId', e.target.value)}>
                <option value="">— Seleccionar cola —</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            )}
            {step.assignTo === 'team' && (
              <select className="form-input" style={{ fontSize: 12 }} value={step.assignId ?? ''} onChange={(e) => set('assignId', e.target.value)}>
                <option value="">— Seleccionar equipo —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {step.assignTo === 'agent' && (
              <select className="form-input" style={{ fontSize: 12 }} value={step.assignId ?? ''} onChange={(e) => set('assignId', e.target.value)}>
                <option value="">— Seleccionar agente —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );

    case 'tag':
      return (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Tag a añadir</label>
          <select className="form-input" style={{ fontSize: 12 }} value={step.tagName ?? ''} onChange={(e) => set('tagName', e.target.value)}>
            <option value="">— Seleccionar tag —</option>
            {tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );

    case 'wait':
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Esperar (segundos)</label>
            <input className="form-input" type="number" min={1} style={{ fontSize: 12, width: 100 }} value={step.seconds ?? 60} onChange={(e) => set('seconds', Number(e.target.value))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Luego ir a</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── Flow Builder Modal ────────────────────────────────────────────────────────

function FlowBuilder({ flow, inboxes, agents, tags, teams, queues, onClose, onSaved }: {
  flow?: ConversationFlow | null;
  inboxes: Inbox[]; agents: Agent[]; tags: Tag[]; teams: Team[]; queues: Queue[];
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(flow?.name ?? '');
  const [description, setDescription] = useState(flow?.description ?? '');
  const [inboxId, setInboxId] = useState(flow?.inboxId ?? '');
  const [triggerType, setTriggerType] = useState(flow?.triggerType ?? flow?.trigger_type ?? 'new_conversation');
  const [triggerValue, setTriggerValue] = useState(flow?.triggerValue ?? flow?.trigger_value ?? '');
  const [steps, setSteps] = useState<FlowStep[]>(flow?.steps ?? []);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addStep(type: FlowStep['type']) {
    const s = newStep(type);
    setSteps((p) => [...p, s]);
    setSelectedStep(s.id);
  }

  function updateStep(updated: FlowStep) {
    setSteps((p) => p.map((s) => s.id === updated.id ? updated : s));
  }

  function removeStep(id: string) {
    setSteps((p) => p.filter((s) => s.id !== id));
    setSelectedStep(null);
  }

  function moveStep(id: string, dir: -1 | 1) {
    setSteps((p) => {
      const i = p.findIndex((s) => s.id === id);
      if (i + dir < 0 || i + dir >= p.length) return p;
      const arr = [...p];
      [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
      return arr;
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name, description, inboxId: inboxId || undefined, triggerType, triggerValue: triggerValue || undefined, steps };
      if (flow) await updateFlow(flow.id, payload);
      else await createFlow(payload);
      onSaved();
    } finally { setSaving(false); }
  }

  const activeStep = steps.find((s) => s.id === selectedStep);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex' }}>
      <div style={{ background: 'var(--bg-card)', width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>⚡ {flow ? 'Editar flujo' : 'Nuevo flujo'}</h2>
            <input className="form-input" style={{ fontSize: 14, fontWeight: 600, width: 280 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del flujo..." />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={handleSave}>
              {saving ? 'Guardando...' : '💾 Guardar flujo'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Settings */}
          <div style={{ width: 240, borderRight: '1px solid var(--border)', padding: 14, overflowY: 'auto', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Configuración</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Inbox</label>
                <select className="form-input" style={{ fontSize: 12 }} value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
                  <option value="">Todos los inboxes</option>
                  {inboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Disparador</label>
                <select className="form-input" style={{ fontSize: 12 }} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
                  {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {triggerType === 'keyword' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Palabra clave</label>
                  <input className="form-input" style={{ fontSize: 12 }} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="hola, info, precio..." />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Descripción</label>
                <textarea className="form-input" rows={2} style={{ fontSize: 12 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción opcional..." />
              </div>
            </div>

            <div style={{ marginTop: 16, fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Añadir paso</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {STEP_TYPES.map((st) => (
                <button
                  key={st.type}
                  onClick={() => addStep(st.type as FlowStep['type'])}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, border: `1px solid ${st.color}33`, background: st.color + '11', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: st.color, textAlign: 'left' }}
                >
                  <span>{st.icon}</span> {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Center: Step list (visual flow) */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: 'var(--bg)' }}>
            {steps.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Flujo vacío</div>
                <div style={{ fontSize: 13 }}>Añade pasos desde el panel izquierdo para construir el flujo</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                {/* Start node */}
                <div style={{ padding: '8px 20px', borderRadius: 20, background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  🚀 INICIO — {TRIGGERS.find((t) => t.value === triggerType)?.label}
                </div>

                {steps.map((step, i) => {
                  const meta = STEP_META[step.type];
                  const isSelected = selectedStep === step.id;
                  return (
                    <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 480 }}>
                      {/* Connector arrow */}
                      <div style={{ width: 2, height: 20, background: 'var(--border)' }} />
                      {/* Step card */}
                      <div
                        onClick={() => setSelectedStep(isSelected ? null : step.id)}
                        style={{
                          width: '100%', borderRadius: 10, border: `2px solid ${isSelected ? meta?.color : 'var(--border)'}`,
                          background: isSelected ? meta?.color + '11' : 'var(--bg-card)',
                          cursor: 'pointer', transition: 'all .15s', overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: isSelected ? `1px solid ${meta?.color}33` : 'none' }}>
                          <span style={{ fontSize: 20, flexShrink: 0 }}>{meta?.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: meta?.color }}>{step.label || meta?.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                              {step.type === 'message' || step.type === 'end' ? (step.text?.slice(0, 50) ?? '') + (step.text && step.text.length > 50 ? '...' : '') : ''}
                              {step.type === 'menu' ? `${(step.options ?? []).length} opciones` : ''}
                              {step.type === 'assign' ? `→ ${step.assignTo}` : ''}
                              {step.type === 'tag' ? `#${step.tagName}` : ''}
                              {step.type === 'wait' ? `${step.seconds}s` : ''}
                              {step.type === 'condition' ? `${step.field} ${step.operator} "${step.value}"` : ''}
                              {step.type === 'input' ? `guardar como: ${step.saveAs}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={(e) => { e.stopPropagation(); moveStep(step.id, -1); }} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--border)' : 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}>↑</button>
                            <button onClick={(e) => { e.stopPropagation(); moveStep(step.id, 1); }} disabled={i === steps.length - 1} style={{ background: 'none', border: 'none', cursor: i === steps.length - 1 ? 'default' : 'pointer', color: i === steps.length - 1 ? 'var(--border)' : 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}>↓</button>
                            <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '2px 4px' }}>×</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* End connector */}
                <div style={{ width: 2, height: 20, background: 'var(--border)' }} />
                <div style={{ padding: '8px 20px', borderRadius: 20, background: '#64748b', color: '#fff', fontSize: 12, fontWeight: 700 }}>🏁 FIN</div>
              </div>
            )}
          </div>

          {/* Right: Step editor */}
          <div style={{ width: 320, borderLeft: '1px solid var(--border)', padding: 16, overflowY: 'auto', background: 'var(--surface)' }}>
            {activeStep ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{STEP_META[activeStep.type]?.icon}</span>
                  <span style={{ color: STEP_META[activeStep.type]?.color }}>{STEP_META[activeStep.type]?.label}</span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nombre del paso (opcional)</label>
                  <input className="form-input" style={{ fontSize: 12 }} value={activeStep.label ?? ''} onChange={(e) => updateStep({ ...activeStep, label: e.target.value })} placeholder="Ej: Saludo inicial" />
                </div>
                <StepEditor
                  step={activeStep}
                  allSteps={steps}
                  agents={agents} tags={tags} teams={teams} queues={queues}
                  onChange={updateStep}
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                Selecciona un paso para editarlo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState<ConversationFlow | null>(null);
  const [viewSessions, setViewSessions] = useState<ConversationFlow | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, i, a, t, tm, q] = await Promise.all([
      getFlows().catch(() => []),
      getInboxes().catch(() => []),
      getAgents().catch(() => []),
      getTags().catch(() => []),
      getTeams().catch(() => []),
      getQueues().catch(() => []),
    ]);
    setFlows(f); setInboxes(i); setAgents(a); setTags(t); setTeams(tm); setQueues(q);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(f: ConversationFlow) {
    if (!confirm(`¿Eliminar el flujo "${f.name}"?`)) return;
    await deleteFlow(f.id); load();
  }

  async function handleDuplicate(f: ConversationFlow) {
    await duplicateFlow(f.id); load();
  }

  async function openSessions(f: ConversationFlow) {
    setViewSessions(f);
    const s = await getFlowSessions(f.id).catch(() => []);
    setSessions(s);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Flujos de Conversación</h1>
          <p className="page-subtitle">Automatiza respuestas y dirige conversaciones con flujos visuales</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowBuilder(true); }}>+ Nuevo flujo</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Cargando flujos...</div>
      ) : flows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin flujos configurados</div>
          <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            Crea flujos para automatizar el primer contacto: menús de opciones, preguntas, asignaciones automáticas y más
          </div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowBuilder(true); }}>+ Crear primer flujo</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {flows.map((f) => {
            const isActive = f.isActive ?? f.is_active;
            const triggerLabel = TRIGGERS.find((t) => t.value === (f.triggerType ?? f.trigger_type))?.label ?? f.triggerType;
            return (
              <div key={f.id} className="card" style={{ borderTop: `3px solid ${isActive ? '#22c55e' : '#cbd5e1'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{f.name}</div>
                    {f.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{f.description}</div>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, background: '#eff6ff', color: '#3b82f6', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                        {triggerLabel}
                      </span>
                      {f.inbox_name && (
                        <span style={{ fontSize: 11, background: 'var(--bg-hover)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: 4 }}>
                          📥 {f.inbox_name}
                        </span>
                      )}
                      <span style={{ fontSize: 11, background: 'var(--bg-hover)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: 4 }}>
                        {(f.steps ?? []).length} pasos
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: isActive ? '#dcfce7' : '#f1f5f9', color: isActive ? '#15803d' : '#64748b', flexShrink: 0, marginLeft: 8 }}>
                    {isActive ? '● Activo' : '○ Inactivo'}
                  </span>
                </div>

                {/* Stats */}
                {((f.total_sessions ?? 0) > 0) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>🔄 {f.total_sessions} sesiones</span>
                    <span style={{ color: '#22c55e' }}>✓ {f.completed_sessions} completadas</span>
                    {(f.active_sessions ?? 0) > 0 && <span style={{ color: '#3b82f6' }}>⚡ {f.active_sessions} activas</span>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditing(f); setShowBuilder(true); }}>
                    ✏️ Editar
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', color: isActive ? '#f59e0b' : '#22c55e' }}
                    onClick={() => toggleFlow(f.id).then(load)}
                  >
                    {isActive ? '⏸ Pausar' : '▶ Activar'}
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openSessions(f)}>
                    📊 Sesiones
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleDuplicate(f)}>
                    📋 Duplicar
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDelete(f)}>
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Builder */}
      {showBuilder && (
        <FlowBuilder
          flow={editing}
          inboxes={inboxes} agents={agents} tags={tags} teams={teams} queues={queues}
          onClose={() => setShowBuilder(false)}
          onSaved={() => { setShowBuilder(false); load(); }}
        />
      )}

      {/* Sessions drawer */}
      {viewSessions && (
        <div className="modal-overlay" onClick={() => setViewSessions(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 460, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Sesiones — {viewSessions.name}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sessions.length} registros</div>
              </div>
              <button className="modal-close" onClick={() => setViewSessions(null)}>✕</button>
            </div>
            <div style={{ padding: '14px 22px' }}>
              {sessions.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin sesiones aún. El flujo se ejecutará cuando llegue una conversación que cumpla el disparador.</div>
                : sessions.map((s) => (
                  <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.contact_name ?? 'Contacto desconocido'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.contact_phone} · Paso {s.current_step + 1}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12 }}>
                      <div style={{ color: s.status === 'completed' ? '#22c55e' : s.status === 'abandoned' ? '#ef4444' : '#3b82f6', fontWeight: 600 }}>
                        {s.status === 'completed' ? '✓ Completado' : s.status === 'abandoned' ? '✗ Abandonado' : '⚡ Activo'}
                      </div>
                      <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{s.started_at ? new Date(s.started_at).toLocaleDateString('es-ES') : ''}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
