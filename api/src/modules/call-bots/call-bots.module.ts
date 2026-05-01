import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallBot } from './entities/call-bot.entity';
import { CallLog } from './entities/call-log.entity';
import { CallBotsService } from './call-bots.service';
import { CallBotsController } from './call-bots.controller';
import { CallBotTwilioService } from './call-bot-twilio.service';
import { CallBotWebhooksController } from './call-bot-webhooks.controller';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';
import { SettingsModule } from '../settings/settings.module';
import { BotActionsService } from './bot-actions.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Module({
  imports: [TypeOrmModule.forFeature([CallBot, CallLog]), SettingsModule, KnowledgeBaseModule],
  controllers: [CallBotsController, CallBotWebhooksController],
  providers: [CallBotsService, CallBotTwilioService, BotActionsService, ElevenLabsTtsService],
  exports: [CallBotsService],
})
export class CallBotsModule {}
