import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { BotQueueModule } from '../ai-chatbots/bot-queue.module';

@Module({
  imports: [BotQueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
