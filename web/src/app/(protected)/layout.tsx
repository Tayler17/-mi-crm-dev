'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { logout, getStoredUser } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/contacts', label: 'Contactos', icon: '👥' },
  { href: '/companies', label: 'Empresas', icon: '🏢' },
  { href: '/deals', label: 'Deals', icon: '💼' },
  { href: '/kanban', label: 'Kanban & Pipelines', icon: '▦' },
  { href: '/tasks', label: 'Tareas', icon: '✓' },
  { href: '/inbox', label: 'Inbox', icon: '✉' },
  { href: '/quick-responses', label: 'Quick Responses', icon: '💬' },
  { href: '/tags', label: 'Tags', icon: '🏷' },
  { href: '/flows', label: 'Flujos', icon: '🔀' },
  { href: '/automations', label: 'Automatizaciones', icon: '⚡' },
  { href: '/connections', label: 'Conexiones', icon: '🔌' },
  { href: '/ai-prompts', label: 'Prompts IA', icon: '✨' },
  { href: '/ai-chatbots', label: 'AI Chatbots', icon: '🧠' },
  { href: '/call-bots', label: 'Call Bots', icon: '🤖' },
  { href: '/campaigns', label: 'Campañas', icon: '📣' },
  { href: '/contact-lists', label: 'Listas de Contactos', icon: '📋' },
  { href: '/appointments', label: 'Schedules', icon: '📅' },
  { href: '/teams', label: 'Equipos', icon: '🏆' },
  { href: '/queues', label: 'Colas', icon: '📬' },
  { href: '/chat', label: 'Chat Interno', icon: '💬' },
  { href: '/users', label: 'Usuarios', icon: '⚙' },
  { href: '/reports', label: 'Reportes', icon: '📊' },
  { href: '/announcements', label: 'Anuncios', icon: '📢' },
  { href: '/plans', label: 'Planes & Billing', icon: '💳' },
  { href: '/settings', label: 'Configuración', icon: '🔧' },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ fullName?: string; email?: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    setUser(getStoredUser());
  }, [router]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">CRM SaaS</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${pathname.startsWith(item.href) ? ' active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {user?.fullName || user?.email}
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
