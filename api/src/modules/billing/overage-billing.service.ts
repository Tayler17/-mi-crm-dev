import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StripeProvider } from './providers/stripe.provider';
import { calculateOverage } from '../../common/utils/limits';

/**
 * Automatic overage billing: each day computes the month-to-date overage
 * (extra call minutes, AI messages, phone numbers) per tenant and keeps a
 * single Stripe invoice item in sync. Stripe adds that item to the tenant's
 * NEXT subscription invoice, so the extra usage is charged automatically.
 *
 * Mode is controlled by the platform setting `billing.overage_mode`:
 *   - 'off'    → does nothing
 *   - 'dryrun' → only logs what it WOULD charge (default; safe to verify first)
 *   - 'on'     → creates/updates real Stripe invoice items
 */
@Injectable()
export class OverageBillingService implements OnModuleInit {
  private readonly logger = new Logger(OverageBillingService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async onModuleInit() {
    await this.db.query(`ALTER TABLE plans   ADD COLUMN IF NOT EXISTS extra_phone_number_price NUMERIC NOT NULL DEFAULT 0`).catch(() => {});
    await this.db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS overage_item_id     TEXT`).catch(() => {});
    await this.db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS overage_item_period TEXT`).catch(() => {});
  }

  /** Daily at 03:15. */
  @Cron('15 3 * * *')
  async runDaily() {
    const mode = ((await this.platformSettings.get('billing.overage_mode').catch(() => '')) as string) || 'dryrun';
    if (mode === 'off') return;
    await this.syncAll(mode === 'on');
  }

  /** Compute + sync overage invoice items for every billable tenant. */
  async syncAll(charge: boolean): Promise<{ processed: number; charged: number }> {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const tenants: any[] = await this.db.query(
      `SELECT t.id, t.stripe_customer_id, t.overage_item_id, t.overage_item_period,
              p.currency, p.allow_overage,
              p.max_messages_month, p.max_call_minutes, p.max_phone_numbers,
              p.extra_message_price, p.extra_call_minute_price, p.extra_phone_number_price
         FROM tenants t
         JOIN plans p ON p.id = t.plan_id
        WHERE t.stripe_customer_id IS NOT NULL
          AND t.stripe_subscription_status IN ('active','trialing')
          AND COALESCE(p.allow_overage, false) = true`,
    );

    let processed = 0, charged = 0;
    let provider: StripeProvider | null = null;
    if (charge) {
      const { secretKey, webhookSecret } = await this.platformSettings.getStripe();
      if (!secretKey) { this.logger.warn('[overage] Stripe not configured; skipping real charges'); charge = false; }
      else provider = new StripeProvider(secretKey, webhookSecret);
    }

    for (const t of tenants) {
      processed++;
      try {
        const [usage] = await this.db.query(
          `SELECT
             (SELECT COUNT(*)::int FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
               WHERE cv.tenant_id=$1 AND m.sender_type='bot' AND m.created_at >= date_trunc('month', NOW())) AS msgs,
             COALESCE((SELECT SUM(duration)::int FROM call_logs
               WHERE tenant_id::text=$1 AND created_at >= date_trunc('month', NOW())),0) AS secs,
             (SELECT COUNT(DISTINCT phone_number)::int FROM call_bots
               WHERE tenant_id::text=$1 AND phone_number IS NOT NULL) AS phones`,
          [t.id],
        );
        const ov = calculateOverage(
          { aiMessagesMonth: usage.msgs, callMinutesMonth: Math.ceil(usage.secs / 60), phoneNumbers: usage.phones },
          t,
        );
        const amount = Math.round(ov.totalOverageCost * 100) / 100;
        const desc = `Consumo extra ${period}: ${ov.extraMinutes} min, ${ov.extraMessages} msgs, ${ov.extraPhoneNumbers} nº`;

        if (!charge || !provider) {
          this.logger.log(`[overage dryrun] tenant=${t.id} → ${t.currency} ${amount} (${desc})`);
          continue;
        }

        // New month → forget last month's item (it was already invoiced).
        if (t.overage_item_period !== period) {
          await this.db.query(`UPDATE tenants SET overage_item_id=NULL, overage_item_period=$2 WHERE id=$1`, [t.id, period]);
          t.overage_item_id = null;
        }

        if (amount <= 0) {
          if (t.overage_item_id) {
            await provider.deleteInvoiceItem(t.overage_item_id);
            await this.db.query(`UPDATE tenants SET overage_item_id=NULL WHERE id=$1`, [t.id]);
          }
          continue;
        }

        if (t.overage_item_id) {
          await provider.updateInvoiceItem(t.overage_item_id, { amount, description: desc });
        } else {
          const id = await provider.createInvoiceItem({ customerId: t.stripe_customer_id, amount, currency: t.currency || 'gbp', description: desc, period });
          await this.db.query(`UPDATE tenants SET overage_item_id=$2, overage_item_period=$3 WHERE id=$1`, [t.id, id, period]);
        }
        charged++;
        this.logger.log(`[overage] tenant=${t.id} invoice item synced → ${t.currency} ${amount}`);
      } catch (e: any) {
        this.logger.warn(`[overage] tenant=${t.id} failed: ${e?.message}`);
      }
    }
    this.logger.log(`[overage] done: processed=${processed} charged=${charged} mode=${charge ? 'on' : 'dryrun'}`);
    return { processed, charged };
  }
}
