import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignContact } from './entities/campaign-contact.entity';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignWorkerService } from './campaign-worker.service';
import { ConnectionsModule } from '../connections/connections.module';
import { CallBotsModule } from '../call-bots/call-bots.module';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignContact]), ConnectionsModule, CallBotsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignWorkerService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
