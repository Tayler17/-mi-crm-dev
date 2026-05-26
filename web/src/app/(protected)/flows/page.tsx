'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getFlows, createFlow, updateFlow, deleteFlow, toggleFlow, duplicateFlow, getFlowSessions,
  getInboxes, getAgents, getTags, getTeams, getQueues,
  type ConversationFlow, type FlowStep,
  type Inbox, type Agent, type Tag, type Team, type Queue,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Step type catalog ─────────────────────────────────────────────────────────

const STEP_TYPES = [
  // Messaging
  { type: 'message',          label: 'Enviar mensaje',        icon: '💬', color: '#3b82f6',  group: 'Mensajes' },
  { type: 'menu',             label: 'Menú de opciones',      icon: '📋', color: '#8b5cf6',  group: 'Mensajes' },
  { type: 'input',            label: 'Pedir respuesta',        icon: '⌨️',  color: '#06b6d4',  group: 'Mensajes' },
  { type: 'note',             label: 'Nota interna',          icon: '📝', color: '#f59e0b',  group: 'Mensajes' },
  // Logic
  { type: 'condition',        label: 'Condición',             icon: '🔀', color: '#f97316',  group: 'Lógica' },
  { type: 'wait',             label: 'Esperar',               icon: '⏱',  color: '#6366f1',  group: 'Lógica' },
  // CRM actions
  { type: 'assign',           label: 'Asignar agente/cola',   icon: '👤', color: '#22c55e',  group: 'CRM' },
  { type: 'tag',              label: 'Añadir tag',            icon: '🏷',  color: '#ec4899',  group: 'CRM' },
  { type: 'create_deal',      label: 'Crear deal',            icon: '💼', color: '#10b981',  group: 'CRM' },
  { type: 'close_conversation', label: 'Cerrar conversación', icon: '✅', color: '#64748b',  group: 'CRM' },
  // Integrations
  { type: 'http_request',     label: 'HTTP / Webhook',        icon: '🌐', color: '#7c3aed',  group: 'Integraciones' },
  // End
  { type: 'end',              label: 'Fin del flujo',         icon: '🏁', color: '#94a3b8',  group: 'Fin' },
] as const;

const STEP_META = Object.fromEntries(STEP_TYPES.map((s) => [s.type, s]));

const TRIGGERS = [
  { value: 'new_conversation',  label: '🆕 Nueva conversación' },
  { value: 'keyword',           label: '🔑 Palabra clave' },
  { value: 'first_message',     label: '👋 Primer mensaje del contacto' },
  { value: 'reopened',          label: '↩️ Conversación reabierta' },
  { value: 'message_resolved',  label: '✅ Conversación resuelta' },
  { value: 'tag_added',         label: '🏷 Tag añadido al contacto' },
  { value: 'inactivity',        label: '⏰ Inactividad del contacto' },
];

// ── Flow Templates ────────────────────────────────────────────────────────────

interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  icon: string;
  triggerType: string;
  triggerValue?: string;
  steps: FlowStep[];
}

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    slug: 'bienvenida-menu',
    name: 'Bienvenida + Menú',
    description: 'Saludo automático con menú de opciones para dirigir al contacto al área correcta.',
    icon: '👋',
    triggerType: 'new_conversation',
    steps: [
      { id: 's1', type: 'message', label: 'Saludo inicial', text: '¡Hola {{contact.name}}! Bienvenido/a. Soy el asistente virtual y estoy aquí para ayudarte.', nextStepId: 's2' },
      { id: 's2', type: 'menu', label: 'Menú principal', text: '¿Cómo podemos ayudarte hoy?', options: [
        { label: 'Información / Ventas', nextStepId: 's3' },
        { label: 'Soporte técnico', nextStepId: 's4' },
        { label: 'Hablar con un agente', nextStepId: 's5' },
      ]},
      { id: 's3', type: 'message', label: 'Resp. ventas', text: '¡Excelente! Te conectamos con nuestro equipo de ventas. Un asesor te atenderá en breve.', nextStepId: 's5' },
      { id: 's4', type: 'message', label: 'Resp. soporte', text: 'Entendido. Te redirigimos al equipo de soporte técnico. Un especialista te atenderá pronto.', nextStepId: 's5' },
      { id: 's5', type: 'assign', label: 'Asignar a cola', assignTo: 'queue', assignId: '', nextStepId: 's6' },
      { id: 's6', type: 'end', text: 'Gracias por contactarnos. ¡Hasta pronto!' },
    ],
  },
  {
    slug: 'captacion-leads',
    name: 'Captación de leads',
    description: 'Recoge nombre, email e interés del contacto y crea un deal automáticamente.',
    icon: '🎯',
    triggerType: 'first_message',
    steps: [
      { id: 's1', type: 'message', label: 'Bienvenida', text: '¡Hola! Gracias por contactarnos. Me gustaría conocerte mejor para brindarte la mejor atención.', nextStepId: 's2' },
      { id: 's2', type: 'input', label: 'Pedir nombre', text: '¿Cuál es tu nombre?', saveAs: 'nombre', nextStepId: 's3' },
      { id: 's3', type: 'input', label: 'Pedir email', text: '¿Cuál es tu email de contacto?', saveAs: 'email', nextStepId: 's4' },
      { id: 's4', type: 'input', label: 'Pedir interés', text: '¿En qué servicio o producto estás interesado/a?', saveAs: 'interes', nextStepId: 's5' },
      { id: 's5', type: 'create_deal', label: 'Crear deal', dealTitle: 'Lead - {{contact.name}}', dealStageId: '', dealValue: 0, nextStepId: 's6' },
      { id: 's6', type: 'message', label: 'Confirmación', text: '¡Perfecto, {{saved.nombre}}! Hemos registrado tus datos. Un asesor especializado te contactará muy pronto.', nextStepId: 's7' },
      { id: 's7', type: 'end', text: 'Gracias por tu interés en nuestros servicios. ¡Hasta pronto!' },
    ],
  },
  {
    slug: 'soporte-tecnico',
    name: 'Soporte técnico',
    description: 'Triaje de problemas: clasifica el tipo de incidencia y asigna al área correcta.',
    icon: '🔧',
    triggerType: 'keyword',
    triggerValue: 'soporte',
    steps: [
      { id: 's1', type: 'message', label: 'Bienvenida soporte', text: '¡Hola! Entiendo que necesitas soporte técnico. Vamos a resolver tu problema rápidamente.', nextStepId: 's2' },
      { id: 's2', type: 'menu', label: 'Tipo de problema', text: '¿Con qué tipo de problema necesitas ayuda?', options: [
        { label: 'Problemas de acceso / contraseña', nextStepId: 's3' },
        { label: 'Error en la aplicación', nextStepId: 's4' },
        { label: 'Consulta general', nextStepId: 's5' },
      ]},
      { id: 's3', type: 'input', label: 'Detalles acceso', text: 'Describe el problema de acceso que tienes (ej: no puedo iniciar sesión, contraseña olvidada...)', saveAs: 'problema', nextStepId: 's6' },
      { id: 's4', type: 'input', label: 'Detalles error', text: 'Describe el error que estás viendo. ¿Cuándo ocurre? ¿Qué acción realizas?', saveAs: 'problema', nextStepId: 's6' },
      { id: 's5', type: 'input', label: 'Consulta general', text: '¿Cuál es tu consulta?', saveAs: 'consulta', nextStepId: 's6' },
      { id: 's6', type: 'note', label: 'Nota para agente', noteText: 'Cliente necesita soporte. Detalle: {{saved.problema}}{{saved.consulta}}', nextStepId: 's7' },
      { id: 's7', type: 'assign', label: 'Asignar soporte', assignTo: 'queue', assignId: '', nextStepId: 's8' },
      { id: 's8', type: 'end', text: 'Un técnico especializado te atenderá en breve. Gracias por tu paciencia.' },
    ],
  },
  {
    slug: 'encuesta-satisfaccion',
    name: 'Encuesta de satisfacción',
    description: 'Recoge valoración al resolver una conversación y etiqueta según el resultado.',
    icon: '⭐',
    triggerType: 'message_resolved',
    steps: [
      { id: 's1', type: 'message', label: 'Invitación', text: '¡Hola {{contact.name}}! Tu consulta ha sido resuelta. ¿Podrías tomar 30 segundos para valorar nuestra atención?', nextStepId: 's2' },
      { id: 's2', type: 'menu', label: 'Escala valoración', text: '¿Cómo valorarías nuestra atención?', options: [
        { label: '⭐⭐⭐⭐⭐ Excelente', nextStepId: 's3' },
        { label: '⭐⭐⭐⭐ Buena', nextStepId: 's4' },
        { label: '⭐⭐⭐ Regular', nextStepId: 's5' },
        { label: '⭐ Mala', nextStepId: 's6' },
      ]},
      { id: 's3', type: 'tag', label: 'Tag: satisfecho', tagName: 'satisfecho', nextStepId: 's8' },
      { id: 's4', type: 'tag', label: 'Tag: satisfecho', tagName: 'satisfecho', nextStepId: 's8' },
      { id: 's5', type: 'tag', label: 'Tag: neutral', tagName: 'neutral', nextStepId: 's9' },
      { id: 's6', type: 'tag', label: 'Tag: insatisfecho', tagName: 'insatisfecho', nextStepId: 's7' },
      { id: 's7', type: 'input', label: 'Pedir mejora', text: 'Lamentamos que tu experiencia no haya sido la mejor. ¿Qué podemos mejorar?', saveAs: 'mejora', nextStepId: 's9' },
      { id: 's8', type: 'end', text: '¡Muchas gracias por tu valoración! Nos alegra saber que quedaste satisfecho/a. ¡Hasta pronto!' },
      { id: 's9', type: 'assign', label: 'Asignar seguimiento', assignTo: 'queue', assignId: '', nextStepId: 's10' },
      { id: 's10', type: 'end', text: 'Gracias por tu comentario. Un responsable se pondrá en contacto contigo pronto.' },
    ],
  },
  {
    slug: 'agendamiento-cita',
    name: 'Agendamiento de cita',
    description: 'Recoge datos para agendar una cita y crea una nota interna para el equipo.',
    icon: '📅',
    triggerType: 'keyword',
    triggerValue: 'cita',
    steps: [
      { id: 's1', type: 'message', label: 'Inicio', text: '¡Hola! Con mucho gusto te ayudamos a agendar una cita. Necesitamos algunos datos.', nextStepId: 's2' },
      { id: 's2', type: 'input', label: 'Nombre completo', text: '¿Cuál es tu nombre completo?', saveAs: 'nombre', nextStepId: 's3' },
      { id: 's3', type: 'input', label: 'Motivo cita', text: '¿Cuál es el motivo de la cita?', saveAs: 'motivo', nextStepId: 's4' },
      { id: 's4', type: 'input', label: 'Fecha preferida', text: '¿Qué fecha prefieres? (Ej: lunes 20 de mayo)', saveAs: 'fecha', nextStepId: 's5' },
      { id: 's5', type: 'input', label: 'Horario preferido', text: '¿En qué horario te viene mejor? (Ej: 10:00 - 11:00)', saveAs: 'horario', nextStepId: 's6' },
      { id: 's6', type: 'note', label: 'Nota solicitud', noteText: 'Solicitud de cita:\n- Nombre: {{saved.nombre}}\n- Motivo: {{saved.motivo}}\n- Fecha: {{saved.fecha}}\n- Horario: {{saved.horario}}', nextStepId: 's7' },
      { id: 's7', type: 'message', label: 'Confirmación', text: '¡Perfecto, {{saved.nombre}}! Hemos recibido tu solicitud para el {{saved.fecha}} a las {{saved.horario}}. Te confirmaremos la disponibilidad a la brevedad.', nextStepId: 's8' },
      { id: 's8', type: 'end', text: 'Gracias por contactarnos. ¡Hasta pronto!' },
    ],
  },
  {
    slug: 'carta-restaurante',
    name: 'Carta digital — Restaurante',
    description: 'Muestra el menú por categorías (entradas, platos, postres, bebidas) y recoge pedidos de entrega o recogida.',
    icon: '🍽',
    triggerType: 'new_conversation',
    steps: [
      { id: 's1', type: 'message', label: 'Bienvenida', text: '🍽 ¡Bienvenido/a a [Nombre del Restaurante]!\nAquí puedes consultar nuestra carta y hacer tu pedido directamente por este chat.', nextStepId: 's2' },
      { id: 's2', type: 'menu', label: 'Categorías', text: '¿Qué deseas ver?', options: [
        { label: '🥗 Entradas', nextStepId: 's3' },
        { label: '🍖 Platos principales', nextStepId: 's4' },
        { label: '🍰 Postres', nextStepId: 's5' },
        { label: '🥤 Bebidas', nextStepId: 's6' },
        { label: '📦 Hacer un pedido', nextStepId: 's7' },
      ]},
      { id: 's3', type: 'message', label: 'Entradas', text: '🥗 *ENTRADAS*\n\n• Ensalada mixta — £6.50\n• Croquetas caseras (6 uds) — £7.00\n• Bruschetta de tomate — £5.50\n• Sopa del día — £5.00\n\nResponde con el número de la categoría para seguir explorando o escoge *5* para hacer tu pedido.', nextStepId: 's2' },
      { id: 's4', type: 'message', label: 'Platos principales', text: '🍖 *PLATOS PRINCIPALES*\n\n• Pollo al horno con verduras — £13.50\n• Pasta carbonara — £11.50\n• Salmón a la plancha — £16.00\n• Hamburguesa artesanal — £12.00\n• Risotto de champiñones — £11.00\n\nResponde con el número de la categoría para seguir explorando o escoge *5* para hacer tu pedido.', nextStepId: 's2' },
      { id: 's5', type: 'message', label: 'Postres', text: '🍰 *POSTRES*\n\n• Tiramisú — £5.50\n• Tarta de queso — £5.00\n• Brownie con helado — £5.50\n• Fruta del tiempo — £4.00\n\nResponde con el número de la categoría para seguir explorando o escoge *5* para hacer tu pedido.', nextStepId: 's2' },
      { id: 's6', type: 'message', label: 'Bebidas', text: '🥤 *BEBIDAS*\n\n• Agua (500 ml) — £1.50\n• Refresco — £2.50\n• Zumo natural — £3.50\n• Cerveza — £4.00\n• Vino (copa) — £5.00\n\nResponde con el número de la categoría para seguir explorando o escoge *5* para hacer tu pedido.', nextStepId: 's2' },
      { id: 's7', type: 'message', label: 'Inicio pedido', text: '📦 ¡Perfecto! Vamos a tomar tu pedido. Solo necesito unos datos rápidos.', nextStepId: 's8' },
      { id: 's8', type: 'input', label: 'Nombre cliente', text: '¿Cuál es tu nombre completo?', saveAs: 'nombre', nextStepId: 's9' },
      { id: 's9', type: 'menu', label: 'Tipo de pedido', text: '¿Es para entrega a domicilio o recogida en el local?', options: [
        { label: '🚚 Entrega a domicilio', nextStepId: 's10' },
        { label: '🏠 Recogida en el local', nextStepId: 's11' },
      ]},
      { id: 's10', type: 'input', label: 'Dirección entrega', text: '¿Cuál es tu dirección de entrega completa (calle, número, piso)?', saveAs: 'direccion', nextStepId: 's12' },
      { id: 's11', type: 'message', label: 'Info recogida', text: '✅ Perfecto, recogerás tu pedido en el local.\n📍 C/ [Dirección del restaurante] — Horario: Lun-Dom 12:00-22:00', nextStepId: 's12' },
      { id: 's12', type: 'input', label: 'Productos', text: '¿Qué deseas pedir? Escribe los platos y cantidades.\n\nEj: 2x Pollo al horno, 1x Tiramisú, 2x Refresco', saveAs: 'pedido', nextStepId: 's13' },
      { id: 's13', type: 'note', label: 'Nota cocina', noteText: '🛒 NUEVO PEDIDO\n👤 Cliente: {{saved.nombre}}\n📍 Entrega/Recogida: {{saved.direccion}}\n🍽 Pedido: {{saved.pedido}}', nextStepId: 's14' },
      { id: 's14', type: 'assign', label: 'Asignar a cola', assignTo: 'queue', assignId: '', nextStepId: 's15' },
      { id: 's15', type: 'end', text: '✅ ¡Pedido recibido, {{saved.nombre}}!\n\nEstamos preparando todo. En breves te confirmamos el tiempo estimado. ¡Gracias por elegirnos! 🙏' },
    ],
  },
  {
    slug: 'fuera-horario',
    name: 'Fuera de horario',
    description: 'Informa el horario de atención y recoge el mensaje para responder al día siguiente.',
    icon: '🌙',
    triggerType: 'inactivity',
    triggerValue: '30',
    steps: [
      { id: 's1', type: 'message', label: 'Aviso horario', text: '¡Hola! Gracias por contactarnos. En este momento estamos fuera de nuestro horario de atención (Lun-Vie, 9:00-18:00). ¡Te atenderemos en cuanto abramos!', nextStepId: 's2' },
      { id: 's2', type: 'input', label: 'Pedir nombre', text: '¿Puedes dejarnos tu nombre para identificarte cuando te contactemos?', saveAs: 'nombre', nextStepId: 's3' },
      { id: 's3', type: 'input', label: 'Pedir consulta', text: '¿Cuál es el motivo de tu consulta? Con gusto lo atendemos en cuanto abramos.', saveAs: 'consulta', nextStepId: 's4' },
      { id: 's4', type: 'note', label: 'Nota para agente', noteText: 'Consulta fuera de horario:\n- Nombre: {{saved.nombre}}\n- Consulta: {{saved.consulta}}', nextStepId: 's5' },
      { id: 's5', type: 'end', text: '¡Gracias, {{saved.nombre}}! Un agente te contactará al inicio del siguiente horario de atención. Disculpa las molestias.' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function newStep(type: FlowStep['type']): FlowStep {
  const base = { id: uid(), type };
  switch (type) {
    case 'message':           return { ...base, text: '' };
    case 'menu':              return { ...base, text: '¿Cómo podemos ayudarte?', options: [{ label: 'Opción 1', nextStepId: '' }] };
    case 'input':             return { ...base, text: '¿Cuál es tu nombre?', saveAs: 'nombre' };
    case 'condition':         return { ...base, field: 'message.body', operator: 'contains', value: '', trueStepId: '', falseStepId: '' };
    case 'assign':            return { ...base, assignTo: 'queue', assignId: '' };
    case 'tag':               return { ...base, tagName: '' };
    case 'wait':              return { ...base, seconds: 60 };
    case 'end':               return { ...base, text: 'Gracias por contactarnos. ¡Hasta pronto!' };
    case 'note':              return { ...base, noteText: '' };
    case 'create_deal':       return { ...base, dealTitle: 'Deal - {{contact.name}}', dealStageId: '', dealValue: 0 };
    case 'close_conversation':return { ...base, farewellText: '' };
    case 'http_request':      return { ...base, httpMethod: 'POST', httpUrl: '', httpHeaders: '{}', httpBody: '', httpSaveAs: '' };
    default:                  return base as FlowStep;
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

    case 'condition': {
      const noValueOps = ['is_empty', 'is_not_empty'];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Campo</label>
              <select className="form-input" style={{ fontSize: 12 }} value={step.field ?? ''} onChange={(e) => set('field', e.target.value)}>
                <option value="">— Campo —</option>
                <optgroup label="Mensaje">
                  <option value="message.body">Mensaje recibido</option>
                </optgroup>
                <optgroup label="Contacto">
                  <option value="contact.name">Nombre del contacto</option>
                  <option value="contact.phone">Teléfono</option>
                  <option value="contact.email">Email</option>
                  <option value="contact.tag">Tag del contacto</option>
                </optgroup>
                <optgroup label="Variables guardadas">
                  <option value="saved.nombre">Variable: nombre</option>
                  <option value="saved.email">Variable: email</option>
                  <option value="saved.telefono">Variable: telefono</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Operador</label>
              <select className="form-input" style={{ fontSize: 12 }} value={step.operator ?? 'contains'} onChange={(e) => set('operator', e.target.value)}>
                <option value="contains">contiene</option>
                <option value="not_contains">no contiene</option>
                <option value="equals">es igual a</option>
                <option value="not_equals">no es igual a</option>
                <option value="starts_with">empieza con</option>
                <option value="ends_with">termina con</option>
                <option value="is_empty">está vacío</option>
                <option value="is_not_empty">no está vacío</option>
                <option value="regex">coincide regex</option>
              </select>
            </div>
          </div>
          {!noValueOps.includes(step.operator ?? '') && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Valor</label>
              <input className="form-input" style={{ fontSize: 12 }} value={step.value ?? ''} onChange={(e) => set('value', e.target.value)} placeholder="valor a comparar..." />
            </div>
          )}
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
    }

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

    case 'note':
      return (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Texto de la nota (solo visible para agentes)</label>
          <textarea className="form-input" rows={3} value={step.noteText ?? ''} onChange={(e) => set('noteText', e.target.value)} placeholder="Nota interna sobre este punto del flujo..." />
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );

    case 'create_deal':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Título del deal</label>
            <input className="form-input" style={{ fontSize: 12 }} value={step.dealTitle ?? ''} onChange={(e) => set('dealTitle', e.target.value)} placeholder="Deal - {{contact.name}}" />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{'Variables: {{contact.name}}, {{saved.nombre}}'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>ID de etapa</label>
              <input className="form-input" style={{ fontSize: 12 }} value={step.dealStageId ?? ''} onChange={(e) => set('dealStageId', e.target.value)} placeholder="uuid de la etapa" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Valor ($)</label>
              <input className="form-input" type="number" min={0} style={{ fontSize: 12 }} value={step.dealValue ?? 0} onChange={(e) => set('dealValue', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );

    case 'close_conversation':
      return (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mensaje de despedida (opcional)</label>
          <textarea className="form-input" rows={2} value={step.farewellText ?? ''} onChange={(e) => set('farewellText', e.target.value)} placeholder="Gracias por contactarnos. ¡Hasta pronto!" />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Si se deja vacío, la conversación se cierra sin enviar mensaje.</div>
        </div>
      );

    case 'http_request': {
      const withBody = ['POST', 'PUT', 'PATCH'].includes(step.httpMethod ?? 'POST');
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 6 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Método</label>
              <select className="form-input" style={{ fontSize: 12 }} value={step.httpMethod ?? 'POST'} onChange={(e) => set('httpMethod', e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>URL</label>
              <input className="form-input" style={{ fontSize: 12 }} value={step.httpUrl ?? ''} onChange={(e) => set('httpUrl', e.target.value)} placeholder="https://api.ejemplo.com/webhook" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Headers (JSON)</label>
            <textarea className="form-input" rows={2} style={{ fontSize: 11, fontFamily: 'monospace' }} value={step.httpHeaders ?? '{}'} onChange={(e) => set('httpHeaders', e.target.value)} placeholder='{"Authorization": "Bearer token"}' />
          </div>
          {withBody && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Body (JSON)</label>
              <textarea className="form-input" rows={3} style={{ fontSize: 11, fontFamily: 'monospace' }} value={step.httpBody ?? ''} onChange={(e) => set('httpBody', e.target.value)} placeholder='{"name":"{{contact.name}}","phone":"{{contact.phone}}"}' />
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Guardar respuesta en variable</label>
            <input className="form-input" style={{ fontSize: 12 }} value={step.httpSaveAs ?? ''} onChange={(e) => set('httpSaveAs', e.target.value)} placeholder="respuesta_api (opcional)" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Siguiente paso</label>
            <StepSelect value={step.nextStepId ?? ''} onChange={(v) => set('nextStepId', v)} placeholder="— Continuar al siguiente —" />
          </div>
        </div>
      );
    }

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
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [name, setName] = useState(flow?.name ?? '');
  const [description, setDescription] = useState(flow?.description ?? '');
  const [inboxId, setInboxId] = useState(flow?.inboxId ?? '');
  const [triggerType, setTriggerType] = useState(flow?.triggerType ?? flow?.trigger_type ?? 'new_conversation');
  const [triggerValue, setTriggerValue] = useState(flow?.triggerValue ?? flow?.trigger_value ?? '');
  const [steps, setSteps] = useState<FlowStep[]>(flow?.steps ?? []);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [mobileTab, setMobileTab] = useState<'config' | 'steps' | 'editor'>('steps');

  function addStep(type: FlowStep['type']) {
    const s = newStep(type);
    setSteps((p) => [...p, s]);
    setSelectedStep(s.id);
    setMobileTab('steps');
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
      const idx = p.findIndex((s) => s.id === id);
      if (idx + dir < 0 || idx + dir >= p.length) return p;
      const arr = [...p];
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
      return arr;
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true); setSaveError('');
    try {
      const payload = { name, description, inboxId: inboxId || undefined, triggerType, triggerValue: triggerValue || undefined, steps };
      if (flow?.id) await updateFlow(flow.id, payload);
      else await createFlow(payload);
      onSaved();
    } catch (err: any) { setSaveError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  const activeStep = steps.find((s) => s.id === selectedStep);
  const builderTitle = flow?.id ? i.flowEditTitle : flow?.steps?.length ? i.flowFromTemplateTitle : i.flowNewTitle;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex' }}>
      <div style={{ background: 'var(--bg-card)', width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>⚡ {builderTitle}</h2>
            <input className="form-input" style={{ fontSize: 14, fontWeight: 600, width: 280 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={i.flowNewTitle + '...'} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saveError && <span style={{ fontSize: 13, color: '#dc2626', maxWidth: 300 }}>{saveError}</span>}
            <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
            <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={handleSave}>
              {saving ? i.saving : `💾 ${i.flowBuilderSave}`}
            </button>
          </div>
        </div>

        {/* Mobile tab bar */}
        <div style={{ display: 'none' }} className="flow-mobile-tabs">
          {([['config', '⚙ Config'], ['steps', '⚡ Pasos'], ['editor', '✏️ Editor']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              style={{
                flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: mobileTab === tab ? 'var(--primary)' : 'var(--surface)',
                color: mobileTab === tab ? '#fff' : 'var(--text-muted)',
                borderBottom: mobileTab === tab ? '2px solid var(--primary)' : '2px solid var(--border)',
              }}
            >{label}</button>
          ))}
        </div>

        <div className="flow-builder-body" data-tab={mobileTab} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Settings */}
          <div className="flow-builder-left" style={{ width: 240, borderRight: '1px solid var(--border)', padding: 14, overflowY: 'auto', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>{i.flowBuilderConfig}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Inbox</label>
                <select className="form-input" style={{ fontSize: 12 }} value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
                  <option value="">{i.flowBuilderAllInboxes}</option>
                  {inboxes.map((inbox) => <option key={inbox.id} value={inbox.id}>{inbox.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{i.flowBuilderTrigger}</label>
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
              {triggerType === 'tag_added' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Nombre del tag</label>
                  <input className="form-input" style={{ fontSize: 12 }} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="vip, interesado..." />
                </div>
              )}
              {triggerType === 'inactivity' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Minutos de inactividad</label>
                  <input className="form-input" type="number" min={1} style={{ fontSize: 12 }} value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="30" />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>{i.descriptionLabel}</label>
                <textarea className="form-input" rows={2} style={{ fontSize: 12 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={i.descriptionLabel + '...'} />
              </div>
            </div>

            <div style={{ marginTop: 16, fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{i.flowBuilderAddStep}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Object.entries(
                STEP_TYPES.reduce<Record<string, typeof STEP_TYPES[number][]>>((acc, st) => {
                  (acc[st.group] ??= []).push(st);
                  return acc;
                }, {})
              ).map(([group, types]) => (
                <div key={group}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 4px', paddingLeft: 2 }}>{group}</div>
                  {types.map((st) => (
                    <button
                      key={st.type}
                      onClick={() => addStep(st.type as FlowStep['type'])}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, border: `1px solid ${st.color}33`, background: st.color + '11', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: st.color, textAlign: 'left', width: '100%', marginBottom: 3 }}
                    >
                      <span style={{ fontSize: 14 }}>{st.icon}</span> {st.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Center: Step list (visual flow) */}
          <div className="flow-builder-center" style={{ flex: 1, padding: 20, overflowY: 'auto', background: 'var(--bg)' }}>
            {steps.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{i.flowBuilderEmpty}</div>
                <div style={{ fontSize: 13 }}>{i.flowBuilderEmptyHint}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                {/* Start node */}
                <div style={{ padding: '8px 20px', borderRadius: 20, background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  🚀 INICIO — {TRIGGERS.find((t) => t.value === triggerType)?.label}
                </div>

                {steps.map((step, idx) => {
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
                              {(step.type === 'message' || step.type === 'end') ? ((step.text?.slice(0, 50) ?? '') + (step.text && step.text.length > 50 ? '...' : '')) : ''}
                              {step.type === 'menu' ? `${(step.options ?? []).length} opciones` : ''}
                              {step.type === 'assign' ? `→ ${step.assignTo}` : ''}
                              {step.type === 'tag' ? `#${step.tagName}` : ''}
                              {step.type === 'wait' ? `${step.seconds}s` : ''}
                              {step.type === 'condition' ? `${step.field} ${step.operator} "${step.value}"` : ''}
                              {step.type === 'input' ? `guardar como: ${step.saveAs}` : ''}
                              {step.type === 'note' ? (step.noteText?.slice(0, 50) ?? '') + (step.noteText && step.noteText.length > 50 ? '...' : '') : ''}
                              {step.type === 'create_deal' ? (step.dealTitle || 'Sin título') : ''}
                              {step.type === 'close_conversation' ? (step.farewellText ? '+ mensaje de despedida' : 'cierre silencioso') : ''}
                              {step.type === 'http_request' ? `${step.httpMethod ?? 'POST'} ${step.httpUrl?.slice(0, 35) ?? ''}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={(e) => { e.stopPropagation(); moveStep(step.id, -1); }} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--border)' : 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}>↑</button>
                            <button onClick={(e) => { e.stopPropagation(); moveStep(step.id, 1); }} disabled={idx === steps.length - 1} style={{ background: 'none', border: 'none', cursor: idx === steps.length - 1 ? 'default' : 'pointer', color: idx === steps.length - 1 ? 'var(--border)' : 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}>↓</button>
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
          <div className="flow-builder-right" style={{ width: 320, borderLeft: '1px solid var(--border)', padding: 16, overflowY: 'auto', background: 'var(--surface)' }}>
            {activeStep ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{STEP_META[activeStep.type]?.icon}</span>
                  <span style={{ color: STEP_META[activeStep.type]?.color }}>{STEP_META[activeStep.type]?.label}</span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{i.flowBuilderStepName}</label>
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
                {i.flowBuilderSelectStep}
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
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBuilder, setShowBuilder] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editing, setEditing] = useState<ConversationFlow | null>(null);
  const [viewSessions, setViewSessions] = useState<ConversationFlow | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, inbx, a, t, tm, q] = await Promise.all([
      getFlows().catch(() => []),
      getInboxes().catch(() => []),
      getAgents().catch(() => []),
      getTags().catch(() => []),
      getTeams().catch(() => []),
      getQueues().catch(() => []),
    ]);
    setFlows(f); setInboxes(inbx); setAgents(a); setTags(t); setTeams(tm); setQueues(q);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function importTemplate(tpl: FlowTemplate) {
    const idMap: Record<string, string> = {};
    tpl.steps.forEach((s) => { idMap[s.id] = uid(); });
    const remap = (id?: string) => id ? (idMap[id] ?? id) : id;

    const steps: FlowStep[] = tpl.steps.map((s) => ({
      ...s,
      id: idMap[s.id],
      nextStepId: remap(s.nextStepId),
      trueStepId: remap(s.trueStepId),
      falseStepId: remap(s.falseStepId),
      options: s.options?.map((o) => ({ ...o, nextStepId: remap(o.nextStepId) ?? '' })),
    }));

    setEditing({
      id: '',
      name: tpl.name,
      description: tpl.description,
      triggerType: tpl.triggerType,
      trigger_type: tpl.triggerType,
      triggerValue: tpl.triggerValue,
      trigger_value: tpl.triggerValue,
      steps,
      isActive: false,
      is_active: false,
    } as unknown as ConversationFlow);
    setShowTemplates(false);
    setShowBuilder(true);
  }

  async function handleDelete(f: ConversationFlow) {
    if (!confirm(i.flowDeleteConfirm)) return;
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

  // ── Export / Import JSON ──────────────────────────────────────────────────────

  function exportFlow(f: ConversationFlow) {
    const data = {
      name: f.name,
      description: f.description ?? '',
      triggerType: f.triggerType ?? f.trigger_type ?? 'new_conversation',
      triggerValue: f.triggerValue ?? f.trigger_value ?? '',
      steps: f.steps ?? [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.name.replace(/[^a-z0-9áéíóúñ]/gi, '-').toLowerCase()}.flow.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const importFileRef = useRef<HTMLInputElement>(null);

  function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data.steps)) {
          alert('Archivo inválido: falta el campo "steps". Asegúrate de exportar un flow válido.');
          return;
        }
        importTemplate({
          slug: 'imported-' + Date.now(),
          name: data.name ?? file.name.replace(/\.flow\.json$/, ''),
          description: data.description ?? '',
          icon: '📥',
          triggerType: data.triggerType ?? 'new_conversation',
          triggerValue: data.triggerValue ?? '',
          steps: data.steps,
        });
      } catch {
        alert('Error al leer el archivo. Asegúrate de que es un JSON válido.');
      }
      if (importFileRef.current) importFileRef.current.value = '';
    };
    reader.readAsText(file);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.flowsTitle}</h1>
          <p className="page-subtitle">{i.flowsSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={importFileRef} type="file" accept=".json,.flow.json" style={{ display: 'none' }} onChange={handleImportJson} />
          <button className="btn btn-secondary" onClick={() => importFileRef.current?.click()}>📁 Importar JSON</button>
          <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>📥 {i.flowFromTemplate}</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowBuilder(true); }}>{i.flowNew}</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
      ) : flows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{i.noFlowsYet}</div>
          <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            {i.noFlowsHint}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => importFileRef.current?.click()}>📁 Importar JSON</button>
            <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>📥 {i.flowImportTemplate}</button>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowBuilder(true); }}>{i.flowNewFromScratch}</button>
          </div>
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
                        {(f.steps ?? []).length} {i.flowStepsLabel}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: isActive ? '#dcfce7' : '#f1f5f9', color: isActive ? '#15803d' : '#64748b', flexShrink: 0, marginLeft: 8 }}>
                    {isActive ? `● ${i.active}` : `○ ${i.inactive}`}
                  </span>
                </div>

                {/* Stats */}
                {((f.total_sessions ?? 0) > 0) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>🔄 {f.total_sessions} {i.sessionsRecords}</span>
                    <span style={{ color: '#22c55e' }}>✓ {f.completed_sessions} {i.flowSessCompleted.toLowerCase()}</span>
                    {(f.active_sessions ?? 0) > 0 && <span style={{ color: '#3b82f6' }}>⚡ {f.active_sessions} {i.active.toLowerCase()}</span>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditing(f); setShowBuilder(true); }}>
                    ✏️ {i.edit}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', color: isActive ? '#f59e0b' : '#22c55e' }}
                    onClick={() => toggleFlow(f.id).then(load)}
                  >
                    {isActive ? `⏸ ${i.flowPauseBtn}` : `▶ ${i.flowActivateBtn}`}
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openSessions(f)}>
                    📊 {i.flowSessionsBtn}
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleDuplicate(f)}>
                    📋 {i.duplicate}
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => exportFlow(f)}>
                    📤 Exportar
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDelete(f)}>
                    {i.delete}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template picker */}
      {showTemplates && (
        <div className="modal-overlay" onClick={() => setShowTemplates(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 14, padding: '28px 28px 24px',
            width: '90%', maxWidth: 780, maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📥 {i.flowTemplatesTitle}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  {i.flowTemplatesHint}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => { setShowTemplates(false); importFileRef.current?.click(); }}
                >
                  📁 Importar JSON
                </button>
                <button className="modal-close" onClick={() => setShowTemplates(false)}>✕</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {FLOW_TEMPLATES.map((tpl) => {
                const triggerLabel = TRIGGERS.find((t) => t.value === tpl.triggerType)?.label ?? tpl.triggerType;
                return (
                  <div
                    key={tpl.slug}
                    className="card"
                    style={{ padding: '16px 18px', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px var(--primary)22'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                    onClick={() => importTemplate(tpl)}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8, lineHeight: 1 }}>{tpl.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{tpl.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>{tpl.description}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                        {triggerLabel}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                        {tpl.steps.length} {i.flowStepsLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
                <h3 style={{ margin: 0, fontSize: 16 }}>{i.flowSessionsBtn} — {viewSessions.name}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sessions.length} {i.sessionsRecords}</div>
              </div>
              <button className="modal-close" onClick={() => setViewSessions(null)}>✕</button>
            </div>
            <div style={{ padding: '14px 22px' }}>
              {sessions.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.noSessionsYet}</div>
                : sessions.map((s) => (
                  <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.contact_name ?? i.unknownContact}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.contact_phone} · {i.flowStep} {s.current_step + 1}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12 }}>
                      <div style={{ color: s.status === 'completed' ? '#22c55e' : s.status === 'abandoned' ? '#ef4444' : '#3b82f6', fontWeight: 600 }}>
                        {s.status === 'completed' ? `✓ ${i.flowSessCompleted}` : s.status === 'abandoned' ? `✗ ${i.flowSessAbandoned}` : `⚡ ${i.active}`}
                      </div>
                      <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{s.started_at ? new Date(s.started_at).toLocaleDateString(i.locale) : ''}</div>
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
