import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BOT_QUEUE, BotJobData } from './bot-queue.constants';
import { AiChatbotEngineService } from './ai-chatbot-engine.service';

/**
 * BullMQ worker for AI chatbot message processing.
 *
 * Concurrency = 5  →  max 5 AI API calls running simultaneously.
 * Per-conversation lock  →  if a job for conversation X is already running,
 *   the next job for X waits instead of firing a second AI call in parallel.
 */
@Processor(BOT_QUEUE, { concurrency: 5 })
export class BotQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(BotQueueProcessor.name);

  /** In-process lock: conversationId → true while processing */
  private readonly processing = new Set<string>();

  constructor(private readonly engine: AiChatbotEngineService) {
    super();
  }

  async process(job: Job<BotJobData>): Promise<void> {
    const { tenantId, conversationId, message } = job.data;

    // Per-conversation serialization: if already processing this conversation,
    // wait up to 35 s in 500 ms intervals before giving up (> 30s AI timeout).
    const MAX_WAIT_MS = 35_000;
    const POLL_MS     = 500;
    let waited        = 0;

    while (this.processing.has(conversationId)) {
      if (waited >= MAX_WAIT_MS) {
        this.logger.warn(`[bot-queue] Timeout waiting for conv lock ${conversationId} — skipping`);
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      waited += POLL_MS;
    }

    this.processing.add(conversationId);
    try {
      // 30 s hard timeout for the AI call
      await Promise.race([
        this.engine.processMessage(tenantId, conversationId, message),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Bot job timeout after 30s')), 30_000),
        ),
      ]);
    } finally {
      this.processing.delete(conversationId);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<BotJobData>, err: Error) {
    this.logger.error(
      `[bot-queue] Job ${job.id} failed (conv ${job.data.conversationId}): ${err.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<BotJobData>) {
    this.logger.debug(`[bot-queue] Job ${job.id} done (conv ${job.data.conversationId})`);
  }
}
