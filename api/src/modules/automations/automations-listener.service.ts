import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AutomationExecutorService, AutomationContext } from './automation-executor.service';

/**
 * Listens to application events via EventEmitter2 and triggers
 * matching automation rules.
 *
 * Events are emitted as plain objects with at minimum: { tenantId, ... }
 */
@Injectable()
export class AutomationsListenerService {
  private readonly logger = new Logger(AutomationsListenerService.name);

  constructor(private readonly executor: AutomationExecutorService) {}

  // ── Conversation events ──────────────────────────────────────────────────────

  @OnEvent('conversation.created')
  onConversationCreated(payload: any) {
    this.fire('conversation.created', payload);
  }

  @OnEvent('conversation.assigned')
  onConversationAssigned(payload: any) {
    this.fire('conversation.assigned', payload);
  }

  @OnEvent('conversation.resolved')
  onConversationResolved(payload: any) {
    this.fire('conversation.resolved', payload);
  }

  @OnEvent('conversation.reopened')
  onConversationReopened(payload: any) {
    this.fire('conversation.reopened', payload);
  }

  @OnEvent('conversation.message_received')
  onMessageReceived(payload: any) {
    this.fire('conversation.message_received', payload);
  }

  @OnEvent('conversation.idle')
  onConversationIdle(payload: any) {
    this.fire('conversation.idle', payload);
  }

  // ── Contact events ───────────────────────────────────────────────────────────

  @OnEvent('contact.created')
  onContactCreated(payload: any) {
    this.fire('contact.created', payload);
  }

  @OnEvent('contact.updated')
  onContactUpdated(payload: any) {
    this.fire('contact.updated', payload);
  }

  @OnEvent('contact.tag_added')
  onContactTagAdded(payload: any) {
    this.fire('contact.tag_added', payload);
  }

  // ── Deal events ──────────────────────────────────────────────────────────────

  @OnEvent('deal.created')
  onDealCreated(payload: any) {
    this.fire('deal.created', payload);
  }

  @OnEvent('deal.stage_changed')
  onDealStageChanged(payload: any) {
    this.fire('deal.stage_changed', payload);
  }

  @OnEvent('deal.won')
  onDealWon(payload: any) {
    this.fire('deal.won', payload);
  }

  @OnEvent('deal.lost')
  onDealLost(payload: any) {
    this.fire('deal.lost', payload);
  }

  // ── Task events ──────────────────────────────────────────────────────────────

  @OnEvent('task.created')
  onTaskCreated(payload: any) {
    this.fire('task.created', payload);
  }

  // ── Campaign events ──────────────────────────────────────────────────────────

  @OnEvent('campaign.started')
  onCampaignStarted(payload: any) {
    this.fire('campaign.started', payload);
  }

  @OnEvent('campaign.completed')
  onCampaignCompleted(payload: any) {
    this.fire('campaign.completed', payload);
  }

  // ── Internal dispatch ────────────────────────────────────────────────────────

  private fire(event: string, payload: any) {
    const ctx: AutomationContext = {
      tenantId:       payload.tenantId,
      triggerEvent:   event,
      conversationId: payload.conversationId ?? payload.conversation?.id,
      contactId:      payload.contactId ?? payload.contact?.id ?? payload.conversation?.contact_id,
      dealId:         payload.dealId ?? payload.deal?.id,
      taskId:         payload.taskId ?? payload.task?.id,
      conversation:   payload.conversation,
      message:        payload.message,
      contact:        payload.contact,
      deal:           payload.deal,
    };

    if (!ctx.tenantId) {
      this.logger.warn(`Event "${event}" missing tenantId — skipping`);
      return;
    }

    // Fire-and-forget; errors are caught inside executor
    this.executor.fireEvent(ctx).catch((e) =>
      this.logger.error(`Unhandled error firing event ${event}: ${e}`),
    );
  }
}
