import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WhatsappWebService } from '../connections/whatsapp-web.service';

/**
 * Polls every 60 s for campaigns with status = 'running'.
 * For each running campaign, resolves all pending recipients
 * (individual + contact-list targets), finds or creates a conversation,
 * inserts the campaign messages, and marks the contact as 'sent'.
 * When every contact is sent, marks the campaign 'completed'.
 */
@Injectable()
export class CampaignWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly waSvc: WhatsappWebService,
  ) {}

  onModuleInit() {
    this.processAll();
    this.timer = setInterval(() => this.processAll(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async processAll() {
    try {
      const campaigns = await this.db.query(
        `SELECT id, tenant_id, messages, inbox_id
         FROM campaigns
         WHERE status = 'running'`,
      );
      if (!campaigns.length) return;

      this.logger.log(`Processing ${campaigns.length} running campaign(s)`);
      for (const campaign of campaigns) {
        try {
          await this.processCampaign(campaign);
        } catch (err) {
          this.logger.error(`Campaign ${campaign.id} processing error: ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Campaign worker error: ${err}`);
    }
  }

  private async processCampaign(campaign: { id: string; tenant_id: string; messages: string[]; inbox_id: string | null }) {
    const msgs: string[] = Array.isArray(campaign.messages) ? campaign.messages : [];
    if (!msgs.filter(Boolean).length) {
      this.logger.warn(`Campaign ${campaign.id} has no messages — marking completed`);
      await this.db.query(`UPDATE campaigns SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`, [campaign.id]);
      return;
    }

    // Resolve all pending recipients (individual + list-based, minus already sent)
    const recipients = await this.db.query(
      `SELECT * FROM (
         -- Individual recipients added explicitly
         SELECT DISTINCT cc.id AS cc_id, cc.contact_id, 'individual' AS source
         FROM campaign_contacts cc
         WHERE cc.campaign_id = $1 AND cc.status = 'pending'

         UNION

         -- Contacts from target lists not yet tracked in campaign_contacts
         SELECT DISTINCT NULL::uuid AS cc_id, clc.contact_id, 'list' AS source
         FROM campaign_targets ct
         JOIN contact_list_contacts clc ON clc.list_id = ct.contact_list_id
         JOIN contacts c ON c.id = clc.contact_id AND c.tenant_id = $2
         WHERE ct.campaign_id = $1
           AND clc.contact_id NOT IN (
             SELECT contact_id FROM campaign_contacts WHERE campaign_id = $1
           )
       ) AS r`,
      [campaign.id, campaign.tenant_id],
    );

    if (!recipients.length) {
      // All sent — mark completed
      await this.db.query(
        `UPDATE campaigns SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [campaign.id],
      );
      this.logger.log(`Campaign ${campaign.id} completed (no pending recipients)`);
      return;
    }

    this.logger.log(`Campaign ${campaign.id}: sending to ${recipients.length} recipient(s)`);

    let sentCount = 0;
    for (const r of recipients) {
      try {
        await this.sendToContact(campaign, r.contact_id, msgs);

        // Ensure there's a campaign_contacts row, then mark sent
        if (r.cc_id) {
          await this.db.query(
            `UPDATE campaign_contacts SET status='sent', sent_at=NOW() WHERE id=$1`,
            [r.cc_id],
          );
        } else {
          await this.db.query(
            `INSERT INTO campaign_contacts (campaign_id, contact_id, status, sent_at)
             VALUES ($1, $2, 'sent', NOW())
             ON CONFLICT (campaign_id, contact_id) DO UPDATE SET status='sent', sent_at=NOW()`,
            [campaign.id, r.contact_id],
          );
        }
        sentCount++;
      } catch (err) {
        this.logger.error(`Failed sending campaign ${campaign.id} to contact ${r.contact_id}: ${err}`);
        // Mark as failed so we don't retry forever
        if (r.cc_id) {
          await this.db.query(`UPDATE campaign_contacts SET status='failed' WHERE id=$1`, [r.cc_id]);
        } else {
          await this.db.query(
            `INSERT INTO campaign_contacts (campaign_id, contact_id, status)
             VALUES ($1, $2, 'failed')
             ON CONFLICT (campaign_id, contact_id) DO UPDATE SET status='failed'`,
            [campaign.id, r.contact_id],
          );
        }
      }
    }

    // Update sent_count
    await this.db.query(
      `UPDATE campaigns SET sent_count = sent_count + $2, updated_at=NOW() WHERE id=$1`,
      [campaign.id, sentCount],
    );

    // Check if all done
    const [{ pending }] = await this.db.query(
      `SELECT COUNT(*) AS pending FROM campaign_contacts WHERE campaign_id=$1 AND status='pending'`,
      [campaign.id],
    );
    // Also check if all list contacts are accounted for
    const [{ list_pending }] = await this.db.query(
      `SELECT COUNT(*) AS list_pending
       FROM campaign_targets ct
       JOIN contact_list_contacts clc ON clc.list_id = ct.contact_list_id
       WHERE ct.campaign_id = $1
         AND clc.contact_id NOT IN (
           SELECT contact_id FROM campaign_contacts WHERE campaign_id=$1 AND status != 'pending'
         )`,
      [campaign.id],
    );

    if (parseInt(pending, 10) === 0 && parseInt(list_pending, 10) === 0) {
      await this.db.query(
        `UPDATE campaigns SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [campaign.id],
      );
      this.logger.log(`Campaign ${campaign.id} completed — ${sentCount} message(s) sent`);
    }
  }

  private async sendToContact(
    campaign: { id: string; tenant_id: string; inbox_id: string | null },
    contactId: string,
    messages: string[],
  ) {
    // Resolve contact phone + inbox channel info for delivery
    const [contact] = await this.db.query(
      `SELECT phone FROM contacts WHERE id = $1`,
      [contactId],
    );
    const rawPhone = (contact?.phone ?? '').replace(/\D/g, '');

    let connectionId: string | null = null;
    let channelType: string | null = null;
    const externalId = rawPhone ? `${rawPhone}@s.whatsapp.net` : null;

    if (campaign.inbox_id) {
      const [inboxInfo] = await this.db.query(
        `SELECT i.channel_type, cc.id AS connection_id
         FROM inboxes i
         LEFT JOIN channel_connections cc ON cc.inbox_id = i.id
         WHERE i.id = $1 LIMIT 1`,
        [campaign.inbox_id],
      );
      if (inboxInfo) {
        channelType = inboxInfo.channel_type;
        connectionId = inboxInfo.connection_id ?? null;
      }
    }

    // Find or create a conversation for this contact
    let conversationId: string;

    const existing = await this.db.query(
      `SELECT id FROM conversations
       WHERE tenant_id=$1 AND contact_id=$2
         AND ($3::uuid IS NULL OR inbox_id=$3)
       ORDER BY created_at DESC
       LIMIT 1`,
      [campaign.tenant_id, contactId, campaign.inbox_id ?? null],
    );

    if (existing.length) {
      conversationId = existing[0].id;
      // Backfill connection/external_id if missing
      if (connectionId || externalId) {
        await this.db.query(
          `UPDATE conversations
           SET connection_id = COALESCE(connection_id, $2),
               external_id   = COALESCE(external_id, $3),
               channel_type  = COALESCE(channel_type, $4)
           WHERE id = $1`,
          [conversationId, connectionId, externalId, channelType],
        ).catch(() => {});
      }
    } else {
      const [conv] = await this.db.query(
        `INSERT INTO conversations
           (tenant_id, contact_id, inbox_id, connection_id, external_id, channel_type, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW(), NOW())
         RETURNING id`,
        [campaign.tenant_id, contactId, campaign.inbox_id ?? null, connectionId, externalId, channelType],
      );
      conversationId = conv.id;
    }

    // Insert + deliver each non-empty message in sequence
    for (const body of messages.filter(Boolean)) {
      await this.db.query(
        `INSERT INTO messages
           (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
         VALUES ($1, $2, $3, 'text', 'outbound', 'bot', false, NOW(), NOW())`,
        [campaign.tenant_id, conversationId, body],
      );

      // Deliver via WhatsApp Web when available
      if (channelType === 'whatsapp_web' && connectionId && externalId) {
        const sent = await this.waSvc.sendMessage(connectionId, externalId, body);
        if (!sent) {
          this.logger.warn(`Campaign ${campaign.id}: WA delivery failed to ${externalId}`);
        }
      }
    }

    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [conversationId],
    );
  }
}
