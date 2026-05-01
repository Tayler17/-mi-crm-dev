import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { CONTENT_PUBLISH_QUEUE, ContentPublishJobData } from './content-publish.constants';
import { ContentPost } from './entities/content-post.entity';
import { Connection } from '../connections/connection.entity';
import { publishToInstagram } from './publishers/instagram.publisher';
import { publishToFacebook } from './publishers/facebook.publisher';

/** Maps content channel names → Connection.channelType values */
const CHANNEL_TO_CONNECTION: Record<string, string> = {
  instagram: 'instagram',
  facebook:  'facebook',
};

@Processor(CONTENT_PUBLISH_QUEUE, { concurrency: 3 })
export class ContentPublishProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentPublishProcessor.name);

  constructor(
    @InjectRepository(ContentPost) private readonly posts: Repository<ContentPost>,
    @InjectRepository(Connection)  private readonly connections: Repository<Connection>,
  ) {
    super();
  }

  async process(job: Job<ContentPublishJobData>): Promise<void> {
    const { postId, tenantId } = job.data;
    this.logger.log(`[content-publish] Processing job ${job.id} — post ${postId}`);

    const post = await this.posts.findOne({ where: { id: postId, tenantId } });
    if (!post) {
      this.logger.warn(`[content-publish] Post ${postId} not found — skipping`);
      return;
    }
    if (post.status !== 'approved') {
      this.logger.warn(`[content-publish] Post ${postId} status is "${post.status}" (not approved) — skipping`);
      return;
    }

    // Find an active, connected connection for this channel
    const connectionType = CHANNEL_TO_CONNECTION[post.channel];
    const connection = connectionType
      ? await this.connections.findOne({
          where: { tenantId, channelType: connectionType, isActive: true, status: 'connected' },
        })
      : null;

    await this.publishToChannel(post, connection);

    // Mark as published
    await this.posts.update(postId, {
      status:      'published',
      publishedAt: new Date(),
    } as Partial<ContentPost>);

    this.logger.log(`[content-publish] Post ${postId} → published (channel: ${post.channel})`);
  }

  // ── Channel dispatch ─────────────────────────────────────────────────────────

  private async publishToChannel(post: ContentPost, connection: Connection | null): Promise<void> {
    switch (post.channel) {
      case 'instagram':
        if (!connection) throw new Error(`No hay una conexión de Instagram activa para este workspace`);
        await publishToInstagram(post, connection.credentials);
        break;

      case 'facebook':
        if (!connection) throw new Error(`No hay una conexión de Facebook activa para este workspace`);
        await publishToFacebook(post, connection.credentials);
        break;

      default:
        // blog, linkedin, twitter, youtube, other — no external API yet.
        // The post is simply marked as published.
        this.logger.log(`[content-publish] Canal "${post.channel}" no tiene conector externo — marcando como publicado`);
        break;
    }
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────────────

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ContentPublishJobData>, err: Error) {
    this.logger.error(
      `[content-publish] Job ${job.id} failed (post ${job.data.postId}, attempt ${job.attemptsMade}): ${err.message}`,
    );

    // After all retries are exhausted, flag the post so the user can see the error in the UI
    if (job.attemptsMade >= (job.opts?.attempts ?? 1)) {
      await this.posts.update(job.data.postId, {
        status:       'approved', // keep as approved so user can retry manually
        errorMessage: `Publicación fallida: ${err.message}`,
      } as any);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ContentPublishJobData>) {
    this.logger.log(`[content-publish] Job ${job.id} completed — post ${job.data.postId}`);
  }
}
