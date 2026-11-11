import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { PlatformSettingsService } from '../settings/platform-settings.service';

export interface BlogDraft {
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

/** Blog / News — a PLATFORM-level resource (AutoMarkIQ's own marketing blog), NOT per-tenant.
 *  Owner writes & publishes; the public landing (/blog) reads only published posts.
 *  Money/tenant concepts don't apply here. Same raw-SQL + onModuleInit schema pattern as voices. */

const LIST_COLS = `
  id, slug, title, excerpt,
  cover_image_url AS "coverImageUrl",
  status, tags,
  published_at AS "publishedAt",
  created_at   AS "createdAt",
  updated_at   AS "updatedAt"
`;

const FULL_COLS = `
  id, slug, title, excerpt,
  cover_image_url AS "coverImageUrl",
  body, status, tags,
  seo_title       AS "seoTitle",
  seo_description AS "seoDescription",
  author,
  published_at AS "publishedAt",
  created_at   AS "createdAt",
  updated_at   AS "updatedAt"
`;

export interface BlogPostInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
  body?: string;
  tags?: string[] | string;
  seoTitle?: string;
  seoDescription?: string;
  author?: string;
  status?: string;
}

@Injectable()
export class BlogService implements OnModuleInit {
  private readonly logger = new Logger(BlogService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug            text,
        title           text NOT NULL DEFAULT '',
        excerpt         text,
        cover_image_url text,
        body            text,
        status          text NOT NULL DEFAULT 'draft',  -- draft | published
        tags            text[] NOT NULL DEFAULT '{}',
        seo_title       text,
        seo_description text,
        author          text,
        published_at    timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => this.logger.error(`blog init: ${e.message}`));

    // Defensive evolution (CREATE TABLE IF NOT EXISTS never alters an existing table).
    for (const col of [
      'slug text', `title text NOT NULL DEFAULT ''`, 'excerpt text', 'cover_image_url text', 'body text',
      `status text NOT NULL DEFAULT 'draft'`, `tags text[] NOT NULL DEFAULT '{}'`, 'seo_title text',
      'seo_description text', 'author text', 'published_at timestamptz',
      'created_at timestamptz NOT NULL DEFAULT now()', 'updated_at timestamptz NOT NULL DEFAULT now()',
    ]) {
      await this.db.query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }
    await this.db.query(`CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_uidx ON blog_posts(slug) WHERE slug IS NOT NULL`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts(status)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts(published_at DESC)`).catch(() => {});
  }

  // ── Slug helpers ──────────────────────────────────────────────────────────────
  private slugify(input: string): string {
    return (input || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'post';
  }

  private async ensureUniqueSlug(base: string, exceptId?: string): Promise<string> {
    const root = this.slugify(base);
    let slug = root;
    let n = 1;
    // Loop until the slug is free (ignoring the row being edited).
    while (true) {
      const [row] = await this.db.query(
        `SELECT id FROM blog_posts WHERE slug=$1 ${exceptId ? 'AND id<>$2' : ''} LIMIT 1`,
        exceptId ? [slug, exceptId] : [slug],
      );
      if (!row) return slug;
      n += 1;
      slug = `${root}-${n}`;
    }
  }

  private normalizeTags(tags?: string[] | string): string[] {
    if (!tags) return [];
    const arr = Array.isArray(tags) ? tags : String(tags).split(',');
    return arr.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  }

  // ── Public reads (published only) ─────────────────────────────────────────────
  async listPublished(opts: { tag?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
    const offset = Math.max(Number(opts.offset) || 0, 0);
    const params: any[] = [];
    let tagFilter = '';
    if (opts.tag) { params.push(opts.tag); tagFilter = `AND $${params.length} = ANY(tags)`; }
    params.push(limit, offset);
    return this.db.query(
      `SELECT ${LIST_COLS} FROM blog_posts
        WHERE status='published' ${tagFilter}
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
  }

  async getPublishedBySlug(slug: string): Promise<any> {
    const [post] = await this.db.query(
      `SELECT ${FULL_COLS} FROM blog_posts WHERE slug=$1 AND status='published'`, [slug],
    );
    if (!post) throw new NotFoundException('Artículo no encontrado');
    return post;
  }

  // ── Owner (admin) ─────────────────────────────────────────────────────────────
  async adminList(): Promise<any[]> {
    return this.db.query(`SELECT ${LIST_COLS} FROM blog_posts ORDER BY created_at DESC`);
  }

  async adminGet(id: string): Promise<any> {
    const [post] = await this.db.query(`SELECT ${FULL_COLS} FROM blog_posts WHERE id=$1`, [id]);
    if (!post) throw new NotFoundException('Artículo no encontrado');
    return post;
  }

  async create(data: BlogPostInput): Promise<any> {
    const title = String(data.title ?? '').trim();
    if (!title) throw new BadRequestException('El título es obligatorio.');
    const slug = await this.ensureUniqueSlug(data.slug || title);
    const status = data.status === 'published' ? 'published' : 'draft';
    const [post] = await this.db.query(
      `INSERT INTO blog_posts
         (slug, title, excerpt, cover_image_url, body, status, tags, seo_title, seo_description, author, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $6='published' THEN now() ELSE NULL END)
       RETURNING ${FULL_COLS}`,
      [
        slug, title, data.excerpt ?? null, data.coverImageUrl ?? null, data.body ?? null,
        status, this.normalizeTags(data.tags), data.seoTitle ?? null, data.seoDescription ?? null, data.author ?? null,
      ],
    );
    return post;
  }

  async update(id: string, data: BlogPostInput): Promise<any> {
    const existing = await this.adminGet(id); // 404 if missing
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.title !== undefined) {
      const title = String(data.title).trim();
      if (!title) throw new BadRequestException('El título no puede quedar vacío.');
      fields.push(`title=$${idx++}`); values.push(title);
    }
    // Slug: explicit value, or regenerate from a new title if the slug wasn't set manually.
    if (data.slug !== undefined && String(data.slug).trim()) {
      fields.push(`slug=$${idx++}`); values.push(await this.ensureUniqueSlug(data.slug, id));
    } else if (data.title !== undefined && !existing.slug) {
      fields.push(`slug=$${idx++}`); values.push(await this.ensureUniqueSlug(data.title, id));
    }
    if (data.excerpt        !== undefined) { fields.push(`excerpt=$${idx++}`);         values.push(data.excerpt ?? null); }
    if (data.coverImageUrl  !== undefined) { fields.push(`cover_image_url=$${idx++}`); values.push(data.coverImageUrl ?? null); }
    if (data.body           !== undefined) { fields.push(`body=$${idx++}`);            values.push(data.body ?? null); }
    if (data.tags           !== undefined) { fields.push(`tags=$${idx++}`);            values.push(this.normalizeTags(data.tags)); }
    if (data.seoTitle       !== undefined) { fields.push(`seo_title=$${idx++}`);       values.push(data.seoTitle ?? null); }
    if (data.seoDescription !== undefined) { fields.push(`seo_description=$${idx++}`); values.push(data.seoDescription ?? null); }
    if (data.author         !== undefined) { fields.push(`author=$${idx++}`);          values.push(data.author ?? null); }
    if (data.status         !== undefined) {
      const status = data.status === 'published' ? 'published' : 'draft';
      fields.push(`status=$${idx++}`); values.push(status);
      // Stamp published_at the first time it goes live; keep it on re-saves; clear on unpublish.
      if (status === 'published') fields.push(`published_at=COALESCE(published_at, now())`);
      else fields.push(`published_at=NULL`);
    }

    if (!fields.length) return existing;
    values.push(id);
    const [post] = await this.db.query(
      `UPDATE blog_posts SET ${fields.join(', ')}, updated_at=now() WHERE id=$${idx} RETURNING ${FULL_COLS}`,
      values,
    );
    return post;
  }

  /** Publish / unpublish shortcut (used by the toggle button). */
  async setPublished(id: string, publish: boolean): Promise<any> {
    await this.adminGet(id); // 404 if missing
    const [post] = await this.db.query(
      publish
        ? `UPDATE blog_posts SET status='published', published_at=COALESCE(published_at, now()), updated_at=now() WHERE id=$1 RETURNING ${FULL_COLS}`
        : `UPDATE blog_posts SET status='draft', published_at=NULL, updated_at=now() WHERE id=$1 RETURNING ${FULL_COLS}`,
      [id],
    );
    return post;
  }

  async remove(id: string): Promise<void> {
    await this.db.query(`DELETE FROM blog_posts WHERE id=$1`, [id]);
  }

  // ── AI draft (Fase 3) ─────────────────────────────────────────────────────────
  /** Draft a full article from a topic using the platform AI. Returns structured
   *  fields the owner reviews/edits before saving — this NEVER saves anything. */
  async generateDraft(topic: string, opts: { tone?: string; language?: string } = {}): Promise<BlogDraft> {
    const t = String(topic || '').trim();
    if (!t) throw new BadRequestException('Indica un tema para generar el borrador.');

    const ai = await this.platformSettings.getAI().catch(() => ({ apiKey: '', provider: '', model: '' }));
    if (!ai?.apiKey) throw new BadRequestException('Falta configurar la IA de la plataforma (Ajustes → Plataforma).');

    const tone = opts.tone || 'profesional y cercano';
    const lang = (opts.language || 'es').toLowerCase().startsWith('en') ? 'inglés' : 'español';
    const prompt = `Eres redactor de marketing de contenidos para AutoMarkIQ, una plataforma de CRM con bots de IA, WhatsApp, automatización y atención al cliente.
Escribe un artículo de blog en ${lang} sobre el siguiente tema: "${t}".
Tono: ${tone}. Extensión: 400-700 palabras. Público: dueños de pequeños y medianos negocios.
Devuelve ÚNICAMENTE un objeto JSON válido (sin texto antes ni después, sin bloques de código \`\`\`), con esta forma exacta:
{
  "title": "título atractivo del artículo",
  "excerpt": "resumen de 1 o 2 frases para el listado",
  "body": "el artículo completo en Markdown (usa ##, ###, listas con -, **negrita**; NO incluyas el título como encabezado H1)",
  "tags": ["tag1","tag2","tag3"],
  "seoTitle": "título para buscadores, máximo 60 caracteres",
  "seoDescription": "meta description para Google, máximo 155 caracteres"
}`;

    const raw = await this.callAi(ai, prompt);
    const parsed = this.parseDraftJson(raw);
    return {
      title: String(parsed.title || t).slice(0, 180),
      excerpt: String(parsed.excerpt || ''),
      body: String(parsed.body || ''),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 10) : [],
      seoTitle: String(parsed.seoTitle || '').slice(0, 70),
      seoDescription: String(parsed.seoDescription || '').slice(0, 160),
    };
  }

  private async callAi(ai: { apiKey: string; provider: string; model: string }, prompt: string): Promise<string> {
    const provider = (ai.provider || 'openai').toLowerCase();
    if (provider === 'anthropic') {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: ai.model || 'claude-haiku-4-5-20251001', max_tokens: 1800, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01' }, timeout: 40000 },
      );
      return String(res.data?.content?.[0]?.text || '');
    }
    // Default: OpenAI (chat completions).
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: ai.model || 'gpt-4o-mini', temperature: 0.7, max_tokens: 1800, messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${ai.apiKey}` }, timeout: 40000 },
    );
    return String(res.data?.choices?.[0]?.message?.content || '');
  }

  private parseDraftJson(raw: string): any {
    let s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''); // strip code fences if any
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
    try {
      return JSON.parse(s);
    } catch {
      throw new BadRequestException('La IA no devolvió un formato válido. Intenta de nuevo o ajusta el tema.');
    }
  }
}
