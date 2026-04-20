import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FlowRunnerService } from './flow-runner.service';

/**
 * Listens for conversation events and drives flow sessions:
 * - conversation.created → try to start a flow with trigger 'new_conversation'
 * - conversation.message_received → continue an active session if one exists,
 *   OR try to match a 'keyword' trigger
 */
@Injectable()
export class FlowsListenerService {
  private readonly logger = new Logger(FlowsListenerService.name);

  constructor(
    private readonly runner: FlowRunnerService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @OnEvent('conversation.created')
  async onConversationCreated(payload: any) {
    const { tenantId, conversationId, conversation } = payload;
    if (!tenantId || !conversationId) return;

    const contactId = conversation?.contact_id;
    const inboxId   = conversation?.inbox_id;

    // Find first active flow matching trigger 'new_conversation' for this inbox (or global)
    const flows = await this.db.query(
      `SELECT id FROM conversation_flows
       WHERE tenant_id=$1 AND is_active=true AND trigger_type='new_conversation'
         AND (inbox_id IS NULL OR inbox_id=$2)
       ORDER BY (inbox_id IS NOT NULL) DESC  -- prefer inbox-specific first
       LIMIT 1`,
      [tenantId, inboxId ?? null],
    );

    if (!flows.length) return;
    await this.runner.startSession(tenantId, flows[0].id, conversationId, contactId).catch((e) =>
      this.logger.error(`startSession error: ${e}`),
    );
  }

  @OnEvent('conversation.message_received')
  async onMessageReceived(payload: any) {
    const { tenantId, conversationId, message } = payload;
    if (!tenantId || !conversationId) return;

    const body: string = message?.body ?? '';

    // 1. Continue existing active session
    const [activeSession] = await this.db.query(
      `SELECT id FROM flow_sessions WHERE conversation_id=$1 AND status='active' LIMIT 1`,
      [conversationId],
    );

    if (activeSession) {
      await this.runner.continueSession(conversationId, tenantId, body).catch((e) =>
        this.logger.error(`continueSession error: ${e}`),
      );
      return;
    }

    // 2. Try to match a 'keyword' or 'first_message' trigger
    const [conv] = await this.db.query(
      `SELECT inbox_id, contact_id FROM conversations WHERE id=$1 LIMIT 1`,
      [conversationId],
    );

    const flows = await this.db.query(
      `SELECT id, trigger_type, trigger_value FROM conversation_flows
       WHERE tenant_id=$1 AND is_active=true
         AND trigger_type IN ('keyword','first_message')
         AND (inbox_id IS NULL OR inbox_id=$2)`,
      [tenantId, conv?.inbox_id ?? null],
    );

    for (const flow of flows) {
      let match = false;
      if (flow.trigger_type === 'first_message') {
        match = true;
      } else if (flow.trigger_type === 'keyword' && flow.trigger_value) {
        match = body.toLowerCase().includes((flow.trigger_value as string).toLowerCase());
      }

      if (match) {
        await this.runner.startSession(tenantId, flow.id, conversationId, conv?.contact_id, body).catch((e) =>
          this.logger.error(`startSession (keyword) error: ${e}`),
        );
        break;
      }
    }
  }

  @OnEvent('conversation.reopened')
  async onConversationReopened(payload: any) {
    const { tenantId, conversationId, conversation } = payload;
    if (!tenantId || !conversationId) return;

    const inboxId = conversation?.inbox_id;
    const flows = await this.db.query(
      `SELECT id FROM conversation_flows
       WHERE tenant_id=$1 AND is_active=true AND trigger_type='reopened'
         AND (inbox_id IS NULL OR inbox_id=$2)
       LIMIT 1`,
      [tenantId, inboxId ?? null],
    );

    if (!flows.length) return;
    await this.runner.startSession(tenantId, flows[0].id, conversationId, conversation?.contact_id).catch((e) =>
      this.logger.error(`startSession (reopened) error: ${e}`),
    );
  }
}
