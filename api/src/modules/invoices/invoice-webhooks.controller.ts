import { Controller, Post, Req, Headers, HttpCode } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

/**
 * PUBLIC (no JWT) — Stripe Connect webhook for INVOICE payments only. Completely separate
 * from /billing/webhook (SaaS subscriptions): different path, different handler, so invoice
 * payment events can never interfere with the platform's subscription billing.
 * The raw body for this exact path is configured in main.ts.
 */
@Controller('invoices')
export class InvoiceWebhooksController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('stripe-webhook')
  @HttpCode(200)
  handle(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.invoices.handleConnectWebhook(req.body, sig);
  }
}
