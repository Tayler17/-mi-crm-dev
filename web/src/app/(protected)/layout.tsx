'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { logout, getStoredUser, openNotificationsStream, setMyAvailability, getMyChats, getCurrentPlan, touchLastSeen } from '@/lib/api';
import { LangContext } from '@/lib/lang-context';
import { GlobalSearch } from '@/components/GlobalSearch';

// ── Languages ─────────────────────────────────────────────────────────────────
const LANGS = [
  { code: 'es', label: 'Español',    flag: '🇪🇸', badge: 'ES', color: '#c60b1e', dir: 'ltr' },
  { code: 'en', label: 'English',    flag: '🇬🇧', badge: 'EN', color: '#012169', dir: 'ltr' },
  { code: 'pt', label: 'Português',  flag: '🇧🇷', badge: 'PT', color: '#009c3b', dir: 'ltr' },
  { code: 'tr', label: 'Türkçe',     flag: '🇹🇷', badge: 'TR', color: '#e30a17', dir: 'ltr' },
  { code: 'ar', label: 'العربية',    flag: '🇸🇦', badge: 'AR', color: '#006c35', dir: 'rtl' },
] as const;
type LangCode = typeof LANGS[number]['code'];

const NAV_LABELS: Record<LangCode, Record<string, string>> = {
  es: {},
  en: {
    'Dashboard': 'Dashboard', 'Contactos': 'Contacts', 'Empresas': 'Companies',
    'Deals': 'Deals', 'Kanban & Pipelines': 'Kanban & Pipelines', 'Tareas': 'Tasks',
    'Inbox': 'Inbox', 'Quick Responses': 'Quick Responses', 'Tags': 'Tags',
    'Flujos': 'Flows', 'Automatizaciones': 'Automations', 'Conexiones': 'Connections',
    'Prompts IA': 'AI Prompts', 'AI Chatbots': 'AI Chatbots', 'Call Bots': 'Call Bots',
    'Campañas': 'Campaigns', 'Listas de Contactos': 'Contact Lists', 'Schedules': 'Schedules',
    'Equipos': 'Teams', 'Colas': 'Queues', 'Chat Interno': 'Internal Chat',
    'Usuarios': 'Users', 'Reportes': 'Reports', 'Anuncios': 'Announcements',
    'Planes & Billing': 'Plans & Billing', 'Configuración': 'Settings',
    'Plantillas': 'Templates', 'Centro de Ayuda': 'Help Center', 'Workspaces': 'Workspaces',
    'Webhooks': 'Webhooks', 'Campos Custom': 'Custom Fields',
    'Mi Plan & Uso': 'My Plan & Usage', 'Estado del sistema': 'System Status',
  },
  pt: {
    'Dashboard': 'Dashboard', 'Contactos': 'Contatos', 'Empresas': 'Empresas',
    'Deals': 'Negócios', 'Kanban & Pipelines': 'Kanban & Pipelines', 'Tareas': 'Tarefas',
    'Inbox': 'Caixa de entrada', 'Quick Responses': 'Respostas rápidas', 'Tags': 'Etiquetas',
    'Flujos': 'Fluxos', 'Automatizaciones': 'Automações', 'Conexiones': 'Conexões',
    'Prompts IA': 'Prompts IA', 'AI Chatbots': 'AI Chatbots', 'Call Bots': 'Call Bots',
    'Campañas': 'Campanhas', 'Listas de Contactos': 'Listas de contatos', 'Schedules': 'Agendamentos',
    'Equipos': 'Equipes', 'Colas': 'Filas', 'Chat Interno': 'Chat interno',
    'Usuarios': 'Usuários', 'Reportes': 'Relatórios', 'Anuncios': 'Anúncios',
    'Planes & Billing': 'Planos & Cobrança', 'Configuración': 'Configurações',
    'Plantillas': 'Modelos', 'Centro de Ayuda': 'Central de ajuda', 'Workspaces': 'Workspaces',
    'Mi Plan & Uso': 'Meu Plano & Uso', 'Estado del sistema': 'Estado do sistema',
  },
  tr: {
    'Dashboard': 'Gösterge Paneli', 'Contactos': 'Kişiler', 'Empresas': 'Şirketler',
    'Deals': 'Fırsatlar', 'Kanban & Pipelines': 'Kanban & Hatlar', 'Tareas': 'Görevler',
    'Inbox': 'Gelen Kutusu', 'Quick Responses': 'Hızlı Yanıtlar', 'Tags': 'Etiketler',
    'Flujos': 'Akışlar', 'Automatizaciones': 'Otomasyonlar', 'Conexiones': 'Bağlantılar',
    'Prompts IA': 'AI Komutları', 'AI Chatbots': 'AI Sohbet Botları', 'Call Bots': 'Arama Botları',
    'Campañas': 'Kampanyalar', 'Listas de Contactos': 'Kişi Listeleri', 'Schedules': 'Zamanlamalar',
    'Equipos': 'Ekipler', 'Colas': 'Kuyruklar', 'Chat Interno': 'Dahili Sohbet',
    'Usuarios': 'Kullanıcılar', 'Reportes': 'Raporlar', 'Anuncios': 'Duyurular',
    'Planes & Billing': 'Planlar & Faturalama', 'Configuración': 'Ayarlar',
    'Plantillas': 'Şablonlar', 'Centro de Ayuda': 'Yardım Merkezi', 'Workspaces': 'Çalışma Alanları',
    'Mi Plan & Uso': 'Planım & Kullanım', 'Estado del sistema': 'Sistem Durumu',
  },
  ar: {
    'Dashboard': 'لوحة التحكم', 'Contactos': 'جهات الاتصال', 'Empresas': 'الشركات',
    'Deals': 'الصفقات', 'Kanban & Pipelines': 'كانبان والمسارات', 'Tareas': 'المهام',
    'Inbox': 'صندوق الوارد', 'Quick Responses': 'الردود السريعة', 'Tags': 'العلامات',
    'Flujos': 'التدفقات', 'Automatizaciones': 'الأتمتة', 'Conexiones': 'الاتصالات',
    'Prompts IA': 'أوامر الذكاء', 'AI Chatbots': 'روبوتات الدردشة', 'Call Bots': 'روبوتات المكالمات',
    'Campañas': 'الحملات', 'Listas de Contactos': 'قوائم الاتصال', 'Schedules': 'الجداول',
    'Equipos': 'الفرق', 'Colas': 'قوائم الانتظار', 'Chat Interno': 'الدردشة الداخلية',
    'Usuarios': 'المستخدمون', 'Reportes': 'التقارير', 'Anuncios': 'الإعلانات',
    'Planes & Billing': 'الخطط والفواتير', 'Configuración': 'الإعدادات',
    'Plantillas': 'القوالب', 'Centro de Ayuda': 'مركز المساعدة', 'Workspaces': 'مساحات العمل',
    'Mi Plan & Uso': 'خطتي والاستخدام', 'Estado del sistema': 'حالة النظام',
  },
};

function t(label: string, lang: LangCode): string {
  return (NAV_LABELS[lang] as Record<string, string>)[label] ?? label;
}

// ── Role helpers ──────────────────────────────────────────────────────────────
type Role = 'agent' | 'admin' | 'owner';
const ROLE_RANK: Record<string, number> = { owner: 100, admin: 50, agent: 10 };
function hasRole(userRole: string | undefined, minRole: Role): boolean {
  return (ROLE_RANK[userRole ?? 'agent'] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', agent: 'Agente' };
const ROLE_COLOR: Record<string, string> = { owner: '#7c3aed', admin: '#2563eb', agent: '#059669' };

// ── Navigation ────────────────────────────────────────────────────────────────
type NavGroup = '🧩 CORE CRM' | '💬 COMUNICACIÓN' | '🤖 AUTOMATIZACIÓN' | '📢 MARKETING' | '⚙️ CONFIGURACIÓN' | '🏢 ADMIN' | null;
const NAV: { href: string; label: string; icon: string; minRole?: Role; group: NavGroup; planFeature?: string }[] = [
  // ── Core CRM ──
  { group: '🧩 CORE CRM',      href: '/dashboard',        label: 'Dashboard',            icon: '⊞' },
  { group: '🧩 CORE CRM',      href: '/contacts',         label: 'Contactos',            icon: '👥' },
  { group: '🧩 CORE CRM',      href: '/companies',        label: 'Empresas',             icon: '🏢' },
  { group: '🧩 CORE CRM',      href: '/deals',            label: 'Deals',                icon: '💼' },
  { group: '🧩 CORE CRM',      href: '/kanban',           label: 'Kanban & Pipelines',   icon: '▦' },
  { group: '🧩 CORE CRM',      href: '/tasks',            label: 'Tareas',               icon: '✓' },
  // ── Comunicación ──
  { group: '💬 COMUNICACIÓN',  href: '/inbox',            label: 'Inbox',                icon: '✉' },
  { group: '💬 COMUNICACIÓN',  href: '/chat',             label: 'Chat Interno',         icon: '💬' },
  { group: '💬 COMUNICACIÓN',  href: '/queues',           label: 'Colas',                icon: '📬' },
  { group: '💬 COMUNICACIÓN',  href: '/teams',            label: 'Equipos',              icon: '🏆' },
  // ── Automatización ──
  { group: '🤖 AUTOMATIZACIÓN', href: '/flows',           label: 'Flujos',               icon: '🔀', minRole: 'admin' },
  { group: '🤖 AUTOMATIZACIÓN', href: '/automations',     label: 'Automatizaciones',     icon: '⚡', minRole: 'admin' },
  { group: '🤖 AUTOMATIZACIÓN', href: '/ai-prompts',      label: 'Prompts IA',           icon: '✨', minRole: 'admin' },
  { group: '🤖 AUTOMATIZACIÓN', href: '/ai-chatbots',     label: 'AI Chatbots',          icon: '🧠', minRole: 'admin' },
  { group: '🤖 AUTOMATIZACIÓN', href: '/call-bots',       label: 'Call Bots',            icon: '🤖', minRole: 'admin' },
  { group: '🤖 AUTOMATIZACIÓN', href: '/voices',          label: 'Catálogo de Voces',    icon: '🔊', minRole: 'owner' },
  // ── Marketing ──
  { group: '📢 MARKETING',     href: '/campaigns',        label: 'Campañas',             icon: '📣', minRole: 'admin' },
  { group: '📢 MARKETING',     href: '/content',          label: 'Marketing Content',    icon: '📝', minRole: 'admin' },
  { group: '📢 MARKETING',     href: '/contact-lists',    label: 'Listas de Contactos',  icon: '📋', minRole: 'admin' },
  // ── Configuración ──
  { group: '⚙️ CONFIGURACIÓN', href: '/connections',      label: 'Conexiones',           icon: '🔌', minRole: 'admin' },
  { group: '⚙️ CONFIGURACIÓN', href: '/integrations',     label: 'Integraciones',        icon: '🧩', minRole: 'admin' },
  { group: '⚙️ CONFIGURACIÓN', href: '/custom-fields',    label: 'Campos Custom',        icon: '🗃', minRole: 'admin' },
  { group: '⚙️ CONFIGURACIÓN', href: '/outbound-webhooks',label: 'Webhooks',             icon: '🔗', minRole: 'admin' },
  { group: '⚙️ CONFIGURACIÓN', href: '/templates',        label: 'Plantillas',           icon: '🗂', minRole: 'admin' },
  { group: '⚙️ CONFIGURACIÓN', href: '/quick-responses',  label: 'Quick Responses',      icon: '💬' },
  { group: '⚙️ CONFIGURACIÓN', href: '/tags',             label: 'Tags',                 icon: '🏷' },
  { group: '⚙️ CONFIGURACIÓN', href: '/appointments',     label: 'Schedules',            icon: '📅' },
  // ── Admin ──
  { group: '🏢 ADMIN',         href: '/billing',           label: 'Mi Plan & Uso',       icon: '💳', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/settings/payments', label: 'Pagos Stripe',         icon: '🔗', minRole: 'admin', planFeature: 'has_stripe_connect' },
  { group: '🏢 ADMIN',         href: '/users',             label: 'Usuarios',             icon: '👤', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/plans',            label: 'Planes & Billing',     icon: '🏦', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/backups',          label: 'Backups',              icon: '💾', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/reports',          label: 'Reportes',             icon: '📊', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/announcements',    label: 'Anuncios',             icon: '📢', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/settings',         label: 'Configuración',        icon: '🔧', minRole: 'admin' },
  { group: '🏢 ADMIN',         href: '/status',           label: 'Estado del sistema',   icon: '🩺', minRole: 'owner' },
  { group: '🏢 ADMIN',         href: '/tenants',          label: 'Workspaces',           icon: '🏗', minRole: 'owner' },
  { group: '🏢 ADMIN',         href: '/api-docs',         label: 'API Docs',             icon: '📖', minRole: 'owner' },
  // ── Sin grupo ──
  { group: null,               href: '/help',             label: 'Centro de Ayuda',      icon: '❓' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [user,          setUser]          = useState<{ fullName?: string; email?: string; role?: string; avatarUrl?: string } | null>(null);
  const [notifPerm,     setNotifPerm]     = useState<'default' | 'granted' | 'denied'>('default');
  const [notifEnabled,  setNotifEnabled]  = useState(true);
  const [unread,        setUnread]        = useState(0);
  const [mounted,       setMounted]       = useState(false);
  const [dark,          setDark]          = useState(false);
  const [notifToast,    setNotifToast]    = useState('');
  const [lang,          setLang]          = useState<LangCode>('es');
  const [userMenuOpen,  setUserMenuOpen]  = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [profileName,   setProfileName]   = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [langMenuOpen,  setLangMenuOpen]  = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [availability,  setAvailability]  = useState('online');
  const [chatUnread,    setChatUnread]    = useState(0);
  const [planFeatures,  setPlanFeatures]  = useState<Record<string, boolean>>({});

  const sseRef         = useRef<EventSource | null>(null);
  const chatPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const userMenuRef    = useRef<HTMLDivElement>(null);
  const langMenuRef    = useRef<HTMLDivElement>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    setUser(getStoredUser());
    setAvailability(localStorage.getItem('availability') ?? 'online');
    setMounted(true);

    // Heartbeat: record last activity now and every 2 minutes while the app is open
    touchLastSeen().catch(() => {});
    const seenTimer = setInterval(() => { touchLastSeen().catch(() => {}); }, 120_000);
    window.addEventListener('beforeunload', () => clearInterval(seenTimer));

    // Restore preferences
    const savedDark = localStorage.getItem('theme') === 'dark';
    const savedLang = (localStorage.getItem('lang') ?? 'es') as LangCode;
    setDark(savedDark);
    setLang(savedLang);
    applyTheme(savedDark);
    applyLang(savedLang);
    const savedColor = localStorage.getItem('primaryColor');
    if (savedColor) applyPrimaryColor(savedColor);

    if ('Notification' in window) setNotifPerm(Notification.permission as 'default' | 'granted' | 'denied');
    if (localStorage.getItem('notifEnabled') === 'false') setNotifEnabled(false);

    // SSE stream
    // Backend spreads payload fields into the event root: { type, conversationId, message, ... }
    const es = openNotificationsStream((data) => {
      if (data.type === 'message_created') {
        const msg    = data.message;
        const convId = data.conversationId as string | undefined;
        if (msg?.direction !== 'inbound') return;
        setUnread((n) => n + 1);
        const enabled = localStorage.getItem('notifEnabled') !== 'false';
        if (document.hidden && Notification.permission === 'granted' && enabled) {
          const sender = 'Nuevo mensaje';
          const n = new Notification(sender, { body: msg.body?.slice(0, 100) ?? '', icon: '/favicon.ico', tag: convId ?? 'crm-msg' });
          n.onclick = () => { window.focus(); if (convId) window.location.href = `/inbox?conv=${convId}`; n.close(); };
        }
      }
    });
    sseRef.current = es;

    const onVisible    = () => { if (!document.hidden) setUnread(0); };
    const onClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) setLangMenuOpen(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('mousedown', onClickOutside);

    // Internal chat unread badge — poll every 60s
    const loadChatUnread = () => {
      getMyChats().then((chats) => {
        const total = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
        setChatUnread(total);
      }).catch(() => {});
    };
    loadChatUnread();
    chatPollRef.current = setInterval(loadChatUnread, 60_000);

    // Load plan features once (for nav visibility gating)
    getCurrentPlan().then((data: any) => {
      const t = data?.tenant ?? {};
      setPlanFeatures({
        has_stripe_connect: !!t.has_stripe_connect,
        has_reports:        !!t.has_reports,
        has_webhooks:       !!t.has_webhooks,
        has_api_access:     !!t.has_api_access,
        has_ai_chatbots:    !!t.has_ai_chatbots,
        has_call_bots:      !!t.has_call_bots,
      });
    }).catch(() => {});

    return () => {
      es.close();
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('mousedown', onClickOutside);
      if (chatPollRef.current) clearInterval(chatPollRef.current);
    };
  }, [router]);

  function applyTheme(isDark: boolean) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
  function applyPrimaryColor(hex: string) {
    document.documentElement.style.setProperty('--primary', hex);
    // Derive --primary-dark: shift lightness down ~15%
    try {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const darken = (v: number) => Math.max(0, Math.round(v * 0.78));
      document.documentElement.style.setProperty('--primary-dark', `rgb(${darken(r)},${darken(g)},${darken(b)})`);
    } catch {}
  }
  function applyLang(code: LangCode) {
    const found = LANGS.find((l) => l.code === code);
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', found?.dir ?? 'ltr');
  }

  function toggleDark() {
    const next = !dark;
    setDark(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    applyTheme(next);
  }

  function changeLang(code: LangCode) {
    setLang(code);
    setLangMenuOpen(false);
    localStorage.setItem('lang', code);
    applyLang(code);
  }

  function showNotifToast(msg: string) {
    setNotifToast(msg);
    setTimeout(() => setNotifToast(''), 4000);
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      showNotifToast(
        isIos
          ? 'En iOS, añade la app a la pantalla de inicio (Safari → Compartir → "Añadir a inicio") para activar notificaciones.'
          : 'Tu navegador no soporta notificaciones push.'
      );
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm as 'default' | 'granted' | 'denied');
    if (perm === 'granted') {
      setNotifEnabled(true);
      localStorage.setItem('notifEnabled', 'true');
      showNotifToast('✅ Notificaciones activadas');
    } else if (perm === 'denied') {
      showNotifToast('Notificaciones bloqueadas. Actívalas desde los ajustes del navegador.');
    }
  }

  function toggleNotif() {
    if (!('Notification' in window)) { requestNotifPermission(); return; }
    if (notifPerm === 'default') { requestNotifPermission(); return; }
    if (notifPerm === 'denied') {
      showNotifToast('Notificaciones bloqueadas. Ve a Ajustes del navegador para permitirlas.');
      return;
    }
    const next = !notifEnabled;
    setNotifEnabled(next);
    localStorage.setItem('notifEnabled', String(next));
    showNotifToast(next ? '🔔 Notificaciones activadas' : '🔕 Notificaciones silenciadas');
  }

  async function changeAvailability(status: string) {
    setAvailability(status);
    localStorage.setItem('availability', status);
    setMyAvailability(status).catch(() => {});
  }

  // Reset chat unread when user is on /chat
  useEffect(() => {
    if (pathname === '/chat') setChatUnread(0);
  }, [pathname]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPage  = NAV.find((n) => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href)));
  const initials     = (user?.fullName || user?.email || 'U').slice(0, 2).toUpperCase();
  const apiBase      = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const toAvatarSrc  = (url?: string) => (!url ? '' : url.startsWith('http') ? url : apiBase + url);
  const avatarSrc    = toAvatarSrc(user?.avatarUrl);
  const notifActive  = notifPerm === 'granted' && notifEnabled;
  const notifDenied  = notifPerm === 'denied';
  const currentLang  = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  const AVAIL_OPTIONS = [
    { value: 'online', label: lang === 'en' ? 'Online' : 'En línea',   color: '#22c55e' },
    { value: 'away',   label: lang === 'en' ? 'Away'   : 'Ausente',    color: '#f59e0b' },
    { value: 'busy',   label: lang === 'en' ? 'Busy'   : 'Ocupado/a',  color: '#ef4444' },
    { value: 'offline',label: lang === 'en' ? 'Offline': 'Desconectado',color: '#9ca3af' },
  ];
  const availColor = AVAIL_OPTIONS.find(a => a.value === availability)?.color ?? '#22c55e';

  // ── Styles ────────────────────────────────────────────────────────────────
  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, marginTop: 4,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
    zIndex: 200, overflow: 'hidden',
  };
  const dropItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text)', fontSize: 13, textAlign: 'left', width: '100%',
  };

  return (
    <div className="layout">
      {/* Overlay for mobile sidebar */}
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo" style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>AutoMarkIQ</div>
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: 'calc(100% - 24px)', margin: '0 12px 8px',
            padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 12, textAlign: 'left',
          }}
        >
          <span>🔍</span>
          <span style={{ flex: 1 }}>Buscar…</span>
          <kbd style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--border)', borderRadius: 3, background: 'var(--bg)' }}>Ctrl K</kbd>
        </button>
        <nav className="sidebar-nav">
          {(() => {
            const visible = NAV.filter((item) =>
              hasRole(user?.role, item.minRole ?? 'agent') &&
              (!item.planFeature || planFeatures[item.planFeature] === true)
            );
            const nodes: React.ReactNode[] = [];
            let lastGroup: NavGroup | undefined = undefined;
            for (const item of visible) {
              if (item.group !== lastGroup) {
                if (item.group !== null) {
                  nodes.push(
                    <div key={`grp-${item.group}`} style={{
                      padding: lastGroup !== undefined ? '12px 14px 3px' : '4px 14px 3px',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      ...(lastGroup !== undefined ? { borderTop: '1px solid var(--border)', marginTop: 4 } : {}),
                    }}>
                      {item.group}
                    </div>
                  );
                } else if (lastGroup !== undefined) {
                  nodes.push(<div key="grp-sep" style={{ borderTop: '1px solid var(--border)', marginTop: 4, marginBottom: 4 }} />);
                }
                lastGroup = item.group;
              }
              nodes.push(
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link${pathname.startsWith(item.href) ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span>{item.icon}</span>
                  <span>{t(item.label, lang)}</span>
                  {item.href === '/inbox' && unread > 0 && (
                    <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, background: '#ef4444', color: '#fff', borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  {item.href === '/chat' && chatUnread > 0 && (
                    <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, background: '#6366f1', color: '#fff', borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                      {chatUnread > 99 ? '99+' : chatUnread}
                    </span>
                  )}
                </Link>
              );
            }
            return nodes;
          })()}
        </nav>
      </aside>

      {/* ── Main wrapper ──────────────────────────────────────────────────── */}
      <div className="main-wrapper">

        {/* ── Top header ────────────────────────────────────────────────── */}
        <header className="top-header">

          {/* Left: hamburger (mobile) + current page */}
          <div className="top-header-left">
            <button className="hamburger" onClick={() => setSidebarOpen((o) => !o)} aria-label="Menú">
              ☰
            </button>
            {currentPage && (
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
                {currentPage.icon}&nbsp;{t(currentPage.label, lang)}
              </span>
            )}
          </div>

          {/* Right: actions */}
          <div className="top-header-right">

            {/* Language picker */}
            {mounted && (
              <div ref={langMenuRef} style={{ position: 'relative' }}>
                <button
                  className="header-icon-btn"
                  onClick={() => setLangMenuOpen((o) => !o)}
                  title="Idioma / Language"
                  style={{ gap: 4, padding: '6px 10px', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    background: currentLang.color, color: '#fff',
                    borderRadius: 4, padding: '2px 5px', lineHeight: 1,
                  }}>{currentLang.badge}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>▾</span>
                </button>

                {langMenuOpen && (
                  <div style={{ ...dropdownStyle, minWidth: 160 }}>
                    <div style={{ padding: '8px 12px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      LANGUAGE
                    </div>
                    {LANGS.map((l) => (
                      <button
                        key={l.code}
                        style={{
                          ...dropItemStyle,
                          background: lang === l.code ? 'var(--bg)' : 'none',
                          fontWeight: lang === l.code ? 600 : 400,
                        }}
                        onClick={() => changeLang(l.code)}
                        onMouseEnter={(e) => { if (lang !== l.code) e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={(e) => { if (lang !== l.code) e.currentTarget.style.background = 'none'; }}
                      >
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                          background: l.color, color: '#fff',
                          borderRadius: 4, padding: '2px 5px', lineHeight: 1, flexShrink: 0,
                        }}>{l.badge}</span>
                        <span style={{ flex: 1 }}>{l.label}</span>
                        {lang === l.code && <span style={{ color: 'var(--primary)', fontSize: 14 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dark mode toggle */}
            {mounted && (
              <button
                className="header-icon-btn"
                onClick={toggleDark}
                title={dark ? 'Modo claro' : 'Modo oscuro'}
                style={{ fontSize: 18 }}
              >
                {dark ? '☀️' : '🌙'}
              </button>
            )}

            {/* Help shortcut */}
            <Link href="/help" className="header-icon-btn" title="Centro de Ayuda" style={{ fontSize: 18, textDecoration: 'none' }}>
              ❓
            </Link>

            {/* Notification bell */}
            {mounted && (
              <button
                className="header-icon-btn"
                onClick={toggleNotif}
                title={
                  notifDenied    ? 'Notificaciones bloqueadas en el navegador'
                  : notifActive  ? 'Notificaciones activas — clic para silenciar'
                  : notifPerm === 'granted' ? 'Silenciadas — clic para activar'
                  : 'Activar notificaciones push'
                }
                style={{ position: 'relative', fontSize: 18 }}
              >
                {notifDenied ? '🔕' : notifActive ? '🔔' : '🔕'}
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2,
                    minWidth: 16, height: 16, background: '#ef4444', color: '#fff',
                    borderRadius: 8, fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

            {/* User avatar + dropdown */}
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <button
                className="header-icon-btn"
                onClick={() => setUserMenuOpen((o) => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8 }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'var(--primary)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, overflow: 'hidden',
                  }}>
                    {avatarSrc
                      ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials}
                  </div>
                  <span style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 10, height: 10, borderRadius: '50%',
                    background: availColor, border: '2px solid var(--surface)',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.fullName || user?.email}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▾</span>
              </button>

              {userMenuOpen && (
                <div style={{ ...dropdownStyle, minWidth: 190 }}>
                  {/* User info */}
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                    {user?.role && (
                      <span style={{
                        marginTop: 4, display: 'inline-block', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                        background: `${ROLE_COLOR[user.role] ?? '#6366f1'}20`,
                        color: ROLE_COLOR[user.role] ?? '#6366f1',
                      }}>
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    )}
                  </div>

                  {/* Availability picker */}
                  <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      {lang === 'en' ? 'STATUS' : lang === 'pt' ? 'STATUS' : 'ESTADO'}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {AVAIL_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => changeAvailability(opt.value)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 8px', borderRadius: 20, border: '1px solid',
                            borderColor: availability === opt.value ? opt.color : 'var(--border)',
                            background: availability === opt.value ? `${opt.color}18` : 'none',
                            color: availability === opt.value ? opt.color : 'var(--text-muted)',
                            cursor: 'pointer', fontSize: 11, fontWeight: availability === opt.value ? 700 : 400,
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {hasRole(user?.role, 'admin') && (
                    <Link href="/settings" onClick={() => setUserMenuOpen(false)}
                      style={{ ...dropItemStyle, textDecoration: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      🔧 {lang === 'en' ? 'Settings' : lang === 'pt' ? 'Configurações' : lang === 'tr' ? 'Ayarlar' : lang === 'ar' ? 'الإعدادات' : 'Configuración'}
                    </Link>
                  )}

                  {hasRole(user?.role, 'admin') && (
                    <Link href="/users" onClick={() => setUserMenuOpen(false)}
                      style={{ ...dropItemStyle, textDecoration: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      👥 {lang === 'en' ? 'Users' : lang === 'pt' ? 'Usuários' : lang === 'tr' ? 'Kullanıcılar' : lang === 'ar' ? 'المستخدمون' : 'Usuarios'}
                    </Link>
                  )}

                  <button style={dropItemStyle} onClick={() => { setUserMenuOpen(false); setProfileName(user?.fullName ?? ''); setProfileAvatar(user?.avatarUrl ?? ''); setProfileOpen(true); }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                    👤 {lang === 'en' ? 'My profile' : lang === 'pt' ? 'Meu perfil' : 'Mi perfil'}
                  </button>

                  <button style={dropItemStyle} onClick={() => { setUserMenuOpen(false); toggleNotif(); }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                    {notifActive ? '🔔' : '🔕'}{' '}
                    {notifActive
                      ? (lang === 'en' ? 'Mute notifications' : lang === 'pt' ? 'Silenciar notificações' : 'Silenciar notificaciones')
                      : (lang === 'en' ? 'Enable notifications' : lang === 'pt' ? 'Ativar notificações' : 'Activar notificaciones')}
                  </button>

                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <button style={{ ...dropItemStyle, color: '#ef4444' }} onClick={logout}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      🚪 {lang === 'en' ? 'Sign out' : lang === 'pt' ? 'Sair' : lang === 'tr' ? 'Çıkış yap' : lang === 'ar' ? 'تسجيل الخروج' : 'Cerrar sesión'}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        <main className="main">
          <LangContext.Provider value={{ lang, setLang: changeLang }}>
            {children}
          </LangContext.Provider>
        </main>
      </div>

      {/* Global Search modal */}
      <GlobalSearch />

      {/* Profile modal */}
      {profileOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setProfileOpen(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: 360, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 8px 40px rgba(0,0,0,.25)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>
              👤 {lang === 'en' ? 'My profile' : lang === 'pt' ? 'Meu perfil' : 'Mi perfil'}
            </h3>

            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'var(--primary)', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700,
              }}>
                {profileAvatar
                  ? <img src={toAvatarSrc(profileAvatar)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: 12 }}>
                  {avatarUploading
                    ? '⏳ …'
                    : (lang === 'en' ? '📷 Upload photo' : lang === 'pt' ? '📷 Enviar foto' : '📷 Subir foto')}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={avatarUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setAvatarUploading(true);
                      try {
                        const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
                        const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') ?? '' : '';
                        const fd = new FormData();
                        fd.append('file', file);
                        const up = await fetch(`${apiBase}/internal-chat/upload`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId },
                          body: fd,
                        });
                        if (up.ok) {
                          const { url } = await up.json();
                          setProfileAvatar(url);
                        }
                      } finally { setAvatarUploading(false); e.target.value = ''; }
                    }}
                  />
                </label>
                {profileAvatar && (
                  <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--danger, #ef4444)' }}
                    onClick={() => setProfileAvatar('')}>
                    {lang === 'en' ? 'Remove' : lang === 'pt' ? 'Remover' : 'Quitar'}
                  </button>
                )}
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {lang === 'en' ? 'Full name' : lang === 'pt' ? 'Nome completo' : 'Nombre completo'}
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 20 }}
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder={user?.fullName ?? ''}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setProfileOpen(false)}>
                {lang === 'en' ? 'Cancel' : 'Cancelar'}
              </button>
              <button
                className="btn btn-primary"
                disabled={profileSaving || !profileName.trim()}
                onClick={async () => {
                  setProfileSaving(true);
                  try {
                    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
                    const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') ?? '' : '';
                    const res = await fetch(`${API_URL}/auth/me`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId },
                      body: JSON.stringify({ fullName: profileName.trim(), avatarUrl: profileAvatar || null }),
                    });
                    if (res.ok) {
                      const updated = await res.json();
                      if (typeof window !== 'undefined') {
                        const stored = JSON.parse(localStorage.getItem('user') ?? '{}');
                        localStorage.setItem('user', JSON.stringify({ ...stored, fullName: updated.fullName, avatarUrl: updated.avatarUrl ?? null }));
                      }
                      setProfileOpen(false);
                      window.location.reload(); // refresh header to show new name/photo
                    }
                  } finally { setProfileSaving(false); }
                }}
              >
                {profileSaving ? '⏳' : (lang === 'en' ? 'Save' : 'Guardar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification toast */}
      {notifToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '12px 20px',
          borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          boxShadow: '0 4px 20px rgba(0,0,0,.3)', zIndex: 9999,
          maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
          animation: 'fadeInUp .2s ease',
        }}>
          {notifToast}
        </div>
      )}
    </div>
  );
}
