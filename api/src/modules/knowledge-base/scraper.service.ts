import { Injectable, Logger } from '@nestjs/common';
import { CHUNK_SIZE, CHUNK_OVERLAP } from './knowledge-base.constants';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  /** Fetch a URL and return clean plain text */
  async scrapeUrl(url: string): Promise<{ title: string; text: string }> {
    const res = await (globalThis as any).fetch(url, {
      headers: { 'User-Agent': 'CRM-KnowledgeBot/1.0 (internal indexer)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

    const html: string = await res.text();

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // Remove scripts/styles/nav noise — but KEEP header & footer, which usually
    // hold the address, opening hours and phone (exactly what users ask for).
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')          // strip remaining tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, ' ')           // collapse whitespace
      .trim();

    return { title, text: cleaned };
  }

  /** Parse a PDF buffer and return plain text */
  async parsePdf(buffer: Buffer): Promise<{ title: string; text: string }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    const text = (data.text as string)
      .replace(/\s{2,}/g, ' ')
      .trim();
    const title = (data.info?.Title as string | undefined) ?? 'PDF Document';
    return { title, text };
  }

  /** Split text into overlapping chunks for embedding */
  chunkText(text: string): string[] {
    if (!text) return [];

    // Split on paragraph breaks first, then merge/split to hit CHUNK_SIZE
    const paragraphs = text.split(/\n{2,}|\r\n{2,}/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      const candidate = current ? `${current}\n\n${para}` : para;

      if (candidate.length <= CHUNK_SIZE) {
        current = candidate;
      } else {
        // Flush current chunk
        if (current) chunks.push(current.trim());

        // If the paragraph itself is larger than CHUNK_SIZE, split it by sentences
        if (para.length > CHUNK_SIZE) {
          const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
          current = '';
          for (const sent of sentences) {
            const next = current ? `${current} ${sent}` : sent;
            if (next.length <= CHUNK_SIZE) {
              current = next;
            } else {
              if (current) chunks.push(current.trim());
              // Hard-split oversized sentences
              if (sent.length > CHUNK_SIZE) {
                for (let i = 0; i < sent.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
                  chunks.push(sent.slice(i, i + CHUNK_SIZE).trim());
                }
                current = '';
              } else {
                current = sent;
              }
            }
          }
        } else {
          current = para;
        }
      }
    }

    if (current.trim()) chunks.push(current.trim());

    // Add overlap: prepend last N chars of previous chunk to next chunk
    const overlapped: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        overlapped.push(chunks[i]);
      } else {
        const prev = chunks[i - 1];
        const overlap = prev.slice(Math.max(0, prev.length - CHUNK_OVERLAP));
        overlapped.push(`${overlap} ${chunks[i]}`.trim());
      }
    }

    return overlapped.filter((c) => c.length > 40); // drop tiny fragments
  }
}
