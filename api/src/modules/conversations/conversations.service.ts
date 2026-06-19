import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseTenantService } from '../../common/services/base-tenant.service';
import { Conversation } from './entities/conversation.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ConversationsService extends BaseTenantService<Conversation> {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectDataSource() private readonly db: DataSource,
    protected readonly auditService: AuditService,
    protected readonly eventEmitter: EventEmitter2,
  ) {
    super(convRepo, auditService, eventEmitter);
  }

  /**
   * Override base create to wire up connection_id + external_id for WA Web conversations
   * and to auto-resolve the connection from the selected inbox.
   */
  async create(dto: any, tenantId: string, userId?: string): Promise<Conversation> {
    // If channelType is whatsapp_web, look up the connection linked to the inbox
    // and derive the external_id (contact's phone formatted as WA JID)
    if (dto.channelType === 'whatsapp_web' && dto.inboxId && !dto.connectionId) {
      const [conn] = await this.db.query(
        `SELECT id FROM channel_connections WHERE inbox_id=$1 AND channel_type='whatsapp_web' LIMIT 1`,
        [dto.inboxId],
      );
      if (conn) dto.connectionId = conn.id;
    }

    // If we have a contactId but no externalId, derive the WA JID from the contact's phone
    // Also auto-set subject from the contact's name if not provided
    if (dto.contactId && (!dto.externalId || !dto.subject)) {
      const [contact] = await this.db.query(
        `SELECT phone, full_name FROM contacts WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
        [dto.contactId, tenantId],
      );
      if (contact) {
        // Auto-set subject from contact name
        if (!dto.subject && contact.full_name) {
          dto.subject = contact.full_name;
        }
        // Derive WA JID for whatsapp_web channel
        if (dto.channelType === 'whatsapp_web' && !dto.externalId && contact.phone) {
          const phone = String(contact.phone);
          if (phone.startsWith('lid:')) {
            const lidDigits = phone.replace(/^lid:/, '');
            dto.externalId = `${lidDigits}@lid`;
          } else {
            const raw = phone.replace(/\D/g, '');
            if (raw) dto.externalId = `${raw}@s.whatsapp.net`;
          }
        }
      }
    }

    return super.create(dto, tenantId, userId);
  }

  async findAllEnriched(
    tenantId: string,
    status?: string,
    assignedTo?: string,
    inboxId?: string,
    tagId?: string,
    queueId?: string,
    viewer?: { id: string; role: string },
  ) {
    const params: any[] = [tenantId];
    const clauses: string[] = [];

    if (status)     { params.push(status);     clauses.push(`c.status = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); clauses.push(`c.assigned_to = $${params.length}`); }
    if (inboxId)    { params.push(inboxId);    clauses.push(`c.inbox_id = $${params.length}`); }
    if (queueId)    { params.push(queueId);    clauses.push(`c.queue_id = $${params.length}`); }

    // Team-based visibility: when the tenant enables it, an AGENT only sees
    // conversations of their teams (or their teams' queues), ones assigned to
    // them, or still-unassigned ones. Admins/owners always see everything.
    if (viewer && viewer.role !== 'admin' && viewer.role !== 'owner') {
      const [t] = await this.convRepo.query(
        `SELECT settings->>'restrictAgentsToTeams' AS flag FROM tenants WHERE id = $1`,
        [tenantId],
      );
      if (t?.flag === 'true') {
        params.push(viewer.id);
        const n = params.length;
        clauses.push(`(
          c.assigned_to = $${n} OR c.assigned_user_id = $${n}
          OR c.team_id IN (SELECT team_id FROM team_members WHERE user_id = $${n})
          OR c.queue_id IN (SELECT id FROM queues WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = $${n}))
          OR (c.team_id IS NULL AND c.queue_id IS NULL)
        )`);
      }
    }
    if (tagId)      {
      params.push(tagId);
      // Match conversations tagged directly OR whose contact has the tag
      const n = params.length;
      clauses.push(
        `(EXISTS (SELECT 1 FROM conversation_tags cvt WHERE cvt.conversation_id = c.id AND cvt.tag_id = $${n})
          OR ct.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = $${n}))`,
      );
    }

    const where = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

    const rows = await this.convRepo.query(
      `SELECT c.id, c.tenant_id AS "tenantId", c.inbox_id AS "inboxId", c.contact_id AS "contactId",
              c.subject, c.status, c.channel_type AS "channelType", c.assigned_to AS "assignedTo",
              c.connection_id AS "connectionId", c.external_id AS "externalId",
              c.queue_id AS "queueId", c.team_id AS "teamId", c.assigned_user_id AS "assignedUserId",
              c.is_group AS "isGroup",
              c.created_at AS "createdAt", c.updated_at AS "updatedAt",
        json_build_object('id', ct.id, 'fullName', ct.full_name, 'email', ct.email, 'phone', ct.phone) AS contact,
        json_build_object('id', i.id, 'name', i.name, 'channelType', i.channel_type) AS inbox,
        json_build_object('id', u.id, 'fullName', u.full_name, 'email', u.email) AS "assignedAgent",
        (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.is_private = false) AS "messageCount",
        (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id AND m2.is_private = false) AS "lastMessageAt",
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
           FROM conversation_tags cvt JOIN tags t ON t.id = cvt.tag_id
           WHERE cvt.conversation_id = c.id),
          '[]'::json
        ) AS tags
       FROM conversations c
       LEFT JOIN contacts ct ON ct.id = c.contact_id
       LEFT JOIN inboxes i ON i.id = c.inbox_id
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.tenant_id = $1
       ${where}
       ORDER BY c.updated_at DESC
       LIMIT 300`,
      params,
    );
    return rows;
  }

  findAllFiltered(tenantId: string, status?: string) {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.convRepo.find({ where, order: { updatedAt: 'DESC' }, take: 300 });
  }
}
