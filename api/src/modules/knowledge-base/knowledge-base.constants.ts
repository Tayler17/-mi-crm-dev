export const KB_QUEUE = 'knowledge-indexer';

export interface KbJobData {
  sourceId: string;
  botId: string;
  tenantId: string;
}

/** Max characters per chunk sent to the embedding model */
export const CHUNK_SIZE = 1200;
/** Overlap between consecutive chunks (characters) */
export const CHUNK_OVERLAP = 150;
/** Max chunks to inject into system prompt for RAG */
export const RAG_TOP_K = 4;
/** Minimum cosine similarity to include a chunk (0–1) */
export const RAG_MIN_SIMILARITY = 0.35;
