import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ContentPost } from './entities/content-post.entity';
import { CreateContentPostDto, UpdateContentPostDto, GenerateContentDto } from './dto/content.dto';
import { CONTENT_PUBLISH_QUEUE, ContentPublishJobData } from './content-publish.constants';

const JOB_ID = (postId: string) => `content-${postId}`;

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(ContentPost) private readonly repo: Repository<ContentPost>,
    @InjectQueue(CONTENT_PUBLISH_QUEUE) private readonly queue: Queue<ContentPublishJobData>,
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

  generate(dto: GenerateContentDto): { body: string } {
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

    return { body: templates[dto.channel] ?? templates.blog };
  }
}
