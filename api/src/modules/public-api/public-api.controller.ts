import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiKeyGuard, ApiTenantId } from './api-key.guard';

/**
 * Public REST API v1 — authed by an API key (see ApiKeyGuard). Everything is
 * scoped to the key's tenant. Mirrors the CRM's core objects so a tenant's
 * external system can read/write contacts, deals, and read pipelines/custom fields.
 */
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  // ── Custom-field helpers ────────────────────────────────────────────────────

  private async getCustomFields(tenantId: string, entityType: string, entityId: string) {
    const rows = await this.db.query(
      `SELECT d.name, d.label, v.value
       FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.definition_id
       WHERE v.tenant_id=$1 AND v.entity_type=$2 AND v.entity_id=$3`,
      [tenantId, entityType, entityId],
    );
    const out: Record<string, any> = {};
    for (const r of rows) out[r.name] = r.value;
    return out;
  }

  private async upsertCustomFields(tenantId: string, entityType: string, entityId: string, customFields: any) {
    if (!customFields || typeof customFields !== 'object') return;
    const defs = await this.db.query(
      `SELECT id, name FROM custom_field_definitions WHERE tenant_id=$1 AND entity_type=$2`,
      [tenantId, entityType],
    );
    const byName = new Map<string, string>(defs.map((d: any) => [String(d.name).toLowerCase(), d.id]));
    for (const [k, val] of Object.entries(customFields)) {
      const defId = byName.get(String(k).toLowerCase());
      if (!defId) continue;
      await this.db.query(
        `INSERT INTO custom_field_values (tenant_id, definition_id, entity_id, entity_type, value, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT (definition_id, entity_id) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
        [tenantId, defId, entityId, entityType, val == null ? null : String(val)],
      ).catch(() => {});
    }
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  @Get('contacts')
  async listContacts(
    @ApiTenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
    const params: any[] = [tenantId];
    let where = 'tenant_id=$1';
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }
    const [{ total }] = await this.db.query(`SELECT COUNT(*)::int AS total FROM contacts WHERE ${where}`, params);
    const rows = await this.db.query(
      `SELECT id, full_name, phone, email, job_title, notes, created_at, updated_at
       FROM contacts WHERE ${where} ORDER BY updated_at DESC LIMIT ${lim} OFFSET ${off}`,
      params,
    );
    return { total, page: parseInt(page, 10) || 1, limit: lim, data: rows };
  }

  @Get('contacts/:id')
  async getContact(@ApiTenantId() tenantId: string, @Param('id') id: string) {
    const [c] = await this.db.query(
      `SELECT id, full_name, phone, email, job_title, notes, company_id, created_at, updated_at
       FROM contacts WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    if (!c) return { error: 'not_found' };
    c.custom_fields = await this.getCustomFields(tenantId, 'contact', id);
    return c;
  }

  @Post('contacts')
  async createContact(@ApiTenantId() tenantId: string, @Body() dto: any) {
    const name = String(dto?.full_name ?? '').trim();
    if (!name) return { error: 'full_name_required' };
    const [row] = await this.db.query(
      `INSERT INTO contacts (tenant_id, full_name, phone, email, job_title, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id, full_name, phone, email, job_title, notes`,
      [tenantId, name, dto.phone ?? null, dto.email ?? null, dto.job_title ?? null, dto.notes ?? null],
    );
    await this.upsertCustomFields(tenantId, 'contact', row.id, dto.custom_fields);
    return this.getContact(tenantId, row.id);
  }

  @Patch('contacts/:id')
  async updateContact(@ApiTenantId() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    const sets: string[] = []; const params: any[] = [];
    for (const [k, col] of Object.entries({ full_name: 'full_name', phone: 'phone', email: 'email', job_title: 'job_title', notes: 'notes' })) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (sets.length) {
      params.push(id, tenantId);
      const r = await this.db.query(`UPDATE contacts SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length - 1} AND tenant_id=$${params.length} RETURNING id`, params);
      if (!r.length) return { error: 'not_found' };
    } else {
      const [c] = await this.db.query(`SELECT id FROM contacts WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
      if (!c) return { error: 'not_found' };
    }
    await this.upsertCustomFields(tenantId, 'contact', id, dto.custom_fields);
    return this.getContact(tenantId, id);
  }

  // ── Deals ───────────────────────────────────────────────────────────────────

  @Get('deals')
  async listDeals(
    @ApiTenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('contact_id') contactId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
    const params: any[] = [tenantId];
    let where = 'd.tenant_id=$1';
    if (status && status.trim()) { params.push(status.trim()); where += ` AND d.status=$${params.length}`; }
    if (contactId && contactId.trim()) { params.push(contactId.trim()); where += ` AND d.contact_id=$${params.length}`; }
    const [{ total }] = await this.db.query(`SELECT COUNT(*)::int AS total FROM deals d WHERE ${where}`, params);
    const rows = await this.db.query(
      `SELECT d.id, d.title, d.value, d.currency, d.status, d.contact_id, d.stage_id,
              ps.name AS stage, d.created_at, d.updated_at
       FROM deals d LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       WHERE ${where} ORDER BY d.updated_at DESC LIMIT ${lim} OFFSET ${off}`,
      params,
    );
    return { total, page: parseInt(page, 10) || 1, limit: lim, data: rows };
  }

  @Get('deals/:id')
  async getDeal(@ApiTenantId() tenantId: string, @Param('id') id: string) {
    const [d] = await this.db.query(
      `SELECT d.id, d.title, d.value, d.currency, d.status, d.notes, d.contact_id, d.stage_id,
              ps.name AS stage, ct.full_name AS contact_name, d.created_at, d.updated_at
       FROM deals d
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       LEFT JOIN contacts ct ON ct.id = d.contact_id
       WHERE d.id=$1 AND d.tenant_id=$2`,
      [id, tenantId],
    );
    if (!d) return { error: 'not_found' };
    d.custom_fields = await this.getCustomFields(tenantId, 'deal', id);
    return d;
  }

  @Post('deals')
  async createDeal(@ApiTenantId() tenantId: string, @Body() dto: any) {
    const title = String(dto?.title ?? '').trim();
    if (!title) return { error: 'title_required' };
    let stageId = dto.stage_id ?? null;
    if (!stageId && String(dto.stage ?? '').trim()) {
      const [s] = await this.db.query(
        `SELECT ps.id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id WHERE p.tenant_id=$1 AND ps.name ILIKE $2 LIMIT 1`,
        [tenantId, String(dto.stage).trim()],
      );
      stageId = s?.id ?? null;
    }
    const [row] = await this.db.query(
      `INSERT INTO deals (tenant_id, contact_id, title, value, currency, stage_id, notes, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'open'),NOW(),NOW()) RETURNING id`,
      [tenantId, dto.contact_id ?? null, title, dto.value ?? 0, dto.currency ?? 'USD', stageId, dto.notes ?? null, dto.status ?? null],
    );
    await this.upsertCustomFields(tenantId, 'deal', row.id, dto.custom_fields);
    this.events.emit('deal.created', { tenantId, entityId: row.id, dealId: row.id });
    return this.getDeal(tenantId, row.id);
  }

  @Patch('deals/:id')
  async updateDeal(@ApiTenantId() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    const sets: string[] = []; const params: any[] = [];
    for (const [k, col] of Object.entries({ title: 'title', value: 'value', currency: 'currency', notes: 'notes', status: 'status' })) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (sets.length) {
      params.push(id, tenantId);
      const r = await this.db.query(`UPDATE deals SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length - 1} AND tenant_id=$${params.length} RETURNING id`, params);
      if (!r.length) return { error: 'not_found' };
    } else {
      const [d] = await this.db.query(`SELECT id FROM deals WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
      if (!d) return { error: 'not_found' };
    }
    await this.upsertCustomFields(tenantId, 'deal', id, dto.custom_fields);
    return this.getDeal(tenantId, id);
  }

  /** Move a deal to another stage (by stage_id or stage name). Fires deal.stage_changed. */
  @Post('deals/:id/move')
  async moveDeal(@ApiTenantId() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    const [deal] = await this.db.query(`SELECT stage_id FROM deals WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!deal) return { error: 'not_found' };
    let stageId = dto.stage_id ?? null;
    if (!stageId && String(dto.stage ?? '').trim()) {
      const [s] = await this.db.query(
        `SELECT ps.id FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id WHERE p.tenant_id=$1 AND ps.name ILIKE $2 LIMIT 1`,
        [tenantId, String(dto.stage).trim()],
      );
      stageId = s?.id ?? null;
    }
    if (!stageId) return { error: 'stage_required' };
    await this.db.query(`UPDATE deals SET stage_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, [stageId, id, tenantId]);
    this.events.emit('deal.stage_changed', { tenantId, entityId: id, dealId: id, oldStageId: deal.stage_id, newStageId: stageId });
    return this.getDeal(tenantId, id);
  }

  // ── Pipelines / stages (read) ────────────────────────────────────────────────

  @Get('pipelines')
  async listPipelines(@ApiTenantId() tenantId: string) {
    const pipelines = await this.db.query(`SELECT id, name, is_default FROM pipelines WHERE tenant_id=$1 ORDER BY created_at`, [tenantId]);
    const stages = await this.db.query(
      `SELECT ps.id, ps.name, ps.position, ps.pipeline_id
       FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE p.tenant_id=$1 ORDER BY ps.position`,
      [tenantId],
    );
    return pipelines.map((p: any) => ({ ...p, stages: stages.filter((s: any) => s.pipeline_id === p.id) }));
  }

  @Get('stages')
  async listStages(@ApiTenantId() tenantId: string) {
    return this.db.query(
      `SELECT ps.id, ps.name, ps.position, ps.pipeline_id
       FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE p.tenant_id=$1 ORDER BY ps.position`,
      [tenantId],
    );
  }

  // ── Custom field definitions (read) ──────────────────────────────────────────

  @Get('custom-fields')
  async listCustomFields(@ApiTenantId() tenantId: string, @Query('entity_type') entityType?: string) {
    const params: any[] = [tenantId];
    let where = 'tenant_id=$1';
    if (entityType && entityType.trim()) { params.push(entityType.trim()); where += ` AND entity_type=$${params.length}`; }
    return this.db.query(
      `SELECT id, entity_type, name, label, field_type, options, is_required, position
       FROM custom_field_definitions WHERE ${where} ORDER BY entity_type, position`,
      params,
    );
  }

  // ── Invoices (external mirror) ───────────────────────────────────────────────
  // An invoice CREATED and OWNED by the tenant's external system (e.g. tscouriers),
  // pushed here so it lives in the CRM linked to a contact and the bots can chase
  // payment. Read-only in the CRM: no Stripe, no PDF generation — the source system
  // owns collection. Idempotent per (tenant, source, external_id).

  private toMinor(amount: any, amountMinor: any): number {
    if (amountMinor !== undefined && amountMinor !== null && amountMinor !== '') {
      const n = Number(String(amountMinor).replace(/[^0-9-]/g, ''));
      return Number.isFinite(n) ? Math.round(n) : 0;
    }
    if (amount === undefined || amount === null || amount === '') return 0;
    const n = Number(String(amount).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  private mapInvoiceStatus(s: any): string {
    const v = String(s ?? '').trim().toLowerCase();
    if (['paid', 'pagada', 'pagado', 'complete', 'completed'].includes(v)) return 'paid';
    if (['void', 'voided', 'cancelled', 'canceled', 'anulada', 'anulado'].includes(v)) return 'void';
    if (['partially_paid', 'partial'].includes(v)) return 'partially_paid';
    return 'issued'; // pending / unpaid / sent / open / '' → emitted (what the bots chase)
  }

  private async findOrCreateContact(tenantId: string, c: { name?: string; phone?: string; email?: string }): Promise<string | null> {
    const name = String(c?.name ?? '').trim();
    const phone = String(c?.phone ?? '').trim();
    const email = String(c?.email ?? '').trim();
    const tries: Array<[string, string]> = [];
    if (phone) tries.push(['phone', phone]);
    if (email) tries.push(['email', email]);
    if (name) tries.push(['full_name', name]);
    for (const [col, val] of tries) {
      const [hit] = await this.db.query(
        `SELECT id FROM contacts WHERE tenant_id=$1 AND ${col} ILIKE $2 ORDER BY updated_at DESC LIMIT 1`,
        [tenantId, val],
      );
      if (hit) return hit.id as string;
    }
    if (!name && !phone && !email) return null;
    const [row] = await this.db.query(
      `INSERT INTO contacts (tenant_id, full_name, phone, email, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id`,
      [tenantId, name || phone || email || 'Cliente', phone || null, email || null],
    );
    return row.id as string;
  }

  private async getInvoiceRow(tenantId: string, id: string, action: string) {
    const [invoice] = await this.db.query(
      `SELECT i.id, i.number, i.external_id, i.source, i.financial_status, i.currency,
              i.total_minor, i.amount_paid_minor, i.due_date, i.contact_id, ct.full_name AS contact_name,
              i.external_url, i.created_at, i.updated_at
       FROM invoices i LEFT JOIN contacts ct ON ct.id = i.contact_id
       WHERE i.id=$1 AND i.tenant_id=$2`,
      [id, tenantId],
    );
    return { action, invoice };
  }

  @Post('invoices')
  async upsertInvoice(@ApiTenantId() tenantId: string, @Body() dto: any) {
    const externalId = String(dto?.external_id ?? dto?.id ?? '').trim();
    if (!externalId) return { error: 'external_id_required' };
    const source = (String(dto?.source ?? 'external').trim() || 'external').slice(0, 40);

    const client = dto?.client && typeof dto.client === 'object' ? dto.client : {
      name: dto?.client_name ?? (typeof dto?.client === 'string' ? dto.client : undefined) ?? dto?.customer,
      phone: dto?.client_phone ?? dto?.phone,
      email: dto?.client_email ?? dto?.email,
    };
    const contactId = await this.findOrCreateContact(tenantId, client);

    const currency = (String(dto?.currency ?? 'GBP').trim().toUpperCase().slice(0, 3)) || 'GBP';
    const totalMinor = this.toMinor(dto?.amount ?? dto?.total, dto?.amount_minor ?? dto?.total_minor);
    const status = this.mapInvoiceStatus(dto?.status);
    const paidMinor = status === 'paid' ? totalMinor : this.toMinor(dto?.amount_paid, dto?.amount_paid_minor);
    const number = (String(dto?.number ?? externalId).trim()) || externalId;
    const dueDate = dto?.due_date ? String(dto.due_date) : null;
    const externalUrl = (String(dto?.pdf_url ?? dto?.document_url ?? dto?.url ?? '').trim()) || null;
    const notes = (String(dto?.notes ?? dto?.reference ?? '').trim()) || null;
    const buyerJson = JSON.stringify({ name: client?.name ?? null, phone: client?.phone ?? null, email: client?.email ?? null, reference: dto?.reference ?? null });

    const [existing] = await this.db.query(
      `SELECT id FROM invoices WHERE tenant_id=$1 AND source=$2 AND external_id=$3 LIMIT 1`,
      [tenantId, source, externalId],
    );

    if (existing) {
      await this.db.query(
        `UPDATE invoices SET contact_id=COALESCE($4, contact_id), number=$5, currency=$6,
             subtotal_minor=$7, tax_minor=0, total_minor=$7, amount_paid_minor=$8,
             financial_status=$9, due_date=$10, external_url=COALESCE($11, external_url),
             notes=COALESCE($12, notes), buyer_snapshot=$13::jsonb,
             paid_at = CASE WHEN $9='paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             voided_at = CASE WHEN $9='void' THEN COALESCE(voided_at, NOW()) ELSE voided_at END,
             updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2 AND source=$3`,
        [existing.id, tenantId, source, contactId, number, currency, totalMinor, paidMinor, status, dueDate, externalUrl, notes, buyerJson],
      );
      return this.getInvoiceRow(tenantId, existing.id, 'updated');
    }

    const [row] = await this.db.query(
      `INSERT INTO invoices
         (tenant_id, contact_id, kind, number, financial_status, delivery_status, currency,
          subtotal_minor, tax_minor, total_minor, amount_paid_minor, due_date, notes,
          buyer_snapshot, external_url, source, external_id, issued_at, paid_at, voided_at, created_at, updated_at)
       VALUES ($1,$2,'invoice',$3,$4,'not_sent',$5,$6,0,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,NOW(),
               CASE WHEN $4='paid' THEN NOW() ELSE NULL END,
               CASE WHEN $4='void' THEN NOW() ELSE NULL END,
               NOW(),NOW())
       RETURNING id`,
      [tenantId, contactId, number, status, currency, totalMinor, paidMinor, dueDate, notes, buyerJson, externalUrl, source, externalId],
    );
    return this.getInvoiceRow(tenantId, row.id, 'created');
  }

  @Patch('invoices/:externalId')
  async updateInvoiceStatus(@ApiTenantId() tenantId: string, @Param('externalId') externalId: string, @Body() dto: any) {
    const source = (String(dto?.source ?? 'external').trim() || 'external').slice(0, 40);
    const [inv] = await this.db.query(
      `SELECT id, total_minor FROM invoices WHERE tenant_id=$1 AND source=$2 AND external_id=$3 LIMIT 1`,
      [tenantId, source, String(externalId)],
    );
    if (!inv) return { error: 'not_found' };
    const sets: string[] = []; const params: any[] = [inv.id, tenantId];
    if (dto?.status !== undefined) {
      const status = this.mapInvoiceStatus(dto.status);
      params.push(status); const si = params.length;
      sets.push(`financial_status=$${si}`);
      sets.push(`paid_at = CASE WHEN $${si}='paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END`);
      sets.push(`voided_at = CASE WHEN $${si}='void' THEN COALESCE(voided_at, NOW()) ELSE voided_at END`);
      if (status === 'paid') { params.push(Number(inv.total_minor)); sets.push(`amount_paid_minor=$${params.length}`); }
    }
    if (dto?.due_date !== undefined) { params.push(dto.due_date ? String(dto.due_date) : null); sets.push(`due_date=$${params.length}`); }
    if (!sets.length) return this.getInvoiceRow(tenantId, inv.id, 'unchanged');
    await this.db.query(`UPDATE invoices SET ${sets.join(',')}, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, params);
    return this.getInvoiceRow(tenantId, inv.id, 'updated');
  }

  @Get('invoices')
  async listInvoices(@ApiTenantId() tenantId: string, @Query('source') source?: string, @Query('page') page = '1', @Query('limit') limit = '50') {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
    const params: any[] = [tenantId];
    let where = 'i.tenant_id=$1 AND i.external_id IS NOT NULL';
    if (source && source.trim()) { params.push(source.trim()); where += ` AND i.source=$${params.length}`; }
    const [{ total }] = await this.db.query(`SELECT COUNT(*)::int AS total FROM invoices i WHERE ${where}`, params);
    const rows = await this.db.query(
      `SELECT i.id, i.number, i.external_id, i.source, i.financial_status, i.currency,
              i.total_minor, i.amount_paid_minor, i.due_date, i.contact_id, ct.full_name AS contact_name,
              i.created_at, i.updated_at
       FROM invoices i LEFT JOIN contacts ct ON ct.id = i.contact_id
       WHERE ${where} ORDER BY i.created_at DESC LIMIT ${lim} OFFSET ${off}`,
      params,
    );
    return { total, page: parseInt(page, 10) || 1, limit: lim, data: rows };
  }
}
