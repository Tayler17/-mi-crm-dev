import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatbot } from './ai-chatbot.entity';
import { AiChatbotsService } from './ai-chatbots.service';
import { AiChatbotsController } from './ai-chatbots.controller';
import { AiChatbotEngineService } from './ai-chatbot-engine.service';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiChatbot]), ConnectionsModule, NotificationsModule],
  controllers: [AiChatbotsController],
  providers: [AiChatbotsService, AiChatbotEngineService],
  exports: [AiChatbotsService],
})
export class AiChatbotsModule {}
