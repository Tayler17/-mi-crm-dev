import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallBot } from './entities/call-bot.entity';
import { CallLog } from './entities/call-log.entity';
import { CallBotsService } from './call-bots.service';
import { CallBotsController } from './call-bots.controller';
import { CallBotTwilioService } from './call-bot-twilio.service';
import { CallBotWebhooksController } from './call-bot-webhooks.controller';
import { SettingsModule } from '../settings/settings.module';
import { BotActionsService } from './bot-actions.service';

@Module({
  imports: [TypeOrmModule.forFeature([CallBot, CallLog]), SettingsModule],
  controllers: [CallBotsController, CallBotWebhooksController],
  providers: [CallBotsService, CallBotTwilioService, BotActionsService],
  exports: [CallBotsService],
})
export class CallBotsModule {}
