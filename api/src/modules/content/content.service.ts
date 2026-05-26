import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import { createWriteStream, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';
import { ContentPost } from './entities/content-post.entity';
import { CreateContentPostDto, UpdateContentPostDto, GenerateContentDto, GenerateImageDto } from './dto/content.dto';
import { CONTENT_PUBLISH_QUEUE, ContentPublishJobData } from './content-publish.constants';
import { PlatformSettingsService } from '../settings/platform-settings.service';

// Approximate cost per image in USD per provider/size
const IMG_COST: Record<string, Record<string, number>> = {
  openai:    { '1024x1024': 0.040, '1792x1024': 0.080, '1024x1792': 0.080 },
  stability: { '1024x1024': 0.003, '1792x1024': 0.003, '1024x1792': 0.003 },
  fal:       { '1024x1024': 0.003, '1792x1024': 0.003, '1024x1792': 0.003 },
};

// Map normalised size → Stability AI dimensions
const STABILITY_SIZES: Record<string, { width: number; height: number }> = {
  '1024x1024': { width: 1024, height: 1024 },
  '1792x1024': { width: 1344, height: 768  },
  '1024x1792': { width: 768,  height: 1344 },
};

// Map normalised size → gpt-image-1 dimensions (different from dall-e-3)
const GPT_IMAGE_SIZES: Record<string, string> = {
  '1024x1024': '1024x1024',
  '1792x1024': '1536x1024',  // landscape
  '1024x1792': '1024x1536',  // portrait
};

// Map normalised size → Fal.ai image_size param
const FAL_SIZES: Record<string, string> = {
  '1024x1024': 'square_hd',
  '1792x1024': 'landscape_16_9',
  '1024x1792': 'portrait_16_9',
};

const IMAGE_UPLOAD_DIR = join(process.cwd(), 'uploads', 'content');

const JOB_ID = (postId: string) => `content-${postId}`;

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @InjectRepository(ContentPost) private readonly repo: Repository<ContentPost>,
    @InjectQueue(CONTENT_PUBLISH_QUEUE) private readonly queue: Queue<ContentPublishJobData>,
    private readonly platformSettings: PlatformSettingsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  findAll(tenantId: string, status?: string, channel?: string) {
    const where: any = { tenantId };
    if (status)  where.status  = status;
    if (channel) where.channel = channel;
    return this.repo.find({
      where,
      order: { scheduledAt: 'ASC', createdAt: 'DESC' },
      take: 500,
    });
  }

  async findOne(tenantId: string, id: string) {
    const post = await this.repo.findOne({ where: { id, tenantId } });
    if (!post) throw new NotFoundException('Content post not found');
    return post;
  }

  async create(tenantId: string, dto: CreateContentPostDto, user: { id: string; fullName: string }) {
    const post = this.repo.create({
      tenantId,
      title:        dto.title,
      body:         dto.body,
      status:       dto.status       ?? 'draft',
      channel:      dto.channel      ?? 'blog',
      tags:         dto.tags         ?? [],
      coverUrl:     dto.coverUrl,
      scheduledAt:  dto.scheduledAt  ? new Date(dto.scheduledAt) : undefined,
      authorId:     user.id,
      authorName:   user.fullName,
      assignedTo:   dto.assignedTo,
      assignedTeam: dto.assignedTeam,
      mediaUrl:     dto.mediaUrl,
      mediaType:    dto.mediaType,
      altText:      dto.altText,
    });
    const saved = await this.repo.save(post);
    if (saved.status === 'approved') await this.scheduleJob(saved);
    return saved;
  }

  async update(tenantId: string, id: string, dto: UpdateContentPostDto) {
    const post = await this.findOne(tenantId, id);
    Object.assign(post, {
      ...(dto.title        !== undefined && { title:        dto.title }),
      ...(dto.body         !== undefined && { body:         dto.body }),
      ...(dto.status       !== undefined && { status:       dto.status }),
      ...(dto.channel      !== undefined && { channel:      dto.channel }),
      ...(dto.tags         !== undefined && { tags:         dto.tags }),
      ...(dto.coverUrl     !== undefined && { coverUrl:     dto.coverUrl }),
      ...(dto.scheduledAt  !== undefined && { scheduledAt:  dto.scheduledAt ? new Date(dto.scheduledAt) : null }),
      ...(dto.publishedAt  !== undefined && { publishedAt:  dto.publishedAt ? new Date(dto.publishedAt) : null }),
      ...(dto.assignedTo   !== undefined && { assignedTo:   dto.assignedTo }),
      ...(dto.assignedTeam !== undefined && { assignedTeam: dto.assignedTeam }),
      ...(dto.mediaUrl     !== undefined && { mediaUrl:     dto.mediaUrl }),
      ...(dto.mediaType    !== undefined && { mediaType:    dto.mediaType }),
      ...(dto.altText      !== undefined && { altText:      dto.altText }),
    });
    if (dto.status === 'published' && !post.publishedAt) {
      post.publishedAt = new Date();
    }
    const saved = await this.repo.save(post);

    // Always cancel any existing scheduled job first, then re-evaluate
    await this.cancelJob(id);
    if (saved.status === 'approved') await this.scheduleJob(saved);

    return saved;
  }

  async remove(tenantId: string, id: string) {
    const post = await this.findOne(tenantId, id);
    await this.cancelJob(id);
    await this.repo.remove(post);
  }

  // ── Scheduling ────────────────────────────────────────────────────────────────

  private async scheduleJob(post: ContentPost): Promise<void> {
    const scheduledAt = post.scheduledAt ? new Date(post.scheduledAt) : null;
    const delay = scheduledAt && scheduledAt > new Date()
      ? scheduledAt.getTime() - Date.now()
      : 0;

    await this.queue.add(
      'publish',
      { postId: post.id, tenantId: post.tenantId },
      {
        jobId:    JOB_ID(post.id),
        delay,
        attempts: 3,
        backoff:  { type: 'exponential', delay: 60_000 }, // 1 min → 2 min → 4 min
        removeOnComplete: true,
        removeOnFail:     50,
      },
    );
  }

  private async cancelJob(postId: string): Promise<void> {
    const job = await this.queue.getJob(JOB_ID(postId));
    if (job) await job.remove();
  }

  // ── Scheduling status (used by controller) ────────────────────────────────────

  async getScheduleInfo(postId: string) {
    const job = await this.queue.getJob(JOB_ID(postId));
    if (!job) return { scheduled: false };
    const state = await job.getState();
    return {
      scheduled: true,
      state,
      runAt: job.opts.delay
        ? new Date(job.timestamp + (job.opts.delay ?? 0)).toISOString()
        : null,
    };
  }

  // ── AI content generator ──────────────────────────────────────────────────────

  async generate(dto: GenerateContentDto, tenantId?: string): Promise<{ body: string; aiGenerated: boolean; promptName?: string }> {
    // Try real AI first
    try {
      const aiResult = await this.generateWithAI(dto, tenantId);
      if (aiResult) return { body: aiResult.body, aiGenerated: true, promptName: aiResult.promptName };
    } catch (e: any) {
      this.logger.warn(`[generate] AI call failed, falling back to template: ${e.message}`);
    }

    // Fallback — hardcoded template
    return { body: this.generateFromTemplate(dto), aiGenerated: false };
  }

  // ── AI generation ─────────────────────────────────────────────────────────────

  private async generateWithAI(
    dto: GenerateContentDto,
    tenantId?: string,
  ): Promise<{ body: string; promptName?: string } | null> {
    const platformAI = await this.platformSettings.getAI();
    if (!platformAI?.apiKey) return null;

    // ── Resolve the AI prompt to use ─────────────────────────────────────────
    // Priority: (1) explicit promptId from request, (2) auto-pick active marketing prompt, (3) built-in prompt
    let prompt: string;
    let promptName: string | undefined;

    if (tenantId) {
      // If a specific promptId was sent, use it directly
      const lookupQuery = dto.promptId
        ? `SELECT id, name, prompt_text FROM ai_prompts WHERE id = $2 AND tenant_id = $1 LIMIT 1`
        : `SELECT id, name, prompt_text FROM ai_prompts
           WHERE tenant_id = $1 AND category = 'marketing' AND is_active = true
           ORDER BY updated_at DESC LIMIT 1`;

      const queryParams = dto.promptId ? [tenantId, dto.promptId] : [tenantId];
      const [customPrompt] = await this.db.query(lookupQuery, queryParams).catch(() => []);

      if (customPrompt?.prompt_text) {
        prompt = customPrompt.prompt_text
          .replace(/\{title\}/g,    dto.title)
          .replace(/\{channel\}/g,  dto.channel)
          .replace(/\{keywords\}/g, dto.keywords ?? '')
          .replace(/\{tone\}/g,     dto.tone ?? 'profesional');
        promptName = customPrompt.name;
        // Track usage
        this.db.query(
          `UPDATE ai_prompts SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
          [customPrompt.id],
        ).catch(() => {});
        this.logger.log(`[generate] Using custom marketing prompt: "${promptName}"`);
      } else {
        prompt = this.buildGenerationPrompt(dto);
      }
    } else {
      prompt = this.buildGenerationPrompt(dto);
    }

    // ── Call the configured AI provider ──────────────────────────────────────
    if (platformAI.provider === 'openai') {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: platformAI.model ?? 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 800,
        },
        { headers: { Authorization: `Bearer ${platformAI.apiKey}` }, timeout: 25000 },
      );
      const body = res.data.choices?.[0]?.message?.content?.trim();
      return body ? { body, promptName } : null;
    }

    if (platformAI.provider === 'anthropic') {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: platformAI.model ?? 'claude-haiku-4-5-20251001',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 800,
        },
        { headers: { 'x-api-key': platformAI.apiKey, 'anthropic-version': '2023-06-01' }, timeout: 25000 },
      );
      const body = res.data.content?.[0]?.text?.trim();
      return body ? { body, promptName } : null;
    }

    if (platformAI.provider === 'gemini') {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${platformAI.model ?? 'gemini-1.5-flash'}:generateContent?key=${platformAI.apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 25000 },
      );
      const body = res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return body ? { body, promptName } : null;
    }

    return null;
  }

  private buildGenerationPrompt(dto: GenerateContentDto): string {
    const kw = (dto.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    const tone = dto.tone ?? 'profesional';
    const hashtags = kw.map((k) => `#${k.replace(/\s+/g, '')}`).join(' ');

    const channelGuides: Record<string, string> = {
      instagram: `Post para Instagram: máx. 2200 caracteres. Usa emojis estratégicamente. Incluye un CTA al final. Termina con hashtags relevantes.`,
      facebook:  `Post para Facebook: puede ser más largo (hasta 400 palabras). Conversacional, narrativo. Incluye un CTA claro. Agrega hashtags al final si corresponde.`,
      linkedin:  `Artículo/post para LinkedIn: tono profesional. Usa separadores visuales o bullet points (→). Comparte un insight o aprendizaje. Termina con una pregunta que invite al debate. Agrega hashtags al final.`,
      twitter:   `Tweet para Twitter/X: MÁXIMO 280 caracteres en total (incluyendo hashtags). Directo, impactante. Un solo mensaje conciso.`,
      youtube:   `Descripción para YouTube: incluye una descripción corta de 2 líneas al inicio (importante para SEO), luego timestamps de ejemplo, links o recursos, y hashtags al final.`,
      blog:      `Artículo de blog en Markdown (usa ## y ### para secciones). Mínimo 3 secciones: Introducción, Desarrollo (al menos 2 puntos), Conclusión. Tono ${tone}, informativo y con valor real para el lector.`,
    };

    const guide = channelGuides[dto.channel] ?? channelGuides.blog;

    return `Eres un experto en marketing de contenidos. Escribe contenido de alta calidad para redes sociales o blog.

CANAL: ${dto.channel.toUpperCase()}
TÍTULO / TEMA: ${dto.title}
TONO: ${tone}
${kw.length ? `PALABRAS CLAVE: ${kw.join(', ')}` : ''}
${hashtags ? `HASHTAGS A INCLUIR: ${hashtags}` : ''}

INSTRUCCIONES ESPECÍFICAS:
${guide}

REGLAS GENERALES:
- Escribe en español.
- NO incluyas explicaciones previas, ni "Aquí está el post:", ni comillas al inicio/fin.
- Responde ÚNICAMENTE con el contenido final listo para publicar.
- Aporta valor real: datos, consejos prácticos o perspectiva única.
- Adapta perfectamente el formato al canal indicado.`;
  }

  // ── AI Image Generation ───────────────────────────────────────────────────────

  async generateImage(
    tenantId: string,
    userId: string,
    dto: GenerateImageDto,
  ): Promise<{ url: string; id: string; costUsd: number; provider: string }> {
    const size  = dto.size  ?? '1024x1024';
    const style = dto.style ?? 'vivid';

    // ── 1. Plan gate ──────────────────────────────────────────────────────────
    const [planRow] = await this.db.query(
      `SELECT p.has_image_gen, p.max_image_gen_month, p.allow_own_api_keys,
              t.settings,
              (SELECT COUNT(*)::int FROM ai_image_generations
               WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())) AS used_this_month
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );

    if (!planRow || planRow.has_image_gen === false) {
      throw new ForbiddenException('La generación de imágenes con IA no está incluida en tu plan. Actualiza para acceder a esta función.');
    }
    const limit = Number(planRow.max_image_gen_month);
    const used  = Number(planRow.used_this_month ?? 0);
    if (limit > 0 && used >= limit) {
      throw new ForbiddenException(`Has alcanzado el límite de ${limit} imágenes IA este mes. Actualiza tu plan para generar más.`);
    }

    // ── 2. Resolve provider + API key ─────────────────────────────────────────
    const tenantKeys: Record<string, string> = planRow.allow_own_api_keys
      ? (planRow.settings?.aiKeys ?? {}) : {};

    const [platformAI, platformStability, platformFal] = await Promise.all([
      this.platformSettings.getAI(),
      this.platformSettings.getStability(),
      this.platformSettings.getFal(),
    ]);

    // Build availability map: provider → apiKey
    const available: Record<string, string> = {};
    const openaiKey = tenantKeys['openai'] || (platformAI.provider === 'openai' ? platformAI.apiKey : '') || '';
    if (openaiKey) available['openai'] = openaiKey;
    const stabilityKey = tenantKeys['stability'] || platformStability.apiKey || '';
    if (stabilityKey) available['stability'] = stabilityKey;
    const falKey = tenantKeys['fal'] || platformFal.apiKey || '';
    if (falKey) available['fal'] = falKey;

    // Determine which provider to use
    let provider = dto.provider ?? '';
    if (!provider || !available[provider]) {
      // Auto-select first available in priority order
      provider = ['openai', 'stability', 'fal'].find((p) => available[p]) ?? '';
    }
    if (!provider || !available[provider]) {
      throw new ForbiddenException('No hay ningún proveedor de imágenes IA configurado. Añade una API key en Settings → Platform.');
    }

    const apiKey = available[provider];

    // ── 3. Generate image ─────────────────────────────────────────────────────
    // Each provider returns { localUrl, model }.
    // Stability saves base64 directly. DALL-E handles both URL (standard keys) and b64_json (service-account keys). Fal downloads a temp URL.
    let localUrl: string;
    let model: string;

    if (provider === 'openai') {
      ({ localUrl, model } = await this.callDallE(dto.prompt, size, apiKey));
    } else if (provider === 'stability') {
      ({ localUrl, model } = await this.callStability(dto.prompt, size, apiKey));
    } else {
      const r = await this.callFal(dto.prompt, size, apiKey);
      model    = r.model;
      localUrl = await this.downloadAndSave(r.tempUrl);
    }

    // ── 5. Record in history ──────────────────────────────────────────────────
    const cost = (IMG_COST[provider] ?? IMG_COST['openai'])[size] ?? 0.040;
    const [record] = await this.db.query(
      `INSERT INTO ai_image_generations
         (tenant_id, user_id, prompt, image_url, provider, model, size, style, cost_usd, content_post_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [tenantId, userId, dto.prompt, localUrl, provider, model, size, style, cost, dto.contentPostId ?? null],
    );

    this.logger.log(`[image-gen] Tenant ${tenantId} generated image via ${provider}: ${localUrl} (${size}, $${cost})`);
    return { url: localUrl, id: record.id, costUsd: cost, provider };
  }

  // ── Provider implementations ──────────────────────────────────────────────

  private async callDallE(
    prompt: string, size: string, apiKey: string,
  ): Promise<{ localUrl: string; model: string }> {
    // gpt-image-1 is the current model for service-account keys (sk-svcacct-*).
    // It uses slightly different size strings and always returns b64_json.
    const gptSize = GPT_IMAGE_SIZES[size] ?? '1024x1024';
    const res = await axios.post(
      'https://api.openai.com/v1/images/generations',
      { model: 'gpt-image-1', prompt, n: 1, size: gptSize },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 90000 },
    );
    const item = res.data?.data?.[0];
    if (!item) throw new Error('OpenAI image API no devolvió imagen');

    // gpt-image-1 always returns base64
    if (item.b64_json) {
      if (!existsSync(IMAGE_UPLOAD_DIR)) mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });
      const filename = `ai-${Date.now()}-${randomBytes(6).toString('hex')}.png`;
      writeFileSync(join(IMAGE_UPLOAD_DIR, filename), Buffer.from(item.b64_json, 'base64'));
      return { localUrl: `/uploads/content/${filename}`, model: 'gpt-image-1' };
    }

    // Fallback: older dall-e-3 keys return a temporary URL
    if (item.url) {
      const localUrl = await this.downloadAndSave(item.url);
      return { localUrl, model: 'gpt-image-1' };
    }

    throw new Error('OpenAI image API no devolvió URL ni base64');
  }

  private async callStability(
    prompt: string, size: string, apiKey: string,
  ): Promise<{ localUrl: string; model: string }> {
    const { width, height } = STABILITY_SIZES[size] ?? STABILITY_SIZES['1024x1024'];
    const res = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      { text_prompts: [{ text: prompt, weight: 1 }], cfg_scale: 7, height, width, steps: 30, samples: 1 },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 90000,
      },
    );
    const b64: string = res.data?.artifacts?.[0]?.base64;
    if (!b64) throw new Error(`Stability AI error: ${JSON.stringify(res.data)}`);

    if (!existsSync(IMAGE_UPLOAD_DIR)) mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });
    const filename = `ai-${Date.now()}-${randomBytes(6).toString('hex')}.png`;
    writeFileSync(join(IMAGE_UPLOAD_DIR, filename), Buffer.from(b64, 'base64'));
    return { localUrl: `/uploads/content/${filename}`, model: 'stable-diffusion-xl-1024-v1-0' };
  }

  private async callFal(
    prompt: string, size: string, apiKey: string,
  ): Promise<{ tempUrl: string; model: string }> {
    const image_size = FAL_SIZES[size] ?? 'square_hd';
    const res = await axios.post(
      'https://fal.run/fal-ai/flux/schnell',
      { prompt, image_size, num_inference_steps: 4, num_images: 1, enable_safety_checker: true },
      { headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 90000 },
    );
    const tempUrl: string = res.data?.images?.[0]?.url;
    if (!tempUrl) throw new Error(`Fal.ai error: ${JSON.stringify(res.data)}`);
    return { tempUrl, model: 'fal-ai/flux/schnell' };
  }

  async getImageHistory(tenantId: string): Promise<any[]> {
    return this.db.query(
      `SELECT id, prompt, image_url, size, style, cost_usd, content_post_id, created_at
       FROM ai_image_generations
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [tenantId],
    );
  }

  async getImageUsage(tenantId: string): Promise<{
    used: number; limit: number; hasAccess: boolean;
    availableProviders: string[];
  }> {
    const [row] = await this.db.query(
      `SELECT p.has_image_gen, p.max_image_gen_month, p.allow_own_api_keys, t.settings,
              (SELECT COUNT(*)::int FROM ai_image_generations
               WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())) AS used_this_month
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );

    if (!row) return { used: 0, limit: 0, hasAccess: false, availableProviders: [] };

    const tenantKeys: Record<string, string> = row.allow_own_api_keys
      ? (row.settings?.aiKeys ?? {}) : {};
    const [platformAI, platformStability, platformFal] = await Promise.all([
      this.platformSettings.getAI(),
      this.platformSettings.getStability(),
      this.platformSettings.getFal(),
    ]);

    const availableProviders: string[] = [];
    if (tenantKeys['openai'] || (platformAI.provider === 'openai' && platformAI.apiKey)) availableProviders.push('openai');
    if (tenantKeys['stability'] || platformStability.apiKey) availableProviders.push('stability');
    if (tenantKeys['fal'] || platformFal.apiKey) availableProviders.push('fal');

    return {
      used:      Number(row.used_this_month ?? 0),
      limit:     Number(row.max_image_gen_month ?? 0),
      hasAccess: row.has_image_gen === true,
      availableProviders,
    };
  }

  /** Downloads a temporary URL and saves to uploads/content/. Returns the local URL path. */
  private async downloadAndSave(tempUrl: string): Promise<string> {
    if (!existsSync(IMAGE_UPLOAD_DIR)) mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });

    const filename = `ai-${Date.now()}-${randomBytes(6).toString('hex')}.png`;
    const dest     = join(IMAGE_UPLOAD_DIR, filename);

    const response = await axios.get(tempUrl, { responseType: 'stream', timeout: 60000 });
    await new Promise<void>((resolve, reject) => {
      const writer = createWriteStream(dest);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error',  reject);
    });

    return `/uploads/content/${filename}`;
  }

  // ── Template fallback ─────────────────────────────────────────────────────────

  private generateFromTemplate(dto: GenerateContentDto): string {
    const kw = (dto.keywords ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const hashtags = kw.map((k) => `#${k.replace(/\s+/g, '')}`).join(' ');
    const tone = dto.tone ?? 'profesional';

    const templates: Record<string, string> = {
      instagram: [
        `✨ ${dto.title}`,
        '',
        `[Conecta con tu audiencia con una frase de apertura ${tone}. Ej: "¿Sabías que…?"]`,
        '',
        `[Desarrolla el mensaje central en 2-3 líneas cortas. Sé directo y aporta valor real.]`,
        '',
        `💡 [Añade un tip, dato o reflexión que tu comunidad pueda aplicar hoy.]`,
        '',
        `👇 [Call to action: pregunta o invitación a comentar]`,
        '',
        hashtags,
      ].join('\n'),

      facebook: [
        `📣 ${dto.title}`,
        '',
        `[Abre con una pregunta o estadística que genere curiosidad.]`,
        '',
        `[Párrafo 1: introduce el problema o contexto que tu audiencia reconoce.]`,
        '',
        `[Párrafo 2: presenta la solución o insight principal con tono ${tone}.]`,
        '',
        `[Párrafo 3: cierra con un call to action claro.]`,
        '',
        hashtags,
      ].join('\n'),

      linkedin: [
        `${dto.title}`,
        '',
        `[Hook de apertura: una frase corta y directa que genere interés profesional.]`,
        '',
        `[Desarrolla el tema con 3-5 puntos clave en tono ${tone}:]`,
        `→ Punto 1`,
        `→ Punto 2`,
        `→ Punto 3`,
        '',
        `[Reflexión final o aprendizaje que aporte valor a tu red profesional.]`,
        '',
        `¿Qué piensas tú? 👇`,
        '',
        hashtags,
      ].join('\n'),

      twitter: [
        `${dto.title.slice(0, 100)}`,
        '',
        `[Mensaje principal en máx. 180 caracteres. Sé conciso y directo.]`,
        '',
        hashtags.slice(0, 60),
      ].join('\n'),

      youtube: [
        `🎬 ${dto.title}`,
        '',
        `[DESCRIPCIÓN CORTA — 1-2 líneas que aparecen en la búsqueda]`,
        `[Ej: "En este video aprenderás…"]`,
        '',
        `──────────────────────────`,
        `📌 EN ESTE VIDEO:`,
        `00:00 – Introducción`,
        `00:30 – [Tema 1]`,
        `02:00 – [Tema 2]`,
        `04:00 – Conclusión`,
        '',
        `──────────────────────────`,
        `💬 ¿Tienes alguna pregunta? Déjala en los comentarios.`,
        `🔔 Suscríbete para no perderte el próximo video.`,
        '',
        hashtags,
      ].join('\n'),

      blog: [
        `# ${dto.title}`,
        '',
        `## Introducción`,
        `[Párrafo de apertura que engancha al lector y presenta el problema o tema central.]`,
        '',
        `## Desarrollo`,
        '',
        `### Punto 1`,
        `[Explica el primer aspecto clave con ejemplos concretos.]`,
        '',
        `### Punto 2`,
        `[Amplía con un segundo argumento o perspectiva.]`,
        '',
        `### Punto 3`,
        `[Cierra el desarrollo con un tercer punto de valor.]`,
        '',
        `## Conclusión`,
        `[Resume los puntos clave y termina con un call to action o reflexión final.]`,
        '',
        `---`,
        hashtags ? `*Tags: ${kw.join(', ')}*` : '',
      ].filter((l) => l !== undefined).join('\n'),
    };

    return templates[dto.channel] ?? templates.blog;
  }
}
