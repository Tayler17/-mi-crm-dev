import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { createHmac } from 'crypto';

// Events fired by the platform that we can forward
const SUPPORTED_EVENTS = [
  'message_created',
  'note_created',
  'conversation_created',
  'conversation_resolved',
  'conversation_assigned',
  'contact_created',
  'contact_updated',
  'deal_created',
  'deal_updated',
  'deal_stage_changed',
  'csat_submitted',
] as const;

export type OutboundEvent = typeof SUPPORTED_EVENTS[number];

@Injectable()
export class OutboundWebhooksService {
  private readonly logger = new Logger(OutboundWebhooksService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  getAll(tenantId: string) {
    return this.db.query(
      `SELECT id, name, url, secret, events, is_active, last_fired_at, created_at
       FROM outbound_webhooks WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async create(tenantId: string, dto: { name: string; url: string; secret?: string; events?: string[] }) {
    const events = dto.events?.length ? dto.events.filter((e) => SUPPORTED_EVENTS.includes(e as OutboundEvent)) : [...SUPPORTED_EVENTS];
    const [row] = await this.db.query(
      `INSERT INTO outbound_webhooks (tenant_id, name, url, secret, events)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, dto.name, dto.url, dto.secret ?? null, events],
    );
    return row;
  }

  async update(id: string, tenantId: string, dto: Partial<{ name: string; url: string; secret: string; events: string[]; isActive: boolean }>) {
    const sets: string[] = ['updated_at=NOW()'];
    const vals: any[] = [];
    let i = 1;
    if (dto.name    !== undefined) { sets.push(`name=$${++i}`);      vals.push(dto.name); }
    if (dto.url     !== undefined) { sets.push(`url=$${++i}`);       vals.push(dto.url); }
    if (dto.secret  !== undefined) { sets.push(`secret=$${++i}`);    vals.push(dto.secret || null); }
    if (dto.isActive !== undefined) { sets.push(`is_active=$${++i}`); vals.push(dto.isActive); }
    if (dto.events  !== undefined) {
      const filtered = dto.events.filter((e) => SUPPORTED_EVENTS.includes(e as OutboundEvent));
      sets.push(`events=$${++i}`); vals.push(filtered);
    }
    const [row] = await this.db.query(
      `UPDATE outbound_webhooks SET ${sets.join(',')} WHERE id=$1 AND tenant_id=${i + 1} RETURNING *`,
      [id, ...vals, tenantId],
    );
    return row ?? null;
  }

  async delete(id: string, tenantId: string) {
    await this.db.query(`DELETE FROM outbound_webhooks WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    return { ok: true };
  }

  // ── Delivery ──────────────────────────────────────────────────────────────

  async fire(tenantId: string, event: string, payload: any) {
    const hooks = await this.db.query(
      `SELECT id, url, secret FROM outbound_webhooks
       WHERE tenant_id=$1 AND is_active=true AND $2=ANY(events)`,
      [tenantId, event],
    );
    for (const hook of hooks) {
      this.deliver(hook, event, payload).catch(() => {});
    }
  }

  // ── Enriched domain events ──────────────────────────────────────────────────
  // Deal stage changes are emitted on EventEmitter2 (deals.service + public API) with
  // only IDs. Enrich here with the full deal + contact + custom fields + stage names,
  // then fire the webhook so the tenant's external system gets everything it needs.
  @OnEvent('deal.stage_changed')
  async onDealStageChanged(p: any) {
    const tenantId = p?.tenantId;
    const dealId = p?.entityId ?? p?.dealId;
    if (!tenantId || !dealId) return;
    const [deal] = await this.db.query(
      `SELECT d.id, d.title, d.value, d.currency, d.status, d.stage_id, d.contact_id,
              ps.name AS stage, ct.full_name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email
       FROM deals d
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       LEFT JOIN contacts ct ON ct.id = d.contact_id
       WHERE d.id=$1 AND d.tenant_id=$2`,
      [dealId, tenantId],
    ).catch(() => []);
    if (!deal) return;
    let oldStage: string | null = null;
    if (p.oldStageId) {
      const [os] = await this.db.query(`SELECT name FROM pipeline_stages WHERE id=$1`, [p.oldStageId]).catch(() => []);
      oldStage = os?.name ?? null;
    }
    const cfRows = await this.db.query(
      `SELECT d.name, v.value FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.definition_id
       WHERE v.tenant_id=$1 AND v.entity_type='deal' AND v.entity_id=$2`,
      [tenantId, dealId],
    ).catch(() => []);
    const custom_fields: Record<string, any> = {};
    for (const r of cfRows) custom_fields[r.name] = r.value;
    const payload = {
      deal: {
        id: deal.id, title: deal.title, value: deal.value, currency: deal.currency,
        status: deal.status, stage: deal.stage, old_stage: oldStage, custom_fields,
      },
      contact: deal.contact_id
        ? { id: deal.contact_id, full_name: deal.contact_name, phone: deal.contact_phone, email: deal.contact_email }
        : null,
    };
    await this.fire(tenantId, 'deal_stage_changed', payload);
  }

  private async deliver(hook: { id: string; url: string; secret: string | null }, event: string, payload: any) {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-CRM-Event': event };
    if (hook.secret) {
      const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
      headers['X-CRM-Signature'] = `sha256=${sig}`;
    }
    const start = Date.now();
    try {
      const res = await (globalThis as any).fetch(hook.url, {
        method: 'POST', headers, body,
        signal: AbortSignal.timeout(10_000),
      });
      const duration = Date.now() - start;
      await Promise.all([
        this.db.query(
          `UPDATE outbound_webhooks SET last_fired_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [hook.id],
        ),
        this.db.query(
          `INSERT INTO outbound_webhook_logs (webhook_id, event, status, status_code, duration_ms)
           VALUES ($1,$2,$3,$4,$5)`,
          [hook.id, event, res.ok ? 'success' : 'error', res.status, duration],
        ),
      ]);
      this.logger.log(`[outbound-webhook] ${event} → ${hook.url} [${res.status}] ${duration}ms`);
    } catch (err: any) {
      const duration = Date.now() - start;
      await this.db.query(
        `INSERT INTO outbound_webhook_logs (webhook_id, event, status, error_message, duration_ms)
         VALUES ($1,$2,'error',$3,$4)`,
        [hook.id, event, err.message?.slice(0, 500) ?? 'Unknown error', duration],
      ).catch(() => {});
      this.logger.warn(`[outbound-webhook] ${event} → ${hook.url} FAILED: ${err.message}`);
    }
  }

  getLogs(webhookId: string, tenantId: string, limit = 50) {
    return this.db.query(
      `SELECT l.id, l.event, l.status, l.status_code, l.error_message, l.duration_ms, l.created_at
       FROM outbound_webhook_logs l
       JOIN outbound_webhooks w ON w.id = l.webhook_id
       WHERE l.webhook_id=$1 AND w.tenant_id=$2
       ORDER BY l.created_at DESC
       LIMIT $3`,
      [webhookId, tenantId, limit],
    );
  }

  readonly SUPPORTED_EVENTS = SUPPORTED_EVENTS;
}
