import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StripeProvider } from './providers/stripe.provider';
import { PaymentProvider } from './providers/payment-provider.interface';

@Injectable()
export class BillingService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  // ── Provider factory ──────────────────────────────────────────────────────

  /** Returns the right PaymentProvider for this tenant.
   *  Currently always Stripe; future: check tenant's preferred provider. */
  async getProvider(_tenantId?: string): Promise<PaymentProvider> {
    const { secretKey, webhookSecret } = await this.platformSettings.getStripe();
    if (!secretKey) {
      throw new BadRequestException(
        'Stripe no está configurado. Añade la Secret Key en Configuración → Plataforma.',
      );
    }
    return new StripeProvider(secretKey, webhookSecret);
  }

  // ── Tenant helpers ────────────────────────────────────────────────────────

  async getTenant(tenantId: string) {
    const [row] = await this.db.query('SELECT * FROM tenants WHERE id=$1', [tenantId]);
    return row;
  }

  async ensureCustomer(tenantId: string): Promise<string> {
    const tenant = await this.getTenant(tenantId);
    if (tenant?.stripe_customer_id) return tenant.stripe_customer_id;

    const provider = await this.getProvider(tenantId);
    let customerId: string;
    try {
      customerId = await provider.getOrCreateCustomer({
        tenantId,
        email: tenant?.billing_email || undefined,
        name:  tenant?.name          || undefined,
      });
    } catch (e: any) {
      if (e?.status) throw e;
      const msg: string = e?.message ?? String(e);
      const type: string = e?.type ?? '';
      if (type === 'StripeAuthenticationError' || msg.includes('Invalid API Key') || msg.includes('No API key')) {
        throw new BadRequestException(
          'La Secret Key de Stripe es inválida. Ve a Configuración → Plataforma → Stripe y verifica que sea la clave secreta (sk_live_... o sk_test_...).',
        );
      }
      throw new BadRequestException(`Error al crear cliente Stripe: ${msg}`);
    }

    await this.db.query(
      'UPDATE tenants SET stripe_customer_id=$2, updated_at=NOW() WHERE id=$1',
      [tenantId, customerId],
    );
    return customerId;
  }

  // ── SaaS subscription ────────────────────────────────────────────────────

  async getSubscription(tenantId: string) {
    const [row] = await this.db.query(
      `SELECT t.stripe_customer_id, t.stripe_subscription_id, t.stripe_subscription_status,
              t.plan_id, t.plan_expires_at, t.billing_email,
              p.name AS plan_name, p.slug AS plan_slug, p.price, p.billing_period, p.color
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );
    return row ?? {};
  }

  async createCheckout(tenantId: string, planId: string) {
    const [plan] = await this.db.query('SELECT * FROM plans WHERE id=$1', [planId]);
    if (!plan) throw new BadRequestException('Plan no encontrado');
    if (!plan.stripe_price_id) throw new BadRequestException('Este plan no tiene un precio de Stripe configurado');

    try {
      const customerId = await this.ensureCustomer(tenantId);
      const provider   = await this.getProvider(tenantId);
      const base       = process.env.FRONTEND_URL || 'http://localhost:3000';

      return await provider.createCheckoutSession({
        tenantId,
        customerId,
        priceId:    plan.stripe_price_id,
        successUrl: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl:  `${base}/billing/cancel`,
        metadata:   { planId: plan.id },
      });
    } catch (e: any) {
      // Re-throw our own HttpExceptions as-is
      if (e?.status) throw e;
      // Convert Stripe SDK errors (which have a numeric statusCode) to readable messages
      // so NestJS doesn't forward Stripe's 401 as an HTTP 401 to the client
      const msg: string = e?.message ?? String(e);
      const type: string = e?.type ?? '';
      if (type === 'StripeAuthenticationError' || msg.includes('Invalid API Key') || msg.includes('No API key')) {
        throw new BadRequestException(
          'La Secret Key de Stripe es inválida. Ve a Configuración → Plataforma → Stripe y verifica que sea la clave secreta (sk_live_... o sk_test_...).',
        );
      }
      throw new BadRequestException(`Error de Stripe: ${msg}`);
    }
  }

  async createPortal(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant?.stripe_customer_id) throw new BadRequestException('No hay suscripción activa de Stripe');

    const provider = await this.getProvider(tenantId);
    const base     = process.env.FRONTEND_URL || 'http://localhost:3000';
    return provider.createPortalSession({ customerId: tenant.stripe_customer_id, returnUrl: `${base}/plans` });
  }

  // ── Webhook processing ───────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string) {
    const { secretKey, webhookSecret } = await this.platformSettings.getStripe();
    if (!secretKey) return { received: true };

    const provider = new StripeProvider(secretKey, webhookSecret);
    let event: any;

    try {
      event = webhookSecret
        ? provider.constructWebhookEvent(rawBody, signature, webhookSecret)
        : rawBody;
    } catch {
      throw new BadRequestException('Webhook signature verification failed');
    }

    await this.processEvent(event).catch((err) =>
      console.error('[billing/webhook] error processing event', event?.type, err?.message),
    );

    return { received: true };
  }

  private async processEvent(event: any) {
    const obj = event?.data?.object;
    if (!obj) return;

    switch (event.type) {
      case 'checkout.session.completed': {
        const { tenantId, planId } = obj.metadata ?? {};
        if (!tenantId || !planId) break;
        await this.db.query(
          `UPDATE tenants
           SET stripe_customer_id         = COALESCE($2, stripe_customer_id),
               stripe_subscription_id     = COALESCE($3, stripe_subscription_id),
               stripe_subscription_status = 'active',
               plan_id = $4, plan = 'paid', updated_at = NOW()
           WHERE id = $1`,
          [tenantId, obj.customer ?? null, obj.subscription ?? null, planId],
        );
        await this.logTransaction({
          tenantId, provider: 'stripe', type: 'subscription',
          amount: (obj.amount_total ?? 0) / 100, currency: obj.currency ?? 'usd',
          status: 'succeeded', providerRef: obj.id,
          description: `Checkout: plan ${planId}`,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const [tenant] = await this.db.query(
          'SELECT id FROM tenants WHERE stripe_customer_id=$1', [obj.customer],
        );
        if (!tenant) break;
        const priceId = obj.items?.data?.[0]?.price?.id;
        let planUpdate = '';
        if (priceId) {
          const [plan] = await this.db.query('SELECT id FROM plans WHERE stripe_price_id=$1', [priceId]);
          if (plan) planUpdate = `, plan_id='${plan.id}', plan='paid'`;
        }
        await this.db.query(
          `UPDATE tenants SET stripe_subscription_status=$2${planUpdate}, updated_at=NOW() WHERE id=$1`,
          [tenant.id, obj.status],
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const [tenant] = await this.db.query(
          'SELECT id FROM tenants WHERE stripe_customer_id=$1', [obj.customer],
        );
        if (!tenant) break;
        await this.db.query(
          `UPDATE tenants SET stripe_subscription_status='canceled', updated_at=NOW() WHERE id=$1`,
          [tenant.id],
        );
        break;
      }

      case 'invoice.payment_failed': {
        const [tenant] = await this.db.query(
          'SELECT id FROM tenants WHERE stripe_customer_id=$1', [obj.customer],
        );
        if (!tenant) break;
        await this.db.query(
          `UPDATE tenants SET stripe_subscription_status='past_due', updated_at=NOW() WHERE id=$1`,
          [tenant.id],
        );
        break;
      }

      // Stripe Connect: account updated
      case 'account.updated': {
        const accountId = obj.id;
        await this.db.query(
          `UPDATE payment_accounts
           SET charges_enabled=$2, payouts_enabled=$3, details_submitted=$4,
               onboarding_complete=$5, updated_at=NOW()
           WHERE account_id=$1`,
          [accountId, obj.charges_enabled, obj.payouts_enabled, obj.details_submitted,
           obj.charges_enabled && obj.payouts_enabled],
        );
        break;
      }
    }
  }

  private async logTransaction(t: {
    tenantId?: string; provider: string; type: string;
    amount: number; currency: string; status: string;
    providerRef?: string; customerEmail?: string; description?: string;
  }) {
    await this.db.query(
      `INSERT INTO transactions (tenant_id, provider, type, amount, currency, status, provider_ref, customer_email, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [t.tenantId ?? null, t.provider, t.type, t.amount, t.currency.toUpperCase(),
       t.status, t.providerRef ?? null, t.customerEmail ?? null, t.description ?? null],
    ).catch(() => {}); // non-blocking
  }

  // ── Stripe Connect ────────────────────────────────────────────────────────

  async getConnectAccount(tenantId: string) {
    const [row] = await this.db.query(
      `SELECT * FROM payment_accounts WHERE tenant_id=$1 AND provider='stripe'`,
      [tenantId],
    );
    return row ?? null;
  }

  async createConnectAccount(tenantId: string) {
    const existing = await this.getConnectAccount(tenantId);
    const provider = await this.getProvider(tenantId);
    if (!provider.createConnectAccount) throw new BadRequestException('Provider does not support Connect');

    const tenant = await this.getTenant(tenantId);

    if (existing?.account_id && !existing.onboarding_complete) {
      // Refresh the onboarding link
      const base = process.env.FRONTEND_URL || 'http://localhost:3000';
      const link = await provider.createConnectOnboardingLink!(
        existing.account_id,
        `${base}/settings/payments?success=1`,
        `${base}/settings/payments?refresh=1`,
      );
      return { accountId: existing.account_id, onboardingUrl: link.url, isNew: false };
    }

    if (existing?.onboarding_complete) {
      return { accountId: existing.account_id, onboardingUrl: null, isNew: false, complete: true };
    }

    const result = await provider.createConnectAccount(tenantId, tenant?.billing_email || undefined);

    await this.db.query(
      `INSERT INTO payment_accounts (tenant_id, provider, account_id)
       VALUES ($1, 'stripe', $2)
       ON CONFLICT (tenant_id, provider) DO UPDATE SET account_id=$2, updated_at=NOW()`,
      [tenantId, result.accountId],
    );

    return { ...result, isNew: true };
  }

  async syncConnectAccount(tenantId: string) {
    const row = await this.getConnectAccount(tenantId);
    if (!row?.account_id) throw new BadRequestException('No hay cuenta Connect para este tenant');

    const provider = await this.getProvider(tenantId);
    const status = await provider.getConnectAccountStatus!(row.account_id);

    await this.db.query(
      `UPDATE payment_accounts
       SET charges_enabled=$2, payouts_enabled=$3, details_submitted=$4,
           onboarding_complete=$5, updated_at=NOW()
       WHERE tenant_id=$1 AND provider='stripe'`,
      [tenantId, status.chargesEnabled, status.payoutsEnabled, status.detailsSubmitted,
       status.chargesEnabled && status.payoutsEnabled],
    );

    return status;
  }

  // ── Connect: Payment Links ────────────────────────────────────────────────

  async createConnectPaymentLink(tenantId: string, params: {
    amount: number;
    currency: string;
    description: string;
    dealId?: string;
  }): Promise<{ url: string; sessionId: string }> {
    const row = await this.getConnectAccount(tenantId);
    if (!row?.account_id) throw new BadRequestException('No tienes una cuenta de Stripe Connect activa. Ve a Configuración → Pagos para conectarla.');
    if (!row.charges_enabled) throw new BadRequestException('Tu cuenta de Stripe aún no tiene cobros habilitados. Completa el onboarding en Configuración → Pagos.');

    const provider = await this.getProvider(tenantId);
    if (!(provider as any).createConnectCheckoutSession) throw new BadRequestException('Provider does not support Connect checkout');

    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    const returnPath = params.dealId ? `/deals/${params.dealId}` : '/deals';

    return (provider as any).createConnectCheckoutSession({
      accountId:   row.account_id,
      amount:      params.amount,
      currency:    params.currency,
      description: params.description,
      successUrl:  `${base}${returnPath}?payment=success`,
      cancelUrl:   `${base}${returnPath}?payment=cancelled`,
    });
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  async getTransactions(tenantId: string, limit = 50) {
    return this.db.query(
      `SELECT * FROM transactions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    );
  }
}
