import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BOT_QUEUE, BotJobData } from './bot-queue.constants';

@Injectable()
export class BotQueueListener {
  private readonly logger = new Logger(BotQueueListener.name);

  constructor(@InjectQueue(BOT_QUEUE) private readonly queue: Queue<BotJobData>) {}

  @OnEvent('conversation.message_received')
  async onMessageReceived(payload: {
    tenantId: string;
    conversationId: string;
    message: { body: string; direction: string; is_private: boolean; content_type?: string };
  }) {
    const { tenantId, conversationId, message } = payload;

    if (message?.direction !== 'inbound') return;
    if (message?.is_private) return;

    try {
      await this.queue.add(
        'process-message',
        { tenantId, conversationId, message },
        {
          // 2 s debounce: fixed jobId per conversation deduplicates rapid-fire
          // messages. removeOnComplete:true frees the ID after processing so
          // subsequent messages can create new jobs with the same ID.
          delay: 2000,
          jobId: `conv-${conversationId}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue bot job for conv ${conversationId}: ${err}`);
    }
  }
}
