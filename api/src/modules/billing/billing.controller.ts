import {
  Controller, Get, Post, Req, Headers, HttpCode,
  UseGuards, Body, Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ── SaaS subscription ────────────────────────────────────────────────────

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  getSubscription(@TenantId() tenantId: string) {
    return this.billing.getSubscription(tenantId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  createCheckout(@TenantId() tenantId: string, @Body() dto: { planId: string }) {
    return this.billing.createCheckout(tenantId, dto.planId);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  createPortal(@TenantId() tenantId: string) {
    return this.billing.createPortal(tenantId);
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  getTransactions(@TenantId() tenantId: string, @Query('limit') limit?: string) {
    return this.billing.getTransactions(tenantId, limit ? +limit : 50);
  }

  // ── Stripe Connect ────────────────────────────────────────────────────────

  @Get('connect/account')
  @UseGuards(JwtAuthGuard)
  getConnectAccount(@TenantId() tenantId: string) {
    return this.billing.getConnectAccount(tenantId);
  }

  @Post('connect/onboard')
  @UseGuards(JwtAuthGuard)
  createConnectAccount(@TenantId() tenantId: string) {
    return this.billing.createConnectAccount(tenantId);
  }

  @Post('connect/sync')
  @UseGuards(JwtAuthGuard)
  syncConnectAccount(@TenantId() tenantId: string) {
    return this.billing.syncConnectAccount(tenantId);
  }

  @Post('connect/payment-link')
  @UseGuards(JwtAuthGuard)
  createPaymentLink(
    @TenantId() tenantId: string,
    @Body() dto: { amount: number; currency: string; description: string; dealId?: string },
  ) {
    return this.billing.createConnectPaymentLink(tenantId, dto);
  }

  // ── Webhook (raw body — no auth) ─────────────────────────────────────────

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') sig: string,
  ) {
    return this.billing.handleWebhook(req.body, sig);
  }
}
