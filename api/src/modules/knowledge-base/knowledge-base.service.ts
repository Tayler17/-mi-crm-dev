import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KB_QUEUE, KbJobData, RAG_TOP_K, RAG_MIN_SIMILARITY } from './knowledge-base.constants';
import { EmbeddingsService } from './embeddings.service';

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(KB_QUEUE) private readonly queue: Queue<KbJobData>,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async onModuleInit() {
    // The knowledge base is shared by chat bots (ai_chatbots) AND call bots
    // (call_bots), keyed by bot_id (uuid). The legacy FK to ai_chatbots blocked
    // call-bot sources, so drop it (idempotent).
    await this.db.query(`ALTER TABLE bot_knowledge_sources DROP CONSTRAINT IF EXISTS bot_knowledge_sources_bot_id_fkey`).catch(() => {});
    await this.db.query(`ALTER TABLE bot_knowledge_chunks  DROP CONSTRAINT IF EXISTS bot_knowledge_chunks_bot_id_fkey`).catch(() => {});
  }

  // ── Domain management ────────────────────────────────────────────────────────

  async getDomains(tenantId: string) {
    return this.db.query(
      `SELECT id, domain, created_at FROM tenant_allowed_domains WHERE tenant_id=$1 ORDER BY domain`,
      [tenantId],
    );
  }

  async addDomain(tenantId: string, domain: string) {
    const clean = this.normalizeDomain(domain);
    if (!clean) throw new BadRequestException('Dominio inválido');
    const [row] = await this.db.query(
      `INSERT INTO tenant_allowed_domains (tenant_id, domain)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id, domain) DO NOTHING
       RETURNING *`,
      [tenantId, clean],
    );
    return row ?? { domain: clean };
  }

  async removeDomain(tenantId: string, domainId: string) {
    await this.db.query(
      `DELETE FROM tenant_allowed_domains WHERE id=$1 AND tenant_id=$2`,
      [domainId, tenantId],
    );
  }

  // ── Source management ────────────────────────────────────────────────────────

  async getSources(botId: string, tenantId: string) {
    return this.db.query(
      `SELECT id, type, url, file_name, title, status, error_message, chunk_count, last_synced_at, created_at
       FROM bot_knowledge_sources
       WHERE bot_id=$1 AND tenant_id=$2
       ORDER BY created_at DESC`,
      [botId, tenantId],
    );
  }

  async addUrlSource(botId: string, tenantId: string, url: string) {
    const parsed = this.parseUrl(url);
    if (!parsed) throw new BadRequestException('URL inválida');

    await this.assertDomainAllowed(tenantId, parsed.hostname);

    const [source] = await this.db.query(
      `INSERT INTO bot_knowledge_sources (tenant_id, bot_id, type, url, status)
       VALUES ($1, $2, 'url', $3, 'pending') RETURNING id`,
      [tenantId, botId, parsed.href],
    );

    await this.enqueueIndexing(source.id, botId, tenantId);
    return source;
  }

  async addPdfSource(botId: string, tenantId: string, fileName: string, filePath: string) {
    const [source] = await this.db.query(
      `INSERT INTO bot_knowledge_sources (tenant_id, bot_id, type, file_name, file_path, status)
       VALUES ($1, $2, 'pdf', $3, $4, 'pending') RETURNING id`,
      [tenantId, botId, fileName, filePath],
    );

    await this.enqueueIndexing(source.id, botId, tenantId);
    return source;
  }

  async reindexSource(sourceId: string, tenantId: string) {
    const [source] = await this.db.query(
      `SELECT bot_id FROM bot_knowledge_sources WHERE id=$1 AND tenant_id=$2`,
      [sourceId, tenantId],
    );
    if (!source) throw new NotFoundException('Fuente no encontrada');

    await this.db.query(
      `UPDATE bot_knowledge_sources SET status='pending', error_message=NULL, updated_at=NOW() WHERE id=$1`,
      [sourceId],
    );
    await this.enqueueIndexing(sourceId, source.bot_id, tenantId);
  }

  async deleteSource(sourceId: string, tenantId: string) {
    await this.db.query(
      `DELETE FROM bot_knowledge_sources WHERE id=$1 AND tenant_id=$2`,
      [sourceId, tenantId],
    );
  }

  // ── RAG search ───────────────────────────────────────────────────────────────

  /**
   * Search the knowledge base for chunks relevant to the user's query.
   * Returns formatted context string ready to inject into the system prompt.
   */
  async searchRelevantContext(
    botId: string,
    tenantId: string,
    query: string,
  ): Promise<string> {
    // Only search if the bot has indexed sources
    const [{ count }] = await this.db.query(
      `SELECT COUNT(*) FROM bot_knowledge_chunks WHERE bot_id=$1 AND tenant_id=$2`,
      [botId, tenantId],
    );
    if (Number(count) === 0) { this.logger.warn(`[rag] bot=${botId} has NO indexed chunks`); return ''; }

    let apiKey: string;
    try {
      apiKey = await this.embeddings.getApiKey(tenantId);
    } catch {
      this.logger.warn(`[rag] bot=${botId} no embeddings API key for tenant — RAG skipped`);
      return ''; // No API key → skip RAG silently
    }

    let queryVec: number[];
    try {
      queryVec = await this.embeddings.embed(query, apiKey);
    } catch (err: any) {
      this.logger.warn(`[rag] Embedding query failed: ${err.message}`);
      return '';
    }

    const vecSql = this.embeddings.vectorToSql(queryVec);

    const rows: Array<{ content: string; similarity: number }> = await this.db.query(
      `SELECT content,
              1 - (embedding <=> $1::vector) AS similarity
       FROM bot_knowledge_chunks
       WHERE bot_id=$2 AND tenant_id=$3
         AND 1 - (embedding <=> $1::vector) >= $4
       ORDER BY embedding <=> $1::vector
       LIMIT $5`,
      [vecSql, botId, tenantId, RAG_MIN_SIMILARITY, RAG_TOP_K],
    );

    if (!rows.length) return '';

    const context = rows
      .map((r, i) => `[Fuente ${i + 1}]\n${r.content}`)
      .join('\n\n---\n\n');

    return `\n\n## Información relevante de tu base de conocimiento:\n${context}\n\n(Usa esta información como referencia para responder. Si no es suficiente, di que no tienes más información al respecto.)`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async assertDomainAllowed(tenantId: string, hostname: string) {
    const rootDomain = this.extractRootDomain(hostname);
    const [allowed] = await this.db.query(
      `SELECT id FROM tenant_allowed_domains
       WHERE tenant_id=$1 AND ($2 = domain OR $3 = domain)
       LIMIT 1`,
      [tenantId, hostname, rootDomain],
    );
    if (!allowed) {
      throw new BadRequestException(
        `El dominio "${hostname}" no está en tu lista de dominios permitidos. Añádelo primero en Configuración → Dominios.`,
      );
    }
  }

  private async enqueueIndexing(sourceId: string, botId: string, tenantId: string) {
    // Remove any prior job with this id (BullMQ keeps completed/failed jobs, so a
    // reindex with the same jobId would otherwise be ignored and stay 'pending').
    await this.queue.remove(`kb-${sourceId}`).catch(() => {});
    await this.queue.add(
      'index-source',
      { sourceId, botId, tenantId },
      {
        jobId: `kb-${sourceId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    );
  }

  private parseUrl(raw: string): URL | null {
    let s = (raw || '').trim();
    // Tolerate a pasted markdown link like "[text](https://site.com)".
    const md = s.match(/\((https?:\/\/[^)\s]+)\)/);
    if (md) s = md[1];
    try {
      return new URL(s.startsWith('http') ? s : `https://${s}`);
    } catch {
      return null;
    }
  }

  private normalizeDomain(input: string): string {
    try {
      const u = new URL(input.startsWith('http') ? input : `https://${input}`);
      return this.extractRootDomain(u.hostname);
    } catch {
      // Treat as plain domain string
      const clean = input.replace(/^www\./, '').toLowerCase().trim();
      return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean) ? clean : '';
    }
  }

  private extractRootDomain(hostname: string): string {
    return hostname.replace(/^www\./, '').toLowerCase();
  }
}
