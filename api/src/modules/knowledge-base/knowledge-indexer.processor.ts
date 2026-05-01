import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Job } from 'bullmq';
import { KB_QUEUE, KbJobData } from './knowledge-base.constants';
import { ScraperService } from './scraper.service';
import { EmbeddingsService } from './embeddings.service';

@Processor(KB_QUEUE, { concurrency: 2 })
export class KnowledgeIndexerProcessor extends WorkerHost {
  private readonly logger = new Logger(KnowledgeIndexerProcessor.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly scraper: ScraperService,
    private readonly embeddings: EmbeddingsService,
  ) {
    super();
  }

  async process(job: Job<KbJobData>): Promise<void> {
    const { sourceId, botId, tenantId } = job.data;

    // Mark as indexing
    await this.db.query(
      `UPDATE bot_knowledge_sources SET status='indexing', updated_at=NOW() WHERE id=$1`,
      [sourceId],
    );

    try {
      const [source] = await this.db.query(
        `SELECT * FROM bot_knowledge_sources WHERE id=$1`,
        [sourceId],
      );
      if (!source) throw new Error('Source not found');

      const apiKey = await this.embeddings.getApiKey(tenantId);

      // ── 1. Extract text ─────────────────────────────────────────────────────
      let title = '';
      let text  = '';

      if (source.type === 'url') {
        ({ title, text } = await this.scraper.scrapeUrl(source.url));
      } else {
        // PDF: read file from disk
        const { readFileSync } = await import('fs');
        const buf = readFileSync(source.file_path);
        ({ title, text } = await this.scraper.parsePdf(buf));
      }

      if (!text.trim()) throw new Error('No text could be extracted from source');

      // ── 2. Chunk text ────────────────────────────────────────────────────────
      const chunks = this.scraper.chunkText(text);
      if (!chunks.length) throw new Error('No chunks generated');

      this.logger.log(`[kb] ${source.type} ${sourceId} → ${chunks.length} chunks`);

      // ── 3. Generate embeddings ───────────────────────────────────────────────
      const vectors = await this.embeddings.embedBatch(chunks, apiKey);

      // ── 4. Delete old chunks, insert new ones ────────────────────────────────
      await this.db.query(
        `DELETE FROM bot_knowledge_chunks WHERE source_id=$1`,
        [sourceId],
      );

      for (let i = 0; i < chunks.length; i++) {
        const vec = this.embeddings.vectorToSql(vectors[i]);
        await this.db.query(
          `INSERT INTO bot_knowledge_chunks
             (tenant_id, bot_id, source_id, content, embedding, chunk_index)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [tenantId, botId, sourceId, chunks[i], vec, i],
        );
      }

      // ── 5. Mark as indexed ───────────────────────────────────────────────────
      await this.db.query(
        `UPDATE bot_knowledge_sources
         SET status='indexed', title=$1, chunk_count=$2, last_synced_at=NOW(), error_message=NULL, updated_at=NOW()
         WHERE id=$3`,
        [title || source.url || source.file_name, chunks.length, sourceId],
      );

      this.logger.log(`[kb] Source ${sourceId} indexed OK — ${chunks.length} chunks`);
    } catch (err: any) {
      this.logger.error(`[kb] Source ${sourceId} failed: ${err.message}`);
      await this.db.query(
        `UPDATE bot_knowledge_sources
         SET status='error', error_message=$1, updated_at=NOW()
         WHERE id=$2`,
        [String(err.message).slice(0, 500), sourceId],
      );
      throw err; // let BullMQ handle retry
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<KbJobData>, err: Error) {
    this.logger.error(`[kb-queue] Job ${job.id} failed: ${err.message}`);
  }
}
