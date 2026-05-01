import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BOT_QUEUE } from './bot-queue.constants';

/** Registers the Redis queue. Providers (listener + processor) live in AiChatbotsModule. */
@Module({
  imports: [BullModule.registerQueue({ name: BOT_QUEUE })],
  exports: [BullModule],
})
export class BotQueueModule {}
