import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallBot } from './entities/call-bot.entity';
import { CallLog } from './entities/call-log.entity';
import { CallBotsService } from './call-bots.service';
import { CallBotsController } from './call-bots.controller';
import { CallBotTwilioService } from './call-bot-twilio.service';
import { CallBotMediaStreamService } from './call-bot-media-stream.service';
import { CallBotWebhooksController } from './call-bot-webhooks.controller';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';
import { SettingsModule } from '../settings/settings.module';
import { BotActionsService } from './bot-actions.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PhoneNumbersService } from './phone-numbers.service';
import { PhoneNumbersController } from './phone-numbers.controller';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [TypeOrmModule.forFeature([CallBot, CallLog]), SettingsModule, KnowledgeBaseModule, IntegrationsModule],
  controllers: [CallBotsController, CallBotWebhooksController, PhoneNumbersController],
  providers: [CallBotsService, CallBotTwilioService, CallBotMediaStreamService, BotActionsService, ElevenLabsTtsService, PhoneNumbersService],
  exports: [CallBotsService, CallBotMediaStreamService],
})
export class CallBotsModule {}
