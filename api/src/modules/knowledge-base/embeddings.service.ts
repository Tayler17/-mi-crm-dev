import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL      = 'text-embedding-3-small'; // 1536 dims, cheap

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Generate a single embedding vector for a text string */
  async embed(text: string, apiKey: string): Promise<number[]> {
    const res = await (globalThis as any).fetch(OPENAI_EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      throw new Error(`OpenAI embeddings error: ${err}`);
    }

    const data = await res.json();
    return data.data[0].embedding as number[];
  }

  /** Batch-embed an array of texts (respects rate limits with small delay) */
  async embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text, apiKey));
      // 50 ms gap to avoid hitting OpenAI rate limits on free tiers
      await new Promise((r) => setTimeout(r, 50));
    }
    return results;
  }

  /** Get the tenant's OpenAI API key from settings */
  async getApiKey(tenantId: string): Promise<string> {
    const [tenant] = await this.db.query(
      `SELECT settings FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const key = tenant?.settings?.aiKeys?.openai ?? '';
    if (!key) throw new Error('No OpenAI API key configured for this tenant. Go to Settings → AI Integrations.');
    return key;
  }

  /** Format a vector for pgvector insertion */
  vectorToSql(vec: number[]): string {
    return `[${vec.join(',')}]`;
  }
}
