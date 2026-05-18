'use client';
import './landing.css';
import { useEffect, useState } from 'react';
import { useLang, LANGS } from '@/lib/useLang';
import { LANDING } from '@/lib/i18n/landing';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Plan {
  id: string; name: string; slug: string; description?: string;
  price: number; currency: string; color: string; position: number;
  max_users: number; max_contacts: number; max_inboxes: number;
  max_ai_chatbots: number; max_call_bots: number; max_call_minutes: number;
  has_ai_chatbots: boolean; has_call_bots: boolean;
  has_reports: boolean; has_api_access: boolean;
  is_active: boolean; is_public: boolean;
}

const FALLBACK_PLANS: Plan[] = [
  { id:'1', name:'Free',     slug:'free',     price:0,   currency:'USD', color:'#64748b', position:0,
    max_users:2,  max_contacts:500,   max_inboxes:1, max_ai_chatbots:0, max_call_bots:0, max_call_minutes:0,
    has_ai_chatbots:false, has_call_bots:false, has_reports:false, has_api_access:false, is_active:true, is_public:true },
  { id:'2', name:'Pro',      slug:'pro',      price:49,  currency:'USD', color:'#6366f1', position:1,
    max_users:10, max_contacts:5000,  max_inboxes:5, max_ai_chatbots:3, max_call_bots:1, max_call_minutes:200,
    has_ai_chatbots:true,  has_call_bots:true,  has_reports:true,  has_api_access:false, is_active:true, is_public:true },
  { id:'3', name:'Business', slug:'business', price:149, currency:'USD', color:'#0ea5e9', position:2,
    max_users:-1, max_contacts:-1,    max_inboxes:-1,max_ai_chatbots:-1, max_call_bots:-1,max_call_minutes:-1,
    has_ai_chatbots:true,  has_call_bots:true,  has_reports:true,  has_api_access:true,  is_active:true, is_public:true },
];

const CHANNELS = [
  { name:'WhatsApp', icon:'📱', bg:'#dcfce7', border:'#86efac' },
  { name:'Instagram',icon:'📸', bg:'#fce7f3', border:'#f9a8d4' },
  { name:'Messenger',icon:'💬', bg:'#eff6ff', border:'#93c5fd' },
  { name:'Telegram', icon:'✈️', bg:'#e0f2fe', border:'#7dd3fc' },
  { name:'Email',    icon:'📧', bg:'#eef2ff', border:'#c7d2fe' },
  { name:'SMS',      icon:'💬', bg:'#f0fdf4', border:'#86efac' },
  { name:'Webchat',  icon:'🌐', bg:'#f5f3ff', border:'#c4b5fd' },
  { name:'Voice',    icon:'📞', bg:'#fef3c7', border:'#fcd34d' },
];

function fmt(n: number, unlimited: string) { return n === -1 ? unlimited : n.toLocaleString(); }

function planFeatures(p: Plan, t: typeof LANDING['es']): string[] {
  const n = (v: number, sg: string, pl: string) => v === -1 ? `${t.p_unlimited} ${pl}` : `${v} ${v === 1 ? sg : pl}`;
  return [
    n(p.max_users,    t.p_agent,      t.p_agents),
    n(p.max_contacts, t.p_contacts,   t.p_contacts),
    n(p.max_inboxes,  t.p_inbox,      t.p_inboxes),
    p.has_ai_chatbots
      ? n(p.max_ai_chatbots, t.p_ai_chatbot, t.p_ai_chatbots)
      : t.p_no_ai,
    p.has_call_bots
      ? `${fmt(p.max_call_minutes, t.p_unlimited)} ${t.p_call_min}`
      : t.p_no_call,
    p.has_reports ? t.p_reports_adv : t.p_reports_basic,
    p.has_api_access ? t.p_api : '',
  ].filter(Boolean);
}

const LANG_COLORS: Record<string, string> = {
  es: '#c60b1e', en: '#012169', pt: '#009c3b', tr: '#e30a17', ar: '#006c35',
};

function LangBadge({ code }: { code: string }) {
  return (
    <span style={{
      display: 'inline-block', background: LANG_COLORS[code] || '#64748b', color: '#fff',
      padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
      letterSpacing: '0.04em', minWidth: 24, textAlign: 'center',
    }}>
      {code.toUpperCase()}
    </span>
  );
}

function LangPicker({ lang, setLang }: { lang: string; setLang: (c: any) => void }) {
  const [open, setOpen] = useState(false);
  const current = LANGS.find(l => l.code === lang) ?? LANGS[0];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="land-lang-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          borderRadius: 8, border: '1px solid #e2e8f0',
          background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#475569',
        }}
      >
        <LangBadge code={current.code} />
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 20,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 148,
          }}>
            {LANGS.map(l => (
              <button key={l.code} onClick={() => { setLang(l.code); setOpen(false); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', border: 'none', background: l.code === lang ? '#f0f4ff' : '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: l.code === lang ? 700 : 500,
                color: l.code === lang ? '#6366f1' : '#374151', textAlign: 'left',
              }}>
                <LangBadge code={l.code} /> {l.label}
                {l.code === lang && <span style={{ marginLeft: 'auto', color: '#6366f1' }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const t = LANDING[lang];
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const isRtl = lang === 'ar';

  useEffect(() => {
    fetch(`${API_URL}/plans/public`)
      .then(r => r.ok ? r.json() : FALLBACK_PLANS)
      .then((d: Plan[]) => setPlans(d.filter(p => p.is_public && p.is_active).sort((a,b) => a.position - b.position)))
      .catch(() => setPlans(FALLBACK_PLANS));

    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const displayPlans = plans.length ? plans : FALLBACK_PLANS;

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ── NAVBAR ── */}
      <nav className="land-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(255,255,255,0.96)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #e2e8f0' : 'none',
        transition: 'all 0.2s',
      }}>
        <span className="land-logo" style={{ fontWeight: 800, color: '#6366f1', letterSpacing: '-0.5px' }}>
          AutoMarkIQ
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Text links — hidden on mobile via .land-nav-links CSS rule */}
          <div className="land-nav-links" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <a href="#features" className="land-nav-link">{t.nav_features}</a>
            <a href="#pricing"  className="land-nav-link">{t.nav_pricing}</a>
          </div>
          {/* Login — always visible, compact on mobile */}
          <a href="https://app.automarkiq.com/login" className="land-nav-link land-nav-login">{t.nav_login}</a>
          {/* LangPicker — always visible */}
          <LangPicker lang={lang} setLang={setLang} />
          <a href="https://app.automarkiq.com/register" className="land-nav-cta" style={{
            background: '#6366f1', color: '#fff',
            textDecoration: 'none', fontWeight: 700,
            borderRadius: 8, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity='0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity='1')}>
            {t.nav_cta}
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '120px 24px 80px',
        background: 'linear-gradient(150deg,#f0f4ff 0%,#e8eeff 40%,#f0fdf4 100%)',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#fff', border: '1px solid #c7d2fe',
          borderRadius: 100, padding: '6px 18px', marginBottom: 32,
          fontSize: 13, fontWeight: 600, color: '#6366f1',
          boxShadow: '0 2px 12px rgba(99,102,241,0.12)',
        }}>
          ✨ {t.hero_badge}
        </div>

        <h1 style={{
          fontSize: 'clamp(38px,6.5vw,76px)', fontWeight: 900,
          lineHeight: 1.08, letterSpacing: '-3px',
          maxWidth: 820, marginBottom: 28, color: '#0f172a',
        }}>
          {t.hero_h1a}<br />
          <span style={{ color: '#6366f1' }}>{t.hero_h1b}</span><br />
          {t.hero_h1c}
        </h1>

        <p style={{
          fontSize: 'clamp(16px,2vw,20px)', color: '#64748b',
          maxWidth: 560, lineHeight: 1.7, marginBottom: 48,
        }}>
          {t.hero_p}
        </p>

        <div className="land-hero-btns" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="https://app.automarkiq.com/register" style={{
            padding: '15px 36px', background: '#6366f1', color: '#fff',
            textDecoration: 'none', fontWeight: 700, fontSize: 16,
            borderRadius: 10, boxShadow: '0 4px 24px rgba(99,102,241,0.38)',
          }}>{t.hero_btn_start}</a>
          <a href="https://app.automarkiq.com/demo" style={{
            padding: '15px 36px', background: '#fff', color: '#6366f1',
            textDecoration: 'none', fontWeight: 700, fontSize: 16,
            borderRadius: 10, border: '1.5px solid #c7d2fe',
            boxShadow: '0 2px 8px rgba(99,102,241,0.1)',
          }}>▶ {t.hero_btn_demo}</a>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: '#94a3b8' }}>{t.hero_note}</p>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ padding: '60px 24px', background: '#0f172a' }}>
        <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 40 }}>
          {t.stats_h}
        </p>
        <div className="land-stats" style={{ display: 'flex', justifyContent: 'center', gap: 60, flexWrap: 'wrap', maxWidth: 900, margin: '0 auto' }}>
          {[
            { val: t.stat1_val, lbl: t.stat1_lbl },
            { val: t.stat2_val, lbl: t.stat2_lbl },
            { val: t.stat3_val, lbl: t.stat3_lbl },
            { val: t.stat4_val, lbl: t.stat4_lbl },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(36px,5vw,56px)', fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8, fontWeight: 500 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CHANNELS ── */}
      <section style={{ padding: '56px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 36 }}>
          {t.channels_label}
        </p>
        <div className="land-channels" style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
          {CHANNELS.map(ch => (
            <div key={ch.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 60, height: 60, borderRadius: 18,
                background: ch.bg, border: `1.5px solid ${ch.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>{ch.icon}</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{ch.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── PAIN POINT ── */}
      <section style={{ padding: '96px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(26px,4vw,46px)', fontWeight: 800, letterSpacing: '-2px', color: '#0f172a', marginBottom: 16 }}>
            {t.pain_h2}
          </h2>
          <p style={{ fontSize: 18, color: '#64748b', maxWidth: 640, margin: '0 auto 64px', lineHeight: 1.7 }}>{t.pain_p}</p>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[
              { icon: '📭', title: t.pain1_title, desc: t.pain1_desc },
              { icon: '⏱️', title: t.pain2_title, desc: t.pain2_desc },
              { icon: '🤯', title: t.pain3_title, desc: t.pain3_desc },
            ].map((item, i) => (
              <div key={i} style={{
                background: '#fff5f5', border: '1.5px solid #fecaca',
                borderRadius: 16, padding: 32, textAlign: 'left',
              }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{item.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: '#7f1d1d' }}>{item.title}</h3>
                <p style={{ fontSize: 14, color: '#991b1b', lineHeight: 1.65 }}>{item.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 48 }}>
            <div style={{
              display: 'inline-block', padding: '16px 32px',
              background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
              border: '1.5px solid #86efac', borderRadius: 16,
            }}>
              <span style={{ fontWeight: 700, color: '#14532d', fontSize: 15 }}>✅ {t.pain_solution}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '96px 24px', background: '#f8fafc' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', color: '#0f172a', marginBottom: 16 }}>
              {t.feat_h2}
            </h2>
            <p style={{ fontSize: 18, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>{t.feat_p}</p>
          </div>
          <div className="land-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
            {[
              { icon:'💬', title: t.f1_title, desc: t.f1_desc },
              { icon:'🤖', title: t.f2_title, desc: t.f2_desc },
              { icon:'📞', title: t.f3_title, desc: t.f3_desc },
              { icon:'📊', title: t.f4_title, desc: t.f4_desc },
            ].map((f, i) => (
              <div key={i} className="land-card">
                <div style={{ fontSize: 40, marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: '#0f172a' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '96px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', textAlign: 'center', color: '#0f172a', marginBottom: 64 }}>
            {t.test_h2}
          </h2>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[
              { name: t.test1_name, role: t.test1_role, quote: t.test1_quote },
              { name: t.test2_name, role: t.test2_role, quote: t.test2_quote },
              { name: t.test3_name, role: t.test3_role, quote: t.test3_quote },
            ].map((tm, i) => (
              <div key={i} className="land-card">
                <div style={{ color: '#f59e0b', fontSize: 18, marginBottom: 16, letterSpacing: 2 }}>★★★★★</div>
                <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.75, marginBottom: 24, fontStyle: 'italic' }}>{tm.quote}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 16, color: '#fff', flexShrink: 0,
                  }}>{tm.name.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{tm.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{tm.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '96px 24px', background: '#f8fafc' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', color: '#0f172a', marginBottom: 16 }}>
            {t.how_h2}
          </h2>
          <p style={{ fontSize: 18, color: '#64748b', marginBottom: 64 }}>{t.how_p}</p>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 40 }}>
            {[
              { step:'01', title: t.step1_title, desc: t.step1_desc },
              { step:'02', title: t.step2_title, desc: t.step2_desc },
              { step:'03', title: t.step3_title, desc: t.step3_desc },
            ].map(s => (
              <div key={s.step}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: '#eef2ff', color: '#6366f1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 15, margin: '0 auto 20px',
                  border: '2px solid #c7d2fe',
                }}>{s.step}</div>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: '#0f172a' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '96px 24px', background: '#f8fafc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', color: '#0f172a', marginBottom: 16 }}>
              {t.price_h2}
            </h2>
            <p style={{ fontSize: 18, color: '#64748b' }}>{t.price_p}</p>
          </div>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: `repeat(${displayPlans.length},1fr)`, gap: 24, alignItems: 'start' }}>
            {displayPlans.map((plan, i) => {
              const pop = i === 1;
              return (
                <div key={plan.id} style={{
                  background: pop ? '#6366f1' : '#fff',
                  borderRadius: 20, padding: 36,
                  border: pop ? 'none' : '1.5px solid #e2e8f0',
                  boxShadow: pop ? '0 12px 48px rgba(99,102,241,0.38)' : '0 1px 4px rgba(0,0,0,0.04)',
                  position: 'relative', marginTop: pop ? -12 : 0,
                }}>
                  {pop && (
                    <div style={{
                      position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                      background: '#f59e0b', color: '#fff',
                      padding: '4px 18px', borderRadius: 100,
                      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
                    }}>{t.plan_popular}</div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: pop ? 'rgba(255,255,255,0.65)' : '#94a3b8', marginBottom: 8 }}>
                    {plan.name}
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-2px', color: pop ? '#fff' : '#0f172a' }}>
                      {plan.price === 0 ? t.plan_free : `$${plan.price}`}
                    </span>
                    {plan.price > 0 && <span style={{ fontSize: 14, color: pop ? 'rgba(255,255,255,0.65)' : '#94a3b8' }}>{t.plan_month}</span>}
                  </div>
                  {plan.description && (
                    <p style={{ fontSize: 14, color: pop ? 'rgba(255,255,255,0.75)' : '#64748b', marginBottom: 28, lineHeight: 1.6 }}>
                      {plan.description}
                    </p>
                  )}
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                    {planFeatures(plan, t).map((feat, fi) => (
                      <li key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: pop ? 'rgba(255,255,255,0.88)' : '#475569' }}>
                        <span style={{ color: pop ? '#a5f3fc' : '#10b981', fontWeight: 800, fontSize: 16 }}>✓</span>
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <a href="https://app.automarkiq.com/register" style={{
                    display: 'block', textAlign: 'center',
                    padding: '13px 24px',
                    background: pop ? '#fff' : '#6366f1',
                    color: pop ? '#6366f1' : '#fff',
                    textDecoration: 'none', fontWeight: 700, fontSize: 14,
                    borderRadius: 10,
                  }}>
                    {plan.price === 0 ? t.plan_btn_free : t.plan_btn_paid}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: '96px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', textAlign: 'center', color: '#0f172a', marginBottom: 56 }}>
            {t.faq_h2}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {t.faq.map((faq, i) => (
              <div key={i} style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <button className="land-faq-btn" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ background: openFaq === i ? '#f8fafc' : '#fff' }}>
                  {faq.q}
                  <span style={{ color: '#6366f1', fontSize: 22, marginLeft: 16, flexShrink: 0 }}>
                    {openFaq === i ? '−' : '+'}
                  </span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '4px 24px 20px', fontSize: 15, color: '#64748b', lineHeight: 1.75 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{
        padding: '96px 24px', textAlign: 'center',
        background: 'linear-gradient(135deg,#6366f1 0%,#7c3aed 100%)',
      }}>
        <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', color: '#fff', marginBottom: 20 }}>
          {t.cta_h2a}<br />{t.cta_h2b}
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.75)', marginBottom: 48 }}>{t.cta_p}</p>
        <a href="https://app.automarkiq.com/register" style={{
          display: 'inline-block', padding: '16px 44px',
          background: '#fff', color: '#6366f1',
          textDecoration: 'none', fontWeight: 800, fontSize: 16,
          borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}>
          {t.cta_btn}
        </a>
        <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{t.cta_note}</p>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '52px 32px', background: '#0f172a', color: '#94a3b8' }}>
        <div className="land-footer-row" style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 6 }}>AutoMarkIQ</div>
            <div style={{ fontSize: 13 }}>{t.footer_tag}</div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[['#features', t.nav_features],['#pricing', t.nav_pricing],['https://app.automarkiq.com/login', t.nav_login],['https://app.automarkiq.com/register', t.nav_cta]].map(([href,label]) => (
              <a key={href} href={href} style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color='#fff')}
                onMouseLeave={e => (e.currentTarget.style.color='#94a3b8')}>
                {label}
              </a>
            ))}
          </div>
          <div style={{ fontSize: 13 }}>© {new Date().getFullYear()} AutoMarkIQ</div>
        </div>
      </footer>
    </div>
  );
}
