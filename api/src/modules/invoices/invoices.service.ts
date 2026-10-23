import { Injectable, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { buildInvoiceLines, formatInvoiceNumber, isInvoiceOverdue, RawInvoiceItem } from './invoice-calc';

/**
 * Invoices module.
 *   Etapa 0: per-tenant issuer settings (`tenant_invoice_settings`).
 *   Etapa 1: draft invoices CRUD (`invoices` + `invoice_items`) with server-side totals.
 *
 * Isolated by design: this does NOT touch `payment_links`, the Stripe subscription
 * webhook, or any existing billing flow. Every query is scoped by `tenant_id`.
 */
@Injectable()
export class InvoicesService implements OnModuleInit {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS tenant_invoice_settings (
        tenant_id        uuid PRIMARY KEY,
        business_name    text,
        address          text,
        tax_id           text,
        email            text,
        phone            text,
        logo_url         text,
        number_prefix    text    NOT NULL DEFAULT 'INV',
        cn_prefix        text    NOT NULL DEFAULT 'CN',
        default_currency text    NOT NULL DEFAULT 'GBP',
        default_tax_rate numeric NOT NULL DEFAULT 0,
        footer_terms     text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => console.error(`[invoices] settings init: ${e.message}`));

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         uuid NOT NULL,
        contact_id        uuid,
        deal_id           uuid,
        kind              text    NOT NULL DEFAULT 'invoice',
        number            text,
        number_seq        integer,
        financial_status  text    NOT NULL DEFAULT 'draft',
        delivery_status   text    NOT NULL DEFAULT 'not_sent',
        currency          text    NOT NULL DEFAULT 'GBP',
        default_tax_rate  numeric NOT NULL DEFAULT 0,
        subtotal_minor    bigint  NOT NULL DEFAULT 0,
        tax_minor         bigint  NOT NULL DEFAULT 0,
        total_minor       bigint  NOT NULL DEFAULT 0,
        amount_paid_minor bigint  NOT NULL DEFAULT 0,
        due_date          date,
        notes             text,
        terms             text,
        issuer_snapshot   jsonb,
        buyer_snapshot    jsonb,
        issued_at         timestamptz,
        sent_at           timestamptz,
        paid_at           timestamptz,
        voided_at         timestamptz,
        created_by        uuid,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => console.error(`[invoices] invoices init: ${e.message}`));

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id          uuid NOT NULL,
        description         text,
        quantity            numeric NOT NULL DEFAULT 1,
        unit_price_minor    bigint  NOT NULL DEFAULT 0,
        discount_minor      bigint  NOT NULL DEFAULT 0,
        tax_rate            numeric,
        line_subtotal_minor bigint  NOT NULL DEFAULT 0,
        line_tax_minor      bigint  NOT NULL DEFAULT 0,
        line_total_minor    bigint  NOT NULL DEFAULT 0,
        sort_order          integer NOT NULL DEFAULT 0
      )
    `).catch((e: any) => console.error(`[invoices] invoice_items init: ${e.message}`));

    await this.db.query(`CREATE INDEX IF NOT EXISTS invoices_tenant_idx ON invoices(tenant_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id)`).catch(() => {});
  }

  // ── Issuer settings (Etapa 0) ───────────────────────────────────────────────
  async getSettings(tenantId: string) {
    const [row] = await this.db.query(`SELECT * FROM tenant_invoice_settings WHERE tenant_id=$1`, [tenantId]);
    if (row) return { ...row, configured: !!row.business_name };
    return {
      tenant_id: tenantId, business_name: null, address: null, tax_id: null,
      email: null, phone: null, logo_url: null, number_prefix: 'INV', cn_prefix: 'CN',
      default_currency: 'GBP', default_tax_rate: 0, footer_terms: null, configured: false,
    };
  }

  async updateSettings(tenantId: string, dto: Record<string, any>) {
    await this.db.query(
      `INSERT INTO tenant_invoice_settings
         (tenant_id, business_name, address, tax_id, email, phone, logo_url,
          number_prefix, cn_prefix, default_currency, default_tax_rate, footer_terms, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'INV'),COALESCE($9,'CN'),COALESCE($10,'GBP'),COALESCE($11,0),$12,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         business_name=$2, address=$3, tax_id=$4, email=$5, phone=$6, logo_url=$7,
         number_prefix=COALESCE($8,'INV'), cn_prefix=COALESCE($9,'CN'),
         default_currency=COALESCE($10,'GBP'), default_tax_rate=COALESCE($11,0),
         footer_terms=$12, updated_at=NOW()`,
      [
        tenantId, dto.business_name ?? null, dto.address ?? null, dto.tax_id ?? null,
        dto.email ?? null, dto.phone ?? null, dto.logo_url ?? null,
        dto.number_prefix ?? null, dto.cn_prefix ?? null, dto.default_currency ?? null,
        dto.default_tax_rate ?? null, dto.footer_terms ?? null,
      ],
    );
    return this.getSettings(tenantId);
  }

  // ── Draft invoices (Etapa 1) ────────────────────────────────────────────────
  /** Financial / delivery / overdue are three INDEPENDENT dimensions (Etapa 3).
   *  Overdue is derived (never stored) so it can't drift from the financial status. */
  async list(
    tenantId: string,
    filters: { status?: string; overdue?: boolean; q?: string } = {},
    limit = 200,
  ) {
    const where: string[] = ['i.tenant_id = $1'];
    const params: any[] = [tenantId];
    if (filters.status) { params.push(filters.status); where.push(`i.financial_status = $${params.length}`); }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      where.push(`(i.number ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`);
    }
    params.push(limit);
    const rows = await this.db.query(
      `SELECT i.id, i.number, i.kind, i.financial_status, i.delivery_status, i.currency,
              i.total_minor, i.amount_paid_minor, (i.total_minor - i.amount_paid_minor) AS balance_minor,
              i.due_date, i.created_at, i.contact_id, c.full_name AS contact_name
         FROM invoices i
         LEFT JOIN contacts c ON c.id = i.contact_id
        WHERE ${where.join(' AND ')}
        ORDER BY i.created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    const withOverdue = rows.map((r: any) => ({ ...r, overdue: isInvoiceOverdue(r) }));
    return filters.overdue ? withOverdue.filter((r: any) => r.overdue) : withOverdue;
  }

  async getOne(tenantId: string, id: string) {
    const [inv] = await this.db.query(
      `SELECT i.*, c.full_name AS contact_name, d.title AS deal_title
         FROM invoices i
         LEFT JOIN contacts c ON c.id = i.contact_id
         LEFT JOIN deals d    ON d.id = i.deal_id
        WHERE i.id = $1 AND i.tenant_id = $2`,
      [id, tenantId],
    );
    if (!inv) return null;
    const items = await this.db.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order ASC`, [id],
    );
    return {
      ...inv,
      balance_minor: Number(inv.total_minor) - Number(inv.amount_paid_minor),
      overdue: isInvoiceOverdue(inv),
      items,
    };
  }

  async createDraft(tenantId: string, userId: string | null, dto: any) {
    const settings = await this.getSettings(tenantId);
    const currency = String(dto.currency || settings.default_currency || 'GBP').toUpperCase();
    const defaultTaxRate = Number(dto.default_tax_rate ?? settings.default_tax_rate ?? 0) || 0;
    const { items, totals } = buildInvoiceLines((dto.items ?? []) as RawInvoiceItem[], defaultTaxRate);

    const invId: string = await this.db.transaction(async (m) => {
      const rows = await m.query(
        `INSERT INTO invoices
           (tenant_id, contact_id, deal_id, kind, currency, default_tax_rate,
            subtotal_minor, tax_minor, total_minor, due_date, notes, terms, created_by)
         VALUES ($1,$2,$3,'invoice',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, dto.contact_id ?? null, dto.deal_id ?? null, currency, defaultTaxRate,
         totals.subtotalMinor, totals.taxMinor, totals.totalMinor,
         dto.due_date || null, dto.notes ?? null, dto.terms ?? null, userId],
      );
      const id = rows[0].id;
      for (const it of items) {
        await m.query(
          `INSERT INTO invoice_items
             (invoice_id, description, quantity, unit_price_minor, discount_minor, tax_rate,
              line_subtotal_minor, line_tax_minor, line_total_minor, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, it.description, it.quantity, it.unit_price_minor, it.discount_minor, it.tax_rate,
           it.line_subtotal_minor, it.line_tax_minor, it.line_total_minor, it.sort_order],
        );
      }
      return id;
    });
    return this.getOne(tenantId, invId);
  }

  async updateDraft(tenantId: string, id: string, dto: any) {
    const inv = await this.getOne(tenantId, id); // tenant-scoped → also the isolation guard
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (inv.financial_status !== 'draft') throw new BadRequestException('Solo se pueden editar borradores');

    const currency = String(dto.currency || inv.currency).toUpperCase();
    const defaultTaxRate = Number(dto.default_tax_rate ?? inv.default_tax_rate ?? 0) || 0;
    const { items, totals } = buildInvoiceLines((dto.items ?? []) as RawInvoiceItem[], defaultTaxRate);

    await this.db.transaction(async (m) => {
      await m.query(
        `UPDATE invoices SET contact_id=$3, deal_id=$4, currency=$5, default_tax_rate=$6,
                subtotal_minor=$7, tax_minor=$8, total_minor=$9, due_date=$10, notes=$11, terms=$12, updated_at=NOW()
          WHERE id=$1 AND tenant_id=$2`,
        [id, tenantId, dto.contact_id ?? inv.contact_id ?? null, dto.deal_id ?? inv.deal_id ?? null,
         currency, defaultTaxRate, totals.subtotalMinor, totals.taxMinor, totals.totalMinor,
         dto.due_date || null, dto.notes ?? null, dto.terms ?? null],
      );
      await m.query(`DELETE FROM invoice_items WHERE invoice_id=$1`, [id]);
      for (const it of items) {
        await m.query(
          `INSERT INTO invoice_items
             (invoice_id, description, quantity, unit_price_minor, discount_minor, tax_rate,
              line_subtotal_minor, line_tax_minor, line_total_minor, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, it.description, it.quantity, it.unit_price_minor, it.discount_minor, it.tax_rate,
           it.line_subtotal_minor, it.line_tax_minor, it.line_total_minor, it.sort_order],
        );
      }
    });
    return this.getOne(tenantId, id);
  }

  async deleteDraft(tenantId: string, id: string) {
    const inv = await this.getOne(tenantId, id);
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (inv.financial_status !== 'draft') throw new BadRequestException('Solo se pueden eliminar borradores');
    await this.db.transaction(async (m) => {
      await m.query(`DELETE FROM invoice_items WHERE invoice_id=$1`, [id]);
      await m.query(`DELETE FROM invoices WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    });
    return { deleted: true };
  }

  // ── Issue (Etapa 2): assign a gapless number, freeze data, make immutable ────
  async issueInvoice(tenantId: string, id: string) {
    const inv = await this.getOne(tenantId, id); // tenant-scoped guard
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (inv.financial_status !== 'draft') throw new BadRequestException('Solo se pueden emitir borradores');
    if (!inv.items || inv.items.length === 0) throw new BadRequestException('La factura no tiene líneas');

    const settings = await this.getSettings(tenantId);
    if (!settings.business_name) {
      throw new BadRequestException('Configura los datos del emisor en Ajustes → Facturación antes de emitir.');
    }

    // Buyer snapshot (frozen) from the contact, if any.
    let buyer: any = { contact_id: inv.contact_id ?? null, name: inv.contact_name ?? null };
    if (inv.contact_id) {
      const [c] = await this.db.query(
        `SELECT full_name, email, phone FROM contacts WHERE id=$1 AND tenant_id=$2`,
        [inv.contact_id, tenantId],
      ).catch(() => []);
      if (c) buyer = { contact_id: inv.contact_id, name: c.full_name, email: c.email, phone: c.phone };
    }
    const issuer = {
      business_name: settings.business_name, address: settings.address, tax_id: settings.tax_id,
      email: settings.email, phone: settings.phone, logo_url: settings.logo_url,
    };

    const kind = inv.kind || 'invoice';
    const prefix = settings.number_prefix || 'INV';
    const year = new Date().getFullYear();

    await this.db.transaction(async (m) => {
      // Serialize numbering per (tenant, kind, year) so concurrent issues never duplicate or
      // skip a number — same advisory-lock technique used for the conversations webhook.
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`issnum:${tenantId}:${kind}:${year}`]);
      const [row] = await m.query(
        `SELECT COALESCE(MAX(number_seq),0)::int AS max FROM invoices
          WHERE tenant_id=$1 AND kind=$2 AND number_seq IS NOT NULL
            AND EXTRACT(YEAR FROM issued_at)=$3`,
        [tenantId, kind, year],
      );
      const seq = Number(row?.max ?? 0) + 1;
      const number = formatInvoiceNumber(prefix, year, seq);
      await m.query(
        `UPDATE invoices
            SET financial_status='issued', number=$3, number_seq=$4, issued_at=NOW(),
                issuer_snapshot=$5, buyer_snapshot=$6, updated_at=NOW()
          WHERE id=$1 AND tenant_id=$2 AND financial_status='draft'`,
        [id, tenantId, number, seq, JSON.stringify(issuer), JSON.stringify(buyer)],
      );
    });
    return this.getOne(tenantId, id);
  }
}
