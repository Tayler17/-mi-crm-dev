'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAutomations, createAutomation, updateAutomation, deleteAutomation,
  toggleAutomation, testAutomation, getAutomationExecutions,
  getAgents, getTags, getTeams, getQueues,
  type AutomationRule, type AutomationCondition, type AutomationAction,
  type Agent, type Tag, type Team, type Queue,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Trigger events catalog ────────────────────────────────────────────────────

const TRIGGERS = [
  { group: 'Conversación', items: [
    { value: 'conversation.created',          label: 'Nueva conversación creada' },
    { value: 'conversation.assigned',         label: 'Conversación asignada a agente' },
    { value: 'conversation.resolved',         label: 'Conversación resuelta' },
    { value: 'conversation.reopened',         label: 'Conversación reabierta' },
    { value: 'conversation.message_received', label: 'Mensaje recibido' },
    { value: 'conversation.idle',             label: 'Conversación sin respuesta (idle)' },
  ]},
  { group: 'Contacto', items: [
    { value: 'contact.created',   label: 'Contacto creado' },
    { value: 'contact.updated',   label: 'Contacto actualizado' },
    { value: 'contact.tag_added', label: 'Tag añadido a contacto' },
  ]},
  { group: 'Deal', items: [
    { value: 'deal.created',       label: 'Deal creado' },
    { value: 'deal.stage_changed', label: 'Deal cambia de etapa' },
    { value: 'deal.won',           label: 'Deal ganado' },
    { value: 'deal.lost',          label: 'Deal perdido' },
  ]},
  { group: 'Tarea', items: [
    { value: 'task.created',  label: 'Tarea creada' },
    { value: 'task.due_soon', label: 'Tarea próxima a vencer' },
    { value: 'task.overdue',  label: 'Tarea vencida' },
  ]},
  { group: 'Campaña', items: [
    { value: 'campaign.started',   label: 'Campaña iniciada' },
    { value: 'campaign.completed', label: 'Campaña completada' },
  ]},
];

const TRIGGER_LABEL: Record<string, string> = {};
TRIGGERS.forEach((g) => g.items.forEach((item) => { TRIGGER_LABEL[item.value] = item.label; }));

// ── Condition fields ──────────────────────────────────────────────────────────

const CONDITION_FIELDS = [
  { value: 'conversation.channel',  label: 'Canal de conversación' },
  { value: 'conversation.status',   label: 'Estado de conversación' },
  { value: 'contact.tag',           label: 'Tag del contacto' },
  { value: 'deal.value',            label: 'Valor del deal' },
  { value: 'deal.status',           label: 'Estado del deal' },
  { value: 'message.body',          label: 'Cuerpo del mensaje' },
];

const OPERATORS = [
  { value: 'equals',        label: 'es igual a' },
  { value: 'not_equals',    label: 'no es igual a' },
  { value: 'contains',      label: 'contiene' },
  { value: 'not_contains',  label: 'no contiene' },
  { value: 'greater_than',  label: 'mayor que' },
  { value: 'less_than',     label: 'menor que' },
];

// ── Action types catalog ──────────────────────────────────────────────────────

const ACTION_TYPES = [
  { group: 'Asignación', items: [
    { value: 'assign_agent', label: 'Asignar agente', icon: '👤' },
    { value: 'assign_team',  label: 'Asignar equipo',  icon: '🏆' },
    { value: 'assign_queue', label: 'Asignar cola',    icon: '📬' },
  ]},
  { group: 'Conversación', items: [
    { value: 'change_status', label: 'Cambiar estado',   icon: '🔄' },
    { value: 'send_message',  label: 'Enviar mensaje',   icon: '💬' },
    { value: 'add_note',      label: 'Añadir nota',      icon: '📝' },
  ]},
  { group: 'Contacto', items: [
    { value: 'add_tag',     label: 'Añadir tag',           icon: '🏷' },
    { value: 'remove_tag',  label: 'Quitar tag',           icon: '🗑' },
    { value: 'add_to_list', label: 'Añadir a lista',       icon: '📋' },
  ]},
  { group: 'Tareas & Deals', items: [
    { value: 'create_task',   label: 'Crear tarea',     icon: '✓' },
    { value: 'update_deal',   label: 'Actualizar deal', icon: '💼' },
  ]},
  { group: 'Avanzado', items: [
    { value: 'wait',    label: 'Esperar',        icon: '⏱' },
    { value: 'webhook', label: 'Enviar Webhook', icon: '🔗' },
  ]},
];

const ACTION_LABEL: Record<string, { label: string; icon: string }> = {};
ACTION_TYPES.forEach((g) => g.items.forEach((item) => { ACTION_LABEL[item.value] = item; }));

// ── Condition builder ─────────────────────────────────────────────────────────

function ConditionRow({ cond, onChange, onRemove }: {
  cond: AutomationCondition;
  onChange: (c: AutomationCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: 'var(--bg-hover)', borderRadius: 6 }}>
      <select className="form-input" style={{ fontSize: 12, flex: 1 }} value={cond.field} onChange={(e) => onChange({ ...cond, field: e.target.value })}>
        <option value="">— Campo —</option>
        {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select className="form-input" style={{ fontSize: 12, flex: 1 }} value={cond.operator} onChange={(e) => onChange({ ...cond, operator: e.target.value })}>
        <option value="">— Operador —</option>
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input className="form-input" style={{ fontSize: 12, flex: 1 }} value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder="Valor..." />
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, flexShrink: 0 }}>×</button>
    </div>
  );
}

// ── Action builder ────────────────────────────────────────────────────────────

function ActionRow({ action, idx, agents, tags, teams, queues, onChange, onRemove }: {
  action: AutomationAction;
  idx: number;
  agents: Agent[];
  tags: Tag[];
  teams: Team[];
  queues: Queue[];
  onChange: (a: AutomationAction) => void;
  onRemove: () => void;
}) {
  const meta = ACTION_LABEL[action.type];

  function renderParams() {
    switch (action.type) {
      case 'assign_agent':
        return (
          <select className="form-input" style={{ fontSize: 12 }} value={action.agentId ?? ''} onChange={(e) => onChange({ ...action, agentId: e.target.value })}>
            <option value="">— Seleccionar agente —</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
          </select>
        );
      case 'assign_team':
        return (
          <select className="form-input" style={{ fontSize: 12 }} value={action.teamId ?? ''} onChange={(e) => onChange({ ...action, teamId: e.target.value })}>
            <option value="">— Seleccionar equipo —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        );
      case 'assign_queue':
        return (
          <select className="form-input" style={{ fontSize: 12 }} value={action.queueId ?? ''} onChange={(e) => onChange({ ...action, queueId: e.target.value })}>
            <option value="">— Seleccionar cola —</option>
            {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        );
      case 'add_tag':
      case 'remove_tag':
        return (
          <select className="form-input" style={{ fontSize: 12 }} value={action.tagName ?? ''} onChange={(e) => onChange({ ...action, tagName: e.target.value })}>
            <option value="">— Seleccionar tag —</option>
            {tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        );
      case 'change_status':
        return (
          <select className="form-input" style={{ fontSize: 12 }} value={action.status ?? ''} onChange={(e) => onChange({ ...action, status: e.target.value })}>
            <option value="">— Estado —</option>
            <option value="open">Abierta (Serving)</option>
            <option value="pending">En espera (Waiting)</option>
            <option value="resolved">Resuelta</option>
            <option value="snoozed">Snoozed</option>
          </select>
        );
      case 'send_message':
      case 'add_note':
        return (
          <textarea className="form-input" rows={2} style={{ fontSize: 12 }} value={action.message ?? ''} onChange={(e) => onChange({ ...action, message: e.target.value })} placeholder="Escribe el mensaje..." />
        );
      case 'create_task':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input className="form-input" style={{ fontSize: 12 }} value={action.title ?? ''} onChange={(e) => onChange({ ...action, title: e.target.value })} placeholder="Título de la tarea" />
            <input className="form-input" style={{ fontSize: 12 }} type="number" min={0} value={action.dueDays ?? 1} onChange={(e) => onChange({ ...action, dueDays: Number(e.target.value) })} placeholder="Días para vencer" />
          </div>
        );
      case 'wait':
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ fontSize: 12, width: 80 }} type="number" min={1} value={action.minutes ?? 60} onChange={(e) => onChange({ ...action, minutes: Number(e.target.value) })} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>minutos</span>
          </div>
        );
      case 'webhook':
        return (
          <input className="form-input" style={{ fontSize: 12 }} value={action.url ?? ''} onChange={(e) => onChange({ ...action, url: e.target.value })} placeholder="https://mi-webhook.com/endpoint" type="url" />
        );
      default:
        return null;
    }
  }

  return (
    <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
        <select
          className="form-input"
          style={{ fontSize: 12, flex: 1 }}
          value={action.type}
          onChange={(e) => onChange({ type: e.target.value })}
        >
          <option value="">— Seleccionar acción —</option>
          {ACTION_TYPES.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((item) => <option key={item.value} value={item.value}>{item.icon} {item.label}</option>)}
            </optgroup>
          ))}
        </select>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, flexShrink: 0 }}>×</button>
      </div>
      {action.type && renderParams()}
    </div>
  );
}

// ── Rule Modal ────────────────────────────────────────────────────────────────

interface RuleModalProps {
  rule?: AutomationRule | null;
  agents: Agent[];
  tags: Tag[];
  teams: Team[];
  queues: Queue[];
  onClose: () => void;
  onSaved: () => void;
}

function RuleModal({ rule, agents, tags, teams, queues, onClose, onSaved }: RuleModalProps) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [name, setName] = useState(rule?.name ?? '');
  const [triggerEvent, setTriggerEvent] = useState(rule?.triggerEvent ?? rule?.trigger_event ?? '');
  const [conditions, setConditions] = useState<AutomationCondition[]>(rule?.conditions ?? []);
  const [actions, setActions] = useState<AutomationAction[]>(rule?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function addCondition() { setConditions((p) => [...p, { field: '', operator: 'equals', value: '' }]); }
  function addAction() { setActions((p) => [...p, { type: '' }]); }

  function updateCondition(idx: number, c: AutomationCondition) {
    setConditions((p) => p.map((x, j) => j === idx ? c : x));
  }
  function removeCondition(idx: number) { setConditions((p) => p.filter((_, j) => j !== idx)); }

  function updateAction(idx: number, a: AutomationAction) {
    setActions((p) => p.map((x, j) => j === idx ? a : x));
  }
  function removeAction(idx: number) { setActions((p) => p.filter((_, j) => j !== idx)); }

  async function handleSave() {
    if (!name.trim() || !triggerEvent) return;
    setSaving(true); setSaveError('');
    try {
      const payload = { name, triggerEvent, conditions, actions };
      if (rule) await updateAutomation(rule.id, payload);
      else await createAutomation(payload);
      onSaved();
    } catch (err: any) { setSaveError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 className="modal-title">{rule ? i.editAutomation : i.newAutomation}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Name */}
          <div>
            <label className="form-label">{i.name} *</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Asignar conversaciones de WhatsApp al equipo de soporte" autoFocus />
          </div>

          {/* Trigger */}
          <div>
            <label className="form-label">{i.triggerLabel} *</label>
            <select className="form-input" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
              <option value="">— Seleccionar evento disparador —</option>
              {TRIGGERS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Conditions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label className="form-label" style={{ margin: 0 }}>{i.conditionsLabel}</label>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addCondition}>{i.addCondition}</button>
            </div>
            {conditions.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>{i.noConditions}</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {conditions.map((c, idx) => (
                    <ConditionRow key={idx} cond={c} onChange={(nc) => updateCondition(idx, nc)} onRemove={() => removeCondition(idx)} />
                  ))}
                </div>
            }
          </div>

          {/* Actions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label className="form-label" style={{ margin: 0 }}>{i.actionsLabel} *</label>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addAction}>{i.addAction}</button>
            </div>
            {actions.length === 0
              ? <div style={{ fontSize: 12, color: '#ef4444', fontStyle: 'italic', padding: '8px 0' }}>{i.noActions}</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {actions.map((a, idx) => (
                    <ActionRow key={idx} action={a} idx={idx} agents={agents} tags={tags} teams={teams} queues={queues}
                      onChange={(na) => updateAction(idx, na)} onRemove={() => removeAction(idx)} />
                  ))}
                </div>
            }
          </div>
        </div>

        {saveError && <div style={{ fontSize: 13, color: '#dc2626', padding: '8px 0 0' }}>{saveError}</div>}
        <div className="modal-footer" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving || !name.trim() || !triggerEvent || actions.length === 0} onClick={handleSave}>
            {saving ? i.saving : rule ? i.save : i.createAutomationBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Execution Log Drawer ──────────────────────────────────────────────────────

function ExecutionLog({ rule, onClose }: { rule: AutomationRule; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    getAutomationExecutions(rule.id).then(setExecutions).finally(() => setLoading(false));
  }, [rule.id]);

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const res = await testAutomation(rule.id);
      setTestResult(res);
      const fresh = await getAutomationExecutions(rule.id);
      setExecutions(fresh);
    } finally { setTesting(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 500, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{rule.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {TRIGGER_LABEL[rule.triggerEvent ?? rule.trigger_event ?? ''] ?? rule.triggerEvent}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleTest} disabled={testing}>
              {testing ? `⏳ ${i.automTesting}` : `▶ ${i.automTest}`}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {testResult && (
          <div style={{ padding: '12px 20px', background: testResult.ok ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, color: testResult.ok ? '#15803d' : '#dc2626', marginBottom: 6 }}>
              {testResult.ok ? `✅ ${i.automTestOk}` : `❌ ${i.automTestError}`}
            </div>
            {testResult.result?.log?.map((l: string, idx: number) => (
              <div key={idx} style={{ fontSize: 12, color: '#166534' }}>{l}</div>
            ))}
            {testResult.result?.errors?.map((e: string, idx: number) => (
              <div key={idx} style={{ fontSize: 12, color: '#dc2626' }}>{e}</div>
            ))}
          </div>
        )}

        <div style={{ padding: '16px 24px', flex: 1 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>{i.execHistoryTitle}</h3>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>}
          {!loading && executions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.noExecYet}</div>}
          {executions.map((e) => (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>{e.status === 'completed' ? '✅' : e.status === 'failed' ? '❌' : '⏳'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{e.trigger_event}</div>
                {e.result?.log?.slice(0, 2).map((l: string, idx: number) => (
                  <div key={idx} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</div>
                ))}
                {e.error && <div style={{ fontSize: 11, color: '#ef4444' }}>{e.error}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {e.created_at ? new Date(e.created_at).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [logRule, setLogRule] = useState<AutomationRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, a, t, tm, q] = await Promise.all([
      getAutomations().catch(() => []),
      getAgents().catch(() => []),
      getTags().catch(() => []),
      getTeams().catch(() => []),
      getQueues().catch(() => []),
    ]);
    setRules(r); setAgents(a); setTags(t); setTeams(tm); setQueues(q);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(rule: AutomationRule) {
    await toggleAutomation(rule.id);
    load();
  }

  async function handleDelete(rule: AutomationRule) {
    if (!confirm(`${i.delete} "${rule.name}"?`)) return;
    await deleteAutomation(rule.id);
    load();
  }

  const active = rules.filter((r) => r.isActive ?? r.is_active);
  const inactive = rules.filter((r) => !(r.isActive ?? r.is_active));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.automations}</h1>
          <p className="page-subtitle">{i.automationsSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.newAutomation}</button>
      </div>

      {/* Stats */}
      {!loading && rules.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: i.totalRules, value: rules.length, color: '#6366f1' },
            { label: i.active, value: active.length, color: '#22c55e' },
            { label: i.inactive, value: inactive.length, color: '#64748b' },
            { label: i.execsOk, value: rules.reduce((s, r) => s + (r.executionsOk ?? r.executions_ok ?? 0), 0), color: '#3b82f6' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
      ) : rules.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{i.noAutomations}</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{i.noAutomationsHint}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            <em>{i.automationsExample}</em>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.createFirstAutomation}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map((rule) => {
            const isActive = rule.isActive ?? rule.is_active;
            const okCount = rule.executionsOk ?? rule.executions_ok ?? 0;
            const failCount = rule.executionsFailed ?? rule.executions_failed ?? 0;
            const triggerLabel = TRIGGER_LABEL[rule.triggerEvent ?? rule.trigger_event ?? ''] ?? rule.triggerEvent;

            return (
              <div key={rule.id} className="card" style={{ borderLeft: `4px solid ${isActive ? '#22c55e' : '#cbd5e1'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{rule.name}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        background: isActive ? '#dcfce7' : '#f1f5f9',
                        color: isActive ? '#15803d' : '#64748b',
                      }}>
                        {isActive ? `● ${i.active}` : `○ ${i.inactive}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, background: '#eff6ff', color: '#3b82f6', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
                        ⚡ {triggerLabel}
                      </span>
                      {(rule.actions ?? []).slice(0, 3).map((a, idx) => {
                        const m = ACTION_LABEL[a.type];
                        return m ? (
                          <span key={idx} style={{ fontSize: 11, background: 'var(--bg-hover)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 4 }}>
                            {m.icon} {m.label}
                          </span>
                        ) : null;
                      })}
                      {(rule.actions ?? []).length > 3 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{rule.actions.length - 3} más</span>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14 }}>
                      {(okCount + failCount) > 0 && (
                        <>
                          <span style={{ color: '#22c55e' }}>✅ {okCount} OK</span>
                          {failCount > 0 && <span style={{ color: '#ef4444' }}>❌ {failCount} {i.automationErrors}</span>}
                        </>
                      )}
                      {rule.last_executed_at && (
                        <span>{i.automationLast} {new Date(rule.last_executed_at).toLocaleDateString(i.locale)}</span>
                      )}
                      {rule.created_by_name && <span>{rule.created_by_name}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setLogRule(rule)}>
                      📊 Log
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', color: isActive ? '#f59e0b' : '#22c55e' }}
                      onClick={() => handleToggle(rule)}
                    >
                      {isActive ? `⏸ ${i.flowPauseBtn}` : `▶ ${i.flowActivateBtn}`}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditing(rule); setShowModal(true); }}>
                      {i.edit}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDelete(rule)}>
                      {i.delete}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <RuleModal
          rule={editing}
          agents={agents} tags={tags} teams={teams} queues={queues}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
      {logRule && <ExecutionLog rule={logRule} onClose={() => setLogRule(null)} />}
    </div>
  );
}
