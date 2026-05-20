'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSettings } from '@/lib/api';

type UseCase = 'sales' | 'support' | 'both' | '';

const USE_CASES = [
  { id: 'sales',   icon: '📈', label: 'Equipo de ventas',       desc: 'Gestionar deals, pipelines y seguimiento de clientes' },
  { id: 'support', icon: '🎧', label: 'Soporte al cliente',      desc: 'Atender consultas y tickets por múltiples canales' },
  { id: 'both',    icon: '🚀', label: 'Ventas y soporte',        desc: 'El CRM completo para todo el ciclo del cliente' },
] as const;

type Action = { id: string; icon: string; title: string; desc: string; href: string; color: string };

const ALL_ACTIONS: Action[] = [
  { id: 'whatsapp', icon: '📱', title: 'Conectar WhatsApp',      desc: 'Atiende a tus clientes por WhatsApp directamente desde el CRM.',  href: '/connections',  color: '#22c55e' },
  { id: 'contacts', icon: '👥', title: 'Importar contactos',     desc: 'Sube tu base de datos en CSV y tenla lista en segundos.',           href: '/contacts',     color: '#6366f1' },
  { id: 'deals',    icon: '💰', title: 'Crear tu pipeline',      desc: 'Define las etapas de tu proceso de ventas y empieza a trackear.',   href: '/deals',        color: '#f59e0b' },
  { id: 'team',     icon: '🤝', title: 'Invitar a tu equipo',    desc: 'Agrega agentes y asigna roles para colaborar juntos.',              href: '/settings',     color: '#8b5cf6' },
  { id: 'queues',   icon: '📬', title: 'Crear colas de atención',desc: 'Organiza tu equipo en colas por producto, idioma o turno.',         href: '/queues',       color: '#0ea5e9' },
  { id: 'bots',     icon: '🤖', title: 'Configurar un chatbot',  desc: 'Automatiza respuestas frecuentes y deriva al agente correcto.',     href: '/chat-bots',    color: '#ec4899' },
];

const ACTIONS_BY_USE_CASE: Record<string, string[]> = {
  sales:   ['whatsapp', 'contacts', 'deals', 'team'],
  support: ['whatsapp', 'contacts', 'queues', 'bots'],
  both:    ['whatsapp', 'contacts', 'deals', 'team'],
  '':      ['whatsapp', 'contacts', 'deals', 'team'],
};

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [useCase, setUseCase] = useState<UseCase>('');
  const [userName, setUserName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        setUserName(u.fullName || u.email || '');
      }
    } catch {}

    getSettings()
      .then((s) => { if (s?.name) setWorkspaceName(s.name); })
      .catch(() => {});
  }, []);

  function finish() {
    localStorage.setItem('onboardingDone', 'true');
    router.push('/dashboard');
  }

  function skip() {
    localStorage.setItem('onboardingDone', 'true');
    router.push('/dashboard');
  }

  const firstName = userName.split(' ')[0] || 'ahí';
  const quickActions = (ACTIONS_BY_USE_CASE[useCase] || ACTIONS_BY_USE_CASE[''])
    .map((id) => ALL_ACTIONS.find((a) => a.id === id)!);

  // ── Styles ────────────────────────────────────────────────────────────────

  const page: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '40px 24px 60px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    position: 'relative',
  };

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 24, width: '100%', maxWidth: 600,
    padding: '48px 48px 40px',
    boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
  };

  const btn = (variant: 'primary' | 'ghost'): React.CSSProperties => ({
    padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: 15, transition: 'all .15s',
    ...(variant === 'primary' ? {
      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      color: '#fff',
      boxShadow: '0 4px 14px #6366f140',
    } : {
      background: 'transparent',
      color: '#94a3b8',
    }),
  });

  // ── Step content ──────────────────────────────────────────────────────────

  const stepContent: Record<number, React.ReactNode> = {
    1: (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h1 style={{ margin: '0 0 8px', color: '#1e1b4b', fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
          ¡Hola, {firstName}!
        </h1>
        {workspaceName && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 20, background: '#eef2ff', color: '#6366f1', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            🏢 {workspaceName}
          </div>
        )}
        <p style={{ color: '#64748b', margin: '0 0 32px', fontSize: 16, lineHeight: 1.7 }}>
          Tu workspace está listo. En los próximos pasos te ayudamos a configurar todo para que puedas empezar en minutos.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { icon: '💬', label: 'Mensajería unificada' },
            { icon: '📊', label: 'CRM & Deals' },
            { icon: '🤖', label: 'Automatizaciones' },
          ].map((f) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 20px', background: '#f8fafc', borderRadius: 12, minWidth: 120 }}>
              <span style={{ fontSize: 28 }}>{f.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),

    2: (
      <div>
        <h2 style={{ margin: '0 0 8px', color: '#1e1b4b', fontSize: 22, fontWeight: 800 }}>
          ¿Cómo usarás el CRM?
        </h2>
        <p style={{ color: '#64748b', margin: '0 0 28px', fontSize: 14 }}>
          Esto personaliza las acciones recomendadas para tu equipo.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {USE_CASES.map((uc) => {
            const selected = useCase === uc.id;
            return (
              <button
                key={uc.id}
                onClick={() => setUseCase(uc.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: selected ? '#eef2ff' : '#f8fafc',
                  outline: selected ? '2px solid #6366f1' : '2px solid transparent',
                  transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: 32, flexShrink: 0 }}>{uc.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 15 }}>{uc.label}</div>
                  <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{uc.desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? '#6366f1' : '#d1d5db'}`, background: selected ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ),

    3: (
      <div>
        <h2 style={{ margin: '0 0 4px', color: '#1e1b4b', fontSize: 22, fontWeight: 800 }}>
          Tus primeros pasos
        </h2>
        <p style={{ color: '#64748b', margin: '0 0 24px', fontSize: 14 }}>
          {useCase === 'sales'   && 'Para equipos de ventas recomendamos empezar conectando el canal y cargando tus prospectos.'}
          {useCase === 'support' && 'Para soporte, lo más importante es tener canales activos y el equipo organizado en colas.'}
          {useCase === 'both'    && 'Con ventas y soporte, configura el canal, tus contactos y empieza a asignar tu equipo.'}
          {useCase === ''        && 'Estas acciones te ayudarán a sacar el máximo provecho desde el primer día.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quickActions.map((action, i) => (
            <a
              key={action.id}
              href={action.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 12,
                background: '#f8fafc', textDecoration: 'none',
                border: '1px solid #f1f5f9', transition: 'background .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: action.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {action.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 14 }}>
                  <span style={{ marginRight: 6, color: '#94a3b8' }}>{i + 1}.</span>{action.title}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{action.desc}</div>
              </div>
              <span style={{ color: '#cbd5e1', fontSize: 18 }}>→</span>
            </a>
          ))}
        </div>
      </div>
    ),

    4: (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 72, marginBottom: 16, lineHeight: 1 }}>🚀</div>
        <h1 style={{ margin: '0 0 12px', color: '#1e1b4b', fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
          ¡Todo listo!
        </h1>
        <p style={{ color: '#64748b', margin: '0 0 36px', fontSize: 16, lineHeight: 1.7, maxWidth: 420, marginInline: 'auto' }}>
          Tu workspace está configurado. Ahora puedes empezar a gestionar tus contactos, conversaciones y ventas.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Contactos',       href: '/contacts',       bg: '#eef2ff', color: '#6366f1' },
            { label: 'Conversaciones',  href: '/conversations',  bg: '#f0fdf4', color: '#15803d' },
            { label: 'Deals',           href: '/deals',          bg: '#fffbeb', color: '#a16207' },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              style={{
                padding: '10px 18px', borderRadius: 10, background: item.bg,
                color: item.color, fontWeight: 600, fontSize: 13, textDecoration: 'none',
                border: `1px solid ${item.color}33`,
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
        <button onClick={finish} style={btn('primary')}>
          Ir al dashboard →
        </button>
      </div>
    ),
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const canAdvance = step !== 2 || useCase !== '';

  return (
    <div style={page}>
      {/* Decorative blobs */}
      <div style={{ position: 'absolute', top: -80, right: '10%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, #6366f122 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, left: '5%',  width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, #818cf811 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Logo */}
      <div style={{ marginBottom: 32, alignSelf: 'flex-start', fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        AutoMarkIQ
      </div>

      {/* Progress */}
      <div style={{ width: '100%', maxWidth: 600, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Paso {step} de {TOTAL_STEPS}</span>
          <button onClick={skip} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
            Omitir configuración →
          </button>
        </div>
        <div style={{ height: 4, background: '#ffffff18', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${(step / TOTAL_STEPS) * 100}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 99, transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* Card */}
      <div style={card}>
        <div style={{ minHeight: 340 }}>
          {stepContent[step]}
        </div>

        {/* Navigation */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, paddingTop: 24, borderTop: '1px solid #f1f5f9' }}>
            {step > 1 ? (
              <button onClick={() => setStep((s) => s - 1)} style={btn('ghost')}>
                ← Atrás
              </button>
            ) : <div />}
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              style={{
                ...btn('primary'),
                opacity: canAdvance ? 1 : 0.5,
                cursor: canAdvance ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 3 ? 'Ver resumen →' : 'Continuar →'}
            </button>
          </div>
        )}
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            style={{
              width: i + 1 === step ? 24 : 8,
              height: 8, borderRadius: 99,
              background: i + 1 <= step ? '#6366f1' : '#ffffff30',
              transition: 'all .3s ease',
            }}
          />
        ))}
      </div>

      <style suppressHydrationWarning>{`
        @media (max-width: 600px) {
          div[style*='padding: 48px 48px'] { padding: 32px 24px 28px !important; }
        }
      `}</style>
    </div>
  );
}
