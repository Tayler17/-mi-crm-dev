import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { WebchatService } from './webchat.service';
import { AiChatbotsModule } from '../ai-chatbots/ai-chatbots.module';

@Module({
  imports: [AiChatbotsModule],
  controllers: [WebchatController],
  providers: [WebchatService],
})
export class WebchatModule {}
