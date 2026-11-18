'use client';

import { Suspense } from 'react';
import { PaymentsSettingsContent } from '@/components/PaymentsSettings';

// Route kept for the Stripe Connect return URL. The content now lives in a shared
// component, also used as the "Pagos / Stripe" tab inside /invoice-settings (Facturación).
export default function PaymentsSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Cargando...</div>}>
      <PaymentsSettingsContent />
    </Suspense>
  );
}
