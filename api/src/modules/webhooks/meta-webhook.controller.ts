import { Controller, Get, Post, Query, Body, Res, HttpCode, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { WebhooksService } from './webhooks.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Single app-level webhook for all Meta (Facebook + Instagram) connections.
 * Meta requires ONE callback URL per app — this endpoint routes by page ID.
 *
 * In Meta for Developers → Webhooks:
 *   Callback URL:  https://api.automarkiq.com/meta/webhook
 *   Verify Token:  value of META_WEBHOOK_VERIFY_TOKEN env var (default: automarkiq_meta_webhook)
 *
 * Subscribe to: messages, messaging_postbacks
 */
@SkipThrottle()
@Controller('meta/webhook')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly webhooks: WebhooksService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ── Verification (GET) ────────────────────────────────────────────────────────

  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') token: string,
    @Res() res: Response,
  ) {
    const expected = await this.getVerifyToken();
    if (mode === 'subscribe' && token === expected && challenge) {
      this.logger.log('Meta webhook verified');
      return res.status(200).send(challenge);
    }
    this.logger.warn(`Meta webhook verify failed — token mismatch or missing challenge`);
    return res.status(403).send('Forbidden');
  }

  private async getVerifyToken(): Promise<string> {
    try {
      const [row] = await this.db.query(
        `SELECT value FROM platform_settings WHERE key = 'meta.verify_token' LIMIT 1`,
      );
      if (row?.value) return row.value;
    } catch {}
    return process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'automarkiq_meta_webhook';
  }

  // ── Events (POST) ─────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(200)
  async receive(@Body() body: any) {
    try {
      const object: string = body?.object ?? '';
      this.logger.log(`Meta webhook received: object=${object} entries=${body?.entry?.length ?? 0}`);

      // Facebook Messenger sends object='page', Instagram sends object='instagram'
      const channel = object === 'instagram' ? 'instagram' : 'facebook';

      for (const entry of body?.entry ?? []) {
        const pageId = String(entry.id ?? '');
        if (!pageId) continue;

        const messagingCount = entry?.messaging?.length ?? 0;
        const changesCount   = entry?.changes?.length  ?? 0;
        this.logger.log(`Meta entry: pageId=${pageId} channel=${channel} messaging=${messagingCount} changes=${changesCount}`);

        // Find the connection whose credentials.pageId OR credentials.igAccountId matches.
        // Instagram Business Messaging sends entry.id = Instagram Business Account ID,
        // while Facebook Messenger sends entry.id = Facebook Page ID.
        const conn = await this.findConnectionByPageId(pageId, channel);
        if (!conn) {
          this.logger.warn(`No connection found for Meta pageId/igAccountId=${pageId} channel=${channel} — check connection credentials`);
          continue;
        }

        // Log matched routing for diagnostics
        this.logger.log(
          `Meta routing: entryId=${pageId} channel=${channel} → conn=${conn.id} tenant=${conn.tenant_id} inbox=${conn.inbox_id}`,
        );

        // Route to existing webhook service
        const fakeBody = { object, entry: [entry] };
        if (channel === 'instagram') {
          await this.webhooks.processInstagram(conn.id, fakeBody);
        } else {
          await this.webhooks.processFacebook(conn.id, fakeBody);
        }
      }
    } catch (err: any) {
      this.logger.error(`Meta webhook error: ${err.message}`, err.stack);
    }
    // Always return 200 so Meta doesn't retry
    return { ok: true };
  }

  private async findConnectionByPageId(pageId: string, channel: string) {
    // Match by Facebook Page ID (credentials->>'pageId') first,
    // then fall back to Instagram Business Account ID (credentials->>'igAccountId').
    // Instagram Business Messaging sends entry.id = igAccountId, not pageId.
    const [conn] = await this.db.query(
      `SELECT id, tenant_id, inbox_id, channel_type, credentials
       FROM channel_connections
       WHERE channel_type = $1
         AND is_active = true
         AND (
           credentials->>'pageId'     = $2
           OR credentials->>'igAccountId' = $2
         )
       ORDER BY
         -- prefer exact pageId match over igAccountId match
         CASE WHEN credentials->>'pageId' = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [channel, pageId],
    );
    return conn ?? null;
  }
}
