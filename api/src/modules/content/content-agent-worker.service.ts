import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContentService } from './content.service';

/**
 * Content agent (Fase 2): periodically generates a batch of DRAFT posts for each tenant
 * whose recurring config is due, rotating through their topics. Humans review/approve
 * (which publishes). Ticks every ~15 min; each config runs at most once per cadence.
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
      `SELECT * FROM content_agent
         WHERE enabled = true AND topics <> '' AND (next_run_at IS NULL OR next_run_at <= now())`,
    ).catch(() => []);
    if (!due.length) return;
    this.logger.log(`[content-agent] ${due.length} tenant(s) due`);
    for (const cfg of due) {
      await this.content.runAgentForTenant(cfg).catch((e) =>
        this.logger.warn(`[content-agent] run failed for ${cfg.tenant_id}: ${e.message}`));
    }
  }
}
