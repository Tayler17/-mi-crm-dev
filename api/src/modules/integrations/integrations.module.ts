import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsWebhookController } from './integrations-webhook.controller';
import { DentallyConnector } from './connectors/dentally.connector';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [IntegrationsController, IntegrationsWebhookController],
  providers: [IntegrationsService, DentallyConnector],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
