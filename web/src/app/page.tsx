'use client';
import { useEffect, useState } from 'react';

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

function fmt(n: number) { return n === -1 ? 'Unlimited' : n.toLocaleString(); }

function planFeatures(p: Plan): string[] {
  return [
    `${fmt(p.max_users)} agent${p.max_users !== 1 ? 's' : ''}`,
    `${fmt(p.max_contacts)} contacts`,
    `${fmt(p.max_inboxes)} inbox${p.max_inboxes !== 1 ? 'es' : ''}`,
    p.has_ai_chatbots ? `${fmt(p.max_ai_chatbots)} AI chatbot${p.max_ai_chatbots !== 1 ? 's' : ''}` : 'No AI chatbots',
    p.has_call_bots   ? `${fmt(p.max_call_minutes)} call min/mo` : 'No call bots',
    p.has_reports     ? 'Advanced reports'  : 'Basic reports',
    p.has_api_access  ? 'API access'        : '',
  ].filter(Boolean);
}

const FEATURES = [
  { icon:'💬', title:'One unified inbox',     desc:'WhatsApp, Instagram, Email and Webchat — all in one place. No more switching between apps.' },
  { icon:'🤖', title:'AI Chatbots 24/7',      desc:'Deploy intelligent bots that handle queries, qualify leads and escalate to your team only when needed.' },
  { icon:'📞', title:'AI Voice Bots',         desc:'Make and receive calls with natural-sounding AI agents for follow-ups, confirmations and surveys.' },
  { icon:'📊', title:'CRM & Sales Pipeline',  desc:'Track deals, manage contacts and move opportunities through custom Kanban stages.' },
];

const CHANNELS = [
  { name:'WhatsApp', icon:'📱', bg:'#dcfce7', border:'#86efac' },
  { name:'Instagram',icon:'📸', bg:'#fce7f3', border:'#f9a8d4' },
  { name:'Email',    icon:'📧', bg:'#eef2ff', border:'#c7d2fe' },
  { name:'Webchat',  icon:'💬', bg:'#e0f2fe', border:'#7dd3fc' },
  { name:'Voice',    icon:'📞', bg:'#fef3c7', border:'#fcd34d' },
];

const FAQS = [
  { q:'What channels does AutoMarkIQ support?',
    a:'WhatsApp Business (Meta API), Instagram Direct, Email (SMTP/IMAP) and a Webchat widget for your website. AI Voice calls via Twilio are available on Pro plans.' },
  { q:'Can I try it for free?',
    a:'Yes. The Free plan is available with no time limit and no credit card required. Upgrade any time.' },
  { q:'Do I need technical skills to set it up?',
    a:'No. Setting up your first inbox takes under 10 minutes. Our Help Center guides you through every step.' },
  { q:'Can I use my own AI API key?',
    a:'Yes. On Pro and Business plans you can connect your own OpenAI, Anthropic or Ollama credentials.' },
  { q:'Is my data secure?',
    a:'All data is encrypted in transit (HTTPS) and at rest. We never share customer data with third parties.' },
];

export default function LandingPage() {
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

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
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
        .land-nav-link { color: #475569; text-decoration: none; font-weight: 500; font-size: 14px; padding: 8px 14px; border-radius: 8px; transition: background 0.15s; }
        .land-nav-link:hover { background: #f1f5f9; }
        .land-card { background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.04); transition: transform 0.15s, box-shadow 0.15s; }
        .land-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(99,102,241,0.12); }
        .land-faq-btn { width: 100%; text-align: left; padding: 18px 24px; background: #fff; border: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 15px; color: #0f172a; transition: background 0.1s; }
        .land-faq-btn:hover { background: #f8fafc; }
        @media (max-width: 768px) {
          .land-nav-links { display: none; }
          .land-hero-btns { flex-direction: column; align-items: center; }
          .land-grid-3 { grid-template-columns: 1fr !important; }
          .land-grid-4 { grid-template-columns: 1fr 1fr !important; }
          .land-footer-row { flex-direction: column; text-align: center; }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        background: scrolled ? 'rgba(255,255,255,0.96)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #e2e8f0' : 'none',
        transition: 'all 0.2s',
      }}>
        <span style={{ fontWeight: 800, fontSize: 20, color: '#6366f1', letterSpacing: '-0.5px' }}>
          AutoMarkIQ
        </span>
        <div className="land-nav-links" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <a href="#features" className="land-nav-link">Features</a>
          <a href="#pricing"  className="land-nav-link">Pricing</a>
          <a href="/help"     className="land-nav-link">Help</a>
          <a href="/login"    className="land-nav-link">Log in</a>
          <a href="/register" style={{
            marginLeft: 8, padding: '8px 20px',
            background: '#6366f1', color: '#fff',
            textDecoration: 'none', fontWeight: 700, fontSize: 14,
            borderRadius: 8, transition: 'opacity 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity='0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity='1')}>
            Start free
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
          ✨ Omnichannel CRM powered by AI
        </div>

        <h1 style={{
          fontSize: 'clamp(38px,6.5vw,76px)', fontWeight: 900,
          lineHeight: 1.08, letterSpacing: '-3px',
          maxWidth: 820, marginBottom: 28, color: '#0f172a',
        }}>
          All your customer<br />
          <span style={{ color: '#6366f1' }}>conversations</span>,<br />
          in one place
        </h1>

        <p style={{
          fontSize: 'clamp(16px,2vw,20px)', color: '#64748b',
          maxWidth: 560, lineHeight: 1.7, marginBottom: 48,
        }}>
          AutoMarkIQ centralizes WhatsApp, Instagram, Email and Webchat
          in a single inbox — automate with AI, close deals faster.
        </p>

        <div className="land-hero-btns" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="/register" style={{
            padding: '15px 36px', background: '#6366f1', color: '#fff',
            textDecoration: 'none', fontWeight: 700, fontSize: 16,
            borderRadius: 10, boxShadow: '0 4px 24px rgba(99,102,241,0.38)',
          }}>Get started free →</a>
          <a href="#features" style={{
            padding: '15px 36px', background: '#fff', color: '#0f172a',
            textDecoration: 'none', fontWeight: 600, fontSize: 16,
            borderRadius: 10, border: '1.5px solid #e2e8f0',
          }}>See features</a>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: '#94a3b8' }}>
          No credit card required · Free plan, no time limit
        </p>
      </section>

      {/* ── CHANNELS ── */}
      <section style={{ padding: '56px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 36 }}>
          All channels, one platform
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
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

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '96px 24px', background: '#f8fafc' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', color: '#0f172a', marginBottom: 16 }}>
              Everything your team needs
            </h2>
            <p style={{ fontSize: 18, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>
              One platform to manage conversations, automate support and close more deals.
            </p>
          </div>
          <div className="land-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="land-card">
                <div style={{ fontSize: 40, marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: '#0f172a' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '96px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-2px', color: '#0f172a', marginBottom: 16 }}>
            Up and running in minutes
          </h2>
          <p style={{ fontSize: 18, color: '#64748b', marginBottom: 64 }}>No complex setup. No engineers needed.</p>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 40 }}>
            {[
              { step:'01', title:'Create your account',   desc:'Sign up free in 30 seconds. No credit card required.' },
              { step:'02', title:'Connect your channels', desc:'Link WhatsApp, Instagram, Email or your website chat.' },
              { step:'03', title:'Start responding',      desc:'Your team manages all messages from one single inbox.' },
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
              Simple, transparent pricing
            </h2>
            <p style={{ fontSize: 18, color: '#64748b' }}>Start free. Scale as you grow.</p>
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
                    }}>⭐ Most popular</div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: pop ? 'rgba(255,255,255,0.65)' : '#94a3b8', marginBottom: 8 }}>
                    {plan.name}
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-2px', color: pop ? '#fff' : '#0f172a' }}>
                      {plan.price === 0 ? 'Free' : `$${plan.price}`}
                    </span>
                    {plan.price > 0 && <span style={{ fontSize: 14, color: pop ? 'rgba(255,255,255,0.65)' : '#94a3b8' }}>/month</span>}
                  </div>
                  {plan.description && (
                    <p style={{ fontSize: 14, color: pop ? 'rgba(255,255,255,0.75)' : '#64748b', marginBottom: 28, lineHeight: 1.6 }}>
                      {plan.description}
                    </p>
                  )}
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                    {planFeatures(plan).map((feat, fi) => (
                      <li key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: pop ? 'rgba(255,255,255,0.88)' : '#475569' }}>
                        <span style={{ color: pop ? '#a5f3fc' : '#10b981', fontWeight: 800, fontSize: 16 }}>✓</span>
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <a href="/register" style={{
                    display: 'block', textAlign: 'center',
                    padding: '13px 24px',
                    background: pop ? '#fff' : '#6366f1',
                    color: pop ? '#6366f1' : '#fff',
                    textDecoration: 'none', fontWeight: 700, fontSize: 14,
                    borderRadius: 10,
                  }}>
                    {plan.price === 0 ? 'Start free' : 'Get started'}
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
            Frequently asked questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQS.map((faq, i) => (
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
          Ready to transform your<br />customer experience?
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.75)', marginBottom: 48 }}>
          Join businesses already using AutoMarkIQ to grow faster.
        </p>
        <a href="/register" style={{
          display: 'inline-block', padding: '16px 44px',
          background: '#fff', color: '#6366f1',
          textDecoration: 'none', fontWeight: 800, fontSize: 16,
          borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}>
          Get started for free →
        </a>
        <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>No credit card required</p>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '52px 32px', background: '#0f172a', color: '#94a3b8' }}>
        <div className="land-footer-row" style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 6 }}>AutoMarkIQ</div>
            <div style={{ fontSize: 13 }}>Omnichannel CRM powered by AI</div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[['#features','Features'],['#pricing','Pricing'],['/help','Help Center'],['/login','Log in'],['/register','Sign up']].map(([href,label]) => (
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
    </>
  );
}
