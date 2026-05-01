import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignContact } from './entities/campaign-contact.entity';
import { CreateCampaignDto, UpdateCampaignDto, AddContactsDto, AddContactsByFilterDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignContact) private readonly contactRepo: Repository<CampaignContact>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ── Core CRUD ─────────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    const rows = await this.db.query(
      `SELECT c.*,
              COUNT(DISTINCT cc.contact_id) AS contact_count,
              COUNT(DISTINCT ct.contact_list_id) AS list_count,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('id', cl.id, 'name', cl.name))
                FILTER (WHERE cl.id IS NOT NULL), '[]'
              ) AS target_lists,
              s.name AS schedule_name
       FROM campaigns c
       LEFT JOIN campaign_contacts cc ON cc.campaign_id = c.id
       LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id
       LEFT JOIN contact_lists cl ON cl.id = ct.contact_list_id
       LEFT JOIN schedules s ON s.id = c.schedule_id
       WHERE c.tenant_id = $1
       GROUP BY c.id, s.name
       ORDER BY c.created_at DESC
       LIMIT 200`,
      [tenantId],
    );
    return rows.map((r: any) => ({
      ...r,
      // explicit camelCase so the frontend can read them (raw SQL returns snake_case)
      inboxId: r.inbox_id ?? null,
      scheduleId: r.schedule_id ?? null,
      confirmationEnabled: r.confirmation_enabled ?? false,
      scheduledAt: r.scheduled_at ?? null,
      startedAt: r.started_at ?? null,
      completedAt: r.completed_at ?? null,
      sentCount: parseInt(r.sent_count ?? '0', 10),
      deliveredCount: parseInt(r.delivered_count ?? '0', 10),
      openedCount: parseInt(r.opened_count ?? '0', 10),
      clickedCount: parseInt(r.clicked_count ?? '0', 10),
      tenantId: r.tenant_id,
      createdBy: r.created_by ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      contactCount: parseInt(r.contact_count, 10),
      listCount: parseInt(r.list_count, 10),
      targetLists: r.target_lists ?? [],
    }));
  }

  async findOne(id: string, tenantId: string) {
    const c = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Campaign not found');
    const [{ contact_count }] = await this.db.query(
      `SELECT COUNT(*) AS contact_count FROM campaign_contacts WHERE campaign_id = $1`, [id]);
    const lists = await this.getTargetLists(id, tenantId);
    return { ...c, contactCount: parseInt(contact_count, 10), targetLists: lists };
  }

  async create(dto: CreateCampaignDto, tenantId: string, userId?: string) {
    const campaign = this.campaignRepo.create({
      tenantId,
      name: dto.name,
      type: dto.type ?? 'whatsapp',
      subject: dto.subject,
      content: dto.content,
      messages: dto.messages ?? [],
      inboxId: dto.inboxId,
      botId: dto.botId,
      scheduleId: dto.scheduleId,
      confirmationEnabled: dto.confirmationEnabled ?? false,
      queueId: dto.queueId || undefined,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      status: dto.scheduledAt ? 'scheduled' : 'draft',
      createdBy: userId,
    });
    return this.campaignRepo.save(campaign);
  }

  async update(id: string, dto: UpdateCampaignDto, tenantId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.type !== undefined) campaign.type = dto.type;
    if (dto.status !== undefined) campaign.status = dto.status;
    if (dto.subject !== undefined) campaign.subject = dto.subject;
    if (dto.content !== undefined) campaign.content = dto.content;
    if (dto.messages !== undefined) campaign.messages = dto.messages;
    if (dto.inboxId !== undefined) campaign.inboxId = dto.inboxId;
    if (dto.botId !== undefined) campaign.botId = dto.botId || undefined;
    if (dto.scheduleId !== undefined) campaign.scheduleId = dto.scheduleId || undefined;
    if (dto.confirmationEnabled !== undefined) campaign.confirmationEnabled = dto.confirmationEnabled;
    if (dto.queueId !== undefined) campaign.queueId = dto.queueId || undefined;
    if (dto.scheduledAt !== undefined) campaign.scheduledAt = new Date(dto.scheduledAt);

    return this.campaignRepo.save(campaign);
  }

  async remove(id: string, tenantId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    await this.campaignRepo.remove(campaign);
  }

  // ── Target Lists (many-to-many: campaign → contact_lists) ─────────────────────

  async getTargetLists(campaignId: string, tenantId: string) {
    return this.db.query(
      `SELECT cl.id, cl.name, cl.description,
              COUNT(clc.contact_id) AS contact_count
       FROM campaign_targets ct
       JOIN contact_lists cl ON cl.id = ct.contact_list_id
       LEFT JOIN contact_list_contacts clc ON clc.list_id = cl.id
       WHERE ct.campaign_id = $1 AND cl.tenant_id = $2
       GROUP BY cl.id`,
      [campaignId, tenantId],
    );
  }

  async addTargetList(campaignId: string, listId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId);
    await this.db.query(
      `INSERT INTO campaign_targets (campaign_id, contact_list_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [campaignId, listId],
    );
    return { ok: true };
  }

  async removeTargetList(campaignId: string, listId: string, tenantId: string) {
    await this.db.query(
      `DELETE FROM campaign_targets WHERE campaign_id = $1 AND contact_list_id = $2`,
      [campaignId, listId],
    );
    return { ok: true };
  }

  // ── Individual Recipients (campaign_contacts) ─────────────────────────────────

  async getRecipients(campaignId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId);
    return this.db.query(
      `SELECT cc.id, cc.contact_id, cc.status, cc.sent_at,
              ct.full_name, ct.email, ct.phone
       FROM campaign_contacts cc
       LEFT JOIN contacts ct ON ct.id = cc.contact_id
       WHERE cc.campaign_id = $1
       ORDER BY ct.full_name`,
      [campaignId],
    );
  }

  // Resolve full recipient list: union of individual contacts + all contacts in target lists
  async resolveAllRecipients(campaignId: string, tenantId: string) {
    return this.db.query(
      `SELECT DISTINCT ct.id, ct.full_name, ct.email, ct.phone, 'list' AS source
       FROM campaign_targets tgt
       JOIN contact_list_contacts clc ON clc.list_id = tgt.contact_list_id
       JOIN contacts ct ON ct.id = clc.contact_id
       WHERE tgt.campaign_id = $1 AND ct.tenant_id = $2
       UNION
       SELECT DISTINCT ct.id, ct.full_name, ct.email, ct.phone, 'individual' AS source
       FROM campaign_contacts cc
       JOIN contacts ct ON ct.id = cc.contact_id
       WHERE cc.campaign_id = $1 AND ct.tenant_id = $2
       ORDER BY full_name`,
      [campaignId, tenantId],
    );
  }

  async addRecipients(campaignId: string, dto: AddContactsDto, tenantId: string) {
    await this.findOne(campaignId, tenantId);
    if (!dto.contactIds.length) return { added: 0 };
    const values = dto.contactIds.map((_, i) => `($1, $${i + 2})`).join(',');
    await this.db.query(
      `INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ${values}
       ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
      [campaignId, ...dto.contactIds],
    );
    return { added: dto.contactIds.length };
  }

  async addRecipientsByFilter(campaignId: string, dto: AddContactsByFilterDto, tenantId: string) {
    await this.findOne(campaignId, tenantId);

    let contactIds: string[] = dto.contactIds ?? [];
    if (!contactIds.length) {
      const contacts = await this.searchAvailableContacts(campaignId, tenantId, dto.search, dto.tagIds);
      contactIds = contacts.map((c: any) => c.id);
    }
    if (!contactIds.length) return { added: 0 };

    const values = contactIds.map((_, i) => `($1, $${i + 2})`).join(',');
    await this.db.query(
      `INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ${values}
       ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
      [campaignId, ...contactIds],
    );
    return { added: contactIds.length };
  }

  async removeRecipient(campaignId: string, contactId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId);
    await this.contactRepo.delete({ campaignId, contactId });
    return { ok: true };
  }

  async clearRecipients(campaignId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId);
    await this.contactRepo.delete({ campaignId });
    return { ok: true };
  }

  // Search contacts not yet added as individual recipients
  async searchAvailableContacts(campaignId: string, tenantId: string, search?: string, tagIds?: string[]) {
    let sql = `
      SELECT ct.id, ct.full_name, ct.email, ct.phone,
             COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
               FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
      FROM contacts ct
      LEFT JOIN contact_tags ctg ON ctg.contact_id = ct.id
      LEFT JOIN tags t ON t.id = ctg.tag_id
      WHERE ct.tenant_id = $1
        AND ct.id NOT IN (SELECT contact_id FROM campaign_contacts WHERE campaign_id = $2)
    `;
    const params: any[] = [tenantId, campaignId];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(ct.full_name) LIKE $${params.length} OR LOWER(ct.email) LIKE $${params.length} OR ct.phone LIKE $${params.length})`;
    }
    if (tagIds?.length) {
      params.push(tagIds);
      sql += ` AND ct.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = ANY($${params.length}::uuid[]))`;
    }
    sql += ` GROUP BY ct.id ORDER BY ct.full_name LIMIT 200`;
    return this.db.query(sql, params);
  }

  // ── Status transitions ────────────────────────────────────────────────────────

  async launch(id: string, tenantId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status))
      throw new BadRequestException(`Cannot launch in status "${campaign.status}"`);
    campaign.status = 'running';
    campaign.startedAt = new Date();
    return this.campaignRepo.save(campaign);
  }

  async pause(id: string, tenantId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'running') throw new BadRequestException('Campaign is not running');
    campaign.status = 'paused';
    return this.campaignRepo.save(campaign);
  }
}
