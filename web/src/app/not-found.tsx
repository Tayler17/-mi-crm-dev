import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>

        {/* Logo */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>AutoMarkIQ</div>
        </div>

        {/* 404 number */}
        <div style={{
          fontSize: 120, fontWeight: 900, lineHeight: 1,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 24, letterSpacing: '-4px',
        }}>
          404
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
          Página no encontrada
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.7, margin: '0 0 40px' }}>
          La página que buscas no existe o fue movida.<br />
          Vuelve al dashboard para continuar trabajando.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 28px', borderRadius: 12, textDecoration: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
              fontSize: 14, fontWeight: 700, boxShadow: '0 4px 14px #6366f140',
            }}
          >
            Ir al Dashboard →
          </Link>
          <Link
            href="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 28px', borderRadius: 12, textDecoration: 'none',
              background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb',
              fontSize: 14, fontWeight: 600,
            }}
          >
            Iniciar sesión
          </Link>
        </div>

        <p style={{ marginTop: 48, color: '#94a3b8', fontSize: 12 }}>
          © 2026 AutoMarkIQ · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
