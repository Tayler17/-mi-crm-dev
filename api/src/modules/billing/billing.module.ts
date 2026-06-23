import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { OverageBillingService } from './overage-billing.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [BillingController],
  providers: [BillingService, OverageBillingService],
  exports: [BillingService, OverageBillingService],
})
export class BillingModule {}
