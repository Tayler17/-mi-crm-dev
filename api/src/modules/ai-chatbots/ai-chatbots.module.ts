import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatbot } from './ai-chatbot.entity';
import { AiChatbotsService } from './ai-chatbots.service';
import { AiChatbotsController } from './ai-chatbots.controller';
import { AiChatbotEngineService } from './ai-chatbot-engine.service';
import { BotQueueListener } from './bot-queue.listener';
import { BotQueueProcessor } from './bot-queue.processor';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BotQueueModule } from './bot-queue.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { SettingsModule } from '../settings/settings.module';
import { BillingModule } from '../billing/billing.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiChatbot]), ConnectionsModule, NotificationsModule, BotQueueModule, KnowledgeBaseModule, SettingsModule, BillingModule, IntegrationsModule],
  controllers: [AiChatbotsController],
  providers: [AiChatbotsService, AiChatbotEngineService, BotQueueListener, BotQueueProcessor],
  exports: [AiChatbotsService, AiChatbotEngineService],
})
export class AiChatbotsModule {}
