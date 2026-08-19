'use client';

import { PaymentLinksList } from '@/components/PaymentLinksList';

export default function PaymentsPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Pagos</h1>
      <PaymentLinksList />
    </div>
  );
}
