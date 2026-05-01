// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CheckoutParams {
  tenantId: string;
  customerId?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface PortalParams {
  customerId: string;
  returnUrl: string;
}

export interface CustomerParams {
  tenantId: string;
  email?: string;
  name?: string;
}

export interface WebhookEvent {
  type: string;
  data: { object: any };
}

// ── Stripe Connect (tenant onboarding) ───────────────────────────────────────

export interface ConnectAccountResult {
  accountId: string;
  onboardingUrl: string;
}

export interface ConnectAccountStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

// ── Main interface ────────────────────────────────────────────────────────────

export interface PaymentProvider {
  /** Human-readable name, e.g. 'stripe' | 'paypal' | 'mercadopago' */
  readonly name: string;

  // ── SaaS billing ──────────────────────────────────────────────────────────

  /** Get or create a customer ID for this tenant */
  getOrCreateCustomer(params: CustomerParams): Promise<string>;

  /** Create a hosted checkout session URL */
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;

  /** Create a billing portal session URL */
  createPortalSession(params: PortalParams): Promise<{ url: string }>;

  /** Parse and verify a raw webhook payload */
  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): WebhookEvent;

  // ── Tenant Connect (platform payments) ──────────────────────────────────

  /** Create a Connect account and return onboarding URL. Optional — not all providers */
  createConnectAccount?(tenantId: string, email?: string, country?: string): Promise<ConnectAccountResult>;

  /** Get the current status of a Connect account */
  getConnectAccountStatus?(accountId: string): Promise<ConnectAccountStatus>;

  /** Refresh the onboarding link for an incomplete Connect account */
  createConnectOnboardingLink?(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>;

  /** Create a payout/transfer to a connected account */
  createTransfer?(params: { accountId: string; amount: number; currency: string; description?: string }): Promise<{ transferId: string }>;
}
