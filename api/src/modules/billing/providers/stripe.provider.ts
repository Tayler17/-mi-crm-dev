import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PaymentProvider, CheckoutParams, PortalParams, CustomerParams,
  WebhookEvent, ConnectAccountResult, ConnectAccountStatus,
} from './payment-provider.interface';

@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';

  constructor(private readonly secretKey: string, private readonly webhookSecret?: string) {}

  private async sdk(): Promise<any> {
    try {
      const mod: any = await import('stripe');
      const Stripe = mod.default ?? mod;
      return new Stripe(this.secretKey, { apiVersion: '2024-06-20' });
    } catch {
      throw new BadRequestException('El paquete stripe no está instalado en el servidor.');
    }
  }

  // ── SaaS billing ─────────────────────────────────────────────────────────

  async getOrCreateCustomer(params: CustomerParams): Promise<string> {
    const stripe = await this.sdk();
    const customer = await stripe.customers.create({
      email:    params.email  || undefined,
      name:     params.name   || undefined,
      metadata: { tenantId: params.tenantId },
    });
    return customer.id;
  }

  async createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    const stripe = await this.sdk();
    const session = await stripe.checkout.sessions.create({
      mode:        'subscription',
      customer:    params.customerId || undefined,
      line_items:  [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url:  params.cancelUrl,
      metadata:    { tenantId: params.tenantId, ...params.metadata },
    });
    return { url: session.url };
  }

  /** Create a pending invoice item on the customer (added to their next subscription invoice). */
  async createInvoiceItem(params: { customerId: string; amount: number; currency: string; description: string; period?: string }): Promise<string> {
    const stripe = await this.sdk();
    const item = await stripe.invoiceItems.create({
      customer:    params.customerId,
      amount:      Math.round(params.amount * 100), // to cents
      currency:    params.currency.toLowerCase(),
      description: params.description,
      metadata:    params.period ? { overage_period: params.period } : undefined,
    });
    return item.id;
  }

  /** Update the amount/description of a pending (uninvoiced) invoice item. */
  async updateInvoiceItem(itemId: string, params: { amount: number; description?: string }): Promise<void> {
    const stripe = await this.sdk();
    await stripe.invoiceItems.update(itemId, {
      amount:      Math.round(params.amount * 100),
      description: params.description,
    });
  }

  /** Delete a pending invoice item (e.g. overage dropped back to 0). */
  async deleteInvoiceItem(itemId: string): Promise<void> {
    const stripe = await this.sdk();
    await stripe.invoiceItems.del(itemId).catch(() => {});
  }

  async createPortalSession(params: PortalParams): Promise<{ url: string }> {
    const stripe = await this.sdk();
    const session = await stripe.billingPortal.sessions.create({
      customer:   params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): WebhookEvent {
    // Sync — stripe.webhooks.constructEvent is synchronous
    let stripe: any;
    // We need to instantiate synchronously; use cached module if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod: any = require('stripe');
      const Stripe = mod.default ?? mod;
      stripe = new Stripe(this.secretKey, { apiVersion: '2024-06-20' });
    } catch {
      // If stripe is not installed, just return the body as-is (no signature check)
      return rawBody as any;
    }
    return stripe.webhooks.constructEvent(rawBody, signature, secret) as WebhookEvent;
  }

  // ── Stripe Connect ────────────────────────────────────────────────────────

  async createConnectAccount(tenantId: string, email?: string, country = 'US'): Promise<ConnectAccountResult> {
    const stripe = await this.sdk();

    const account = await stripe.accounts.create({
      type:    'express',
      country,
      email:   email || undefined,
      metadata: { tenantId },
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
    });

    const link = await stripe.accountLinks.create({
      account:     account.id,
      refresh_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/payments?refresh=1`,
      return_url:  `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/payments?success=1`,
      type:        'account_onboarding',
    });

    return { accountId: account.id, onboardingUrl: link.url };
  }

  async getConnectAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
    const stripe = await this.sdk();
    const account = await stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled:    account.charges_enabled,
      payoutsEnabled:    account.payouts_enabled,
      detailsSubmitted:  account.details_submitted,
    };
  }

  async createConnectOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }> {
    const stripe = await this.sdk();
    const link = await stripe.accountLinks.create({
      account:     accountId,
      return_url:  returnUrl,
      refresh_url: refreshUrl,
      type:        'account_onboarding',
    });
    return { url: link.url };
  }

  /** Delete an Express/Custom connected account created by this platform. */
  async deleteConnectAccount(accountId: string): Promise<{ deleted: boolean }> {
    const stripe = await this.sdk();
    const res = await stripe.accounts.del(accountId);
    return { deleted: !!res?.deleted };
  }

  /** Creates a one-time Checkout Session on behalf of a connected account */
  async createConnectCheckoutSession(params: {
    accountId: string;
    amount: number;
    currency: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    applicationFeePercent?: number; // platform fee %, default 0
  }): Promise<{ url: string; sessionId: string }> {
    const stripe = await this.sdk();
    const amountCents = Math.round(params.amount * 100);
    const feePercent = params.applicationFeePercent ?? 0;
    const appFee = feePercent > 0 ? Math.round(amountCents * feePercent / 100) : 0;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: { name: params.description || 'Pago' },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        success_url: params.successUrl,
        cancel_url:  params.cancelUrl,
        ...(appFee > 0 ? {
          payment_intent_data: {
            application_fee_amount: appFee,
          },
        } : {}),
      },
      { stripeAccount: params.accountId },
    );
    return { url: session.url, sessionId: session.id };
  }

  async createTransfer(params: { accountId: string; amount: number; currency: string; description?: string }): Promise<{ transferId: string }> {
    const stripe = await this.sdk();
    const transfer = await stripe.transfers.create({
      amount:      Math.round(params.amount * 100), // to cents
      currency:    params.currency.toLowerCase(),
      destination: params.accountId,
      description: params.description,
    });
    return { transferId: transfer.id };
  }
}
