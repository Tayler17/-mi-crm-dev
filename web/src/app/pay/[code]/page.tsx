import { redirect } from 'next/navigation';

// Public short pay link: app.automarkiq.com/pay/<code> → 302 to the Stripe checkout.
// Server component (no auth) so customers can open it without logging in.
export default async function PayRedirect({ params }: { params: any }) {
  const { code } = await params;
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  let url: string | null = null;
  try {
    const res = await fetch(`${base}/billing/pay/resolve/${encodeURIComponent(String(code))}`, { cache: 'no-store' });
    if (res.ok) { const data = await res.json(); url = data?.url ?? null; }
  } catch { /* ignore → show not-found below */ }

  if (url) redirect(url); // absolute external URL (Stripe) — Next redirect supports it

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div>
        <div style={{ fontSize: 44, marginBottom: 12 }}>⌛</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Enlace de pago no disponible</h1>
        <p style={{ color: '#6b7280', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>
          Este enlace de pago no es válido o ya expiró. Pídele a la empresa que te envíe uno nuevo.
        </p>
      </div>
    </div>
  );
}
