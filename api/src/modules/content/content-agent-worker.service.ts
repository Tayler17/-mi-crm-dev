import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContentService } from './content.service';

/**
 * Content agent (Fase 2): periodically generates a batch of DRAFT posts for each
 * Marketing AI prompt whose automation is enabled and due. The prompt's own text
 * drives the generation. Humans review/approve (which publishes). Ticks every ~15 min;
 * each prompt runs at most once per its cadence.
 */
@Injectable()
export class ContentAgentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentAgentWorker.name);
  private timer: any;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly content: ContentService,
  ) {}

  onModuleInit() {
    // First pass after a short delay (let the app settle), then every 15 minutes.
    setTimeout(() => this.tick().catch(() => {}), 30_000);
    this.timer = setInterval(() => this.tick().catch(() => {}), 15 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const due = await this.db.query(
      `SELECT * FROM ai_prompts
         WHERE category = 'marketing' AND is_active = true AND schedule_enabled = true
           AND (next_run_at IS NULL OR next_run_at <= now())`,
    ).catch(() => []);
    if (!due.length) return;
    this.logger.log(`[content-agent] ${due.length} prompt(s) due`);
    for (const prompt of due) {
      await this.content.runScheduledPrompt(prompt).catch((e) =>
        this.logger.warn(`[content-agent] run failed for prompt ${prompt.id}: ${e.message}`));
    }
  }
}
