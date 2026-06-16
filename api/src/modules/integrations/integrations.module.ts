import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { DentallyConnector } from './connectors/dentally.connector';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, DentallyConnector],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
