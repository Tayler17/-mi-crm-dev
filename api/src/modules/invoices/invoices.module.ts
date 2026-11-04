import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoiceWebhooksController } from './invoice-webhooks.controller';
import { InvoicesService } from './invoices.service';
import { BillingModule } from '../billing/billing.module';
import { SettingsModule } from '../settings/settings.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [BillingModule, SettingsModule, ConnectionsModule],
  controllers: [InvoicesController, InvoiceWebhooksController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
