import { Injectable, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { buildInvoiceLines, formatInvoiceNumber, isInvoiceOverdue, financialStatusFor, financialStatusForLedger, RawInvoiceItem } from './invoice-calc';
import { BillingService } from '../billing/billing.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

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
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly billing: BillingService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

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

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id          uuid NOT NULL,
        invoice_id         uuid NOT NULL,
        method             text NOT NULL,              -- stripe | transfer | cash
        direction          text NOT NULL DEFAULT 'charge', -- charge | refund
        amount_minor       bigint NOT NULL DEFAULT 0,
        currency           text NOT NULL DEFAULT 'GBP',
        status             text NOT NULL DEFAULT 'succeeded', -- pending | succeeded | failed | refunded
        payment_link_id    uuid,
        payment_session_id text,
        provider_ref       text,
        received_at        timestamptz NOT NULL DEFAULT now(),
        recorded_by        uuid,
        note               text,
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => console.error(`[invoices] invoice_payments init: ${e.message}`));

    await this.db.query(`CREATE INDEX IF NOT EXISTS invoices_tenant_idx ON invoices(tenant_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments(invoice_id)`).catch(() => {});
    // A provider reference is unique per tenant → a duplicate webhook can never record twice (Etapa 5).
    await this.db.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_provref_uidx ON invoice_payments(tenant_id, provider_ref) WHERE provider_ref IS NOT NULL`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS invoice_payments_session_idx ON invoice_payments(payment_session_id) WHERE payment_session_id IS NOT NULL`).catch(() => {});

    // Processed Stripe (Connect) webhook events → each event is handled exactly once.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        event_id    text PRIMARY KEY,
        type        text,
        received_at timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => console.error(`[invoices] stripe_webhook_events init: ${e.message}`));

    // Credit notes (Etapa 6) — a SEPARATE document with its own numbering (CN-2026-0001)
    // and detail lines. It references the original invoice but NEVER edits it (immutable).
    // Money is in integer minor units, same model as invoices (no 2-decimal assumption).
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS credit_notes (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       uuid NOT NULL,
        invoice_id      uuid NOT NULL,
        number          text,
        number_seq      integer,
        reason          text,
        currency        text    NOT NULL DEFAULT 'GBP',
        subtotal_minor  bigint  NOT NULL DEFAULT 0,
        tax_minor       bigint  NOT NULL DEFAULT 0,
        total_minor     bigint  NOT NULL DEFAULT 0,
        issuer_snapshot jsonb,
        created_by      uuid,
        issued_at       timestamptz NOT NULL DEFAULT now(),
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `).catch((e: any) => console.error(`[invoices] credit_notes init: ${e.message}`));

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS credit_note_items (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        credit_note_id      uuid NOT NULL,
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
    `).catch((e: any) => console.error(`[invoices] credit_note_items init: ${e.message}`));

    await this.db.query(`CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx ON credit_notes(invoice_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS credit_notes_tenant_idx ON credit_notes(tenant_id)`).catch(() => {});
    await this.db.query(`CREATE INDEX IF NOT EXISTS credit_note_items_cn_idx ON credit_note_items(credit_note_id)`).catch(() => {});
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
    const payments = await this.db.query(
      `SELECT id, method, direction, amount_minor, currency, status, received_at, note
         FROM invoice_payments WHERE invoice_id = $1 ORDER BY received_at ASC`, [id],
    );
    const creditNotes = await this.db.query(
      `SELECT id, number, reason, currency, total_minor, issued_at
         FROM credit_notes WHERE invoice_id = $1 AND tenant_id = $2 ORDER BY issued_at ASC`, [id, tenantId],
    );
    const creditedMinor = creditNotes.reduce((s: number, cn: any) => s + Number(cn.total_minor || 0), 0);
    return {
      ...inv,
      balance_minor: Number(inv.total_minor) - Number(inv.amount_paid_minor),
      // Net paid (amount_paid_minor = charges − refunds) is exactly what is left to refund.
      refundable_minor: Math.max(0, Number(inv.amount_paid_minor)),
      credited_minor: creditedMinor,
      overdue: isInvoiceOverdue(inv),
      items,
      payments,
      credit_notes: creditNotes,
    };
  }

  /** Σ(succeeded charges) − Σ(succeeded refunds), minor units, for one invoice (NET paid). */
  private async sumPaidMinor(m: any, invoiceId: string): Promise<number> {
    const [row] = await m.query(
      `SELECT COALESCE(SUM(CASE WHEN direction='refund' THEN -amount_minor ELSE amount_minor END),0)::bigint AS paid
         FROM invoice_payments WHERE invoice_id=$1 AND status='succeeded'`,
      [invoiceId],
    );
    return Number(row?.paid ?? 0);
  }

  /** GROSS charges and GROSS refunds separately — needed to tell "never paid" from
   *  "paid then fully refunded" (both net to 0) when deriving the financial status. */
  private async ledgerSums(m: any, invoiceId: string): Promise<{ charged: number; refunded: number }> {
    const [row] = await m.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction='charge' THEN amount_minor ELSE 0 END),0)::bigint AS charged,
         COALESCE(SUM(CASE WHEN direction='refund' THEN amount_minor ELSE 0 END),0)::bigint AS refunded
         FROM invoice_payments WHERE invoice_id=$1 AND status='succeeded'`,
      [invoiceId],
    );
    return { charged: Number(row?.charged ?? 0), refunded: Number(row?.refunded ?? 0) };
  }

  /** Recompute amount_paid + financial_status from the ledger (ledger is the source of truth).
   *  Uses gross charges/refunds so a refund resolves to partially_refunded/refunded correctly
   *  (plan §8) — never silently flips an invoice back to an incorrect status. */
  private async recompute(m: any, invoiceId: string): Promise<void> {
    const { charged, refunded } = await this.ledgerSums(m, invoiceId);
    const paid = charged - refunded; // NET, stored as amount_paid_minor (drives the balance)
    const [inv] = await m.query(`SELECT total_minor, financial_status FROM invoices WHERE id=$1`, [invoiceId]);
    if (!inv) return;
    const status = financialStatusForLedger(charged, refunded, Number(inv.total_minor), inv.financial_status);
    await m.query(
      `UPDATE invoices
          SET amount_paid_minor=$2, financial_status=$3,
              paid_at = CASE WHEN $3='paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
              updated_at=NOW()
        WHERE id=$1`,
      [invoiceId, paid, status],
    );
  }

  // ── Payments ledger (Etapa 4): manual transfer/cash + partials, no overpay ───
  async recordPayment(tenantId: string, invoiceId: string, userId: string | null, dto: any) {
    const method = String(dto.method || '');
    if (!['transfer', 'cash'].includes(method)) {
      throw new BadRequestException('Método no soportado. En esta etapa solo transferencia o efectivo.');
    }
    const amount = Math.trunc(Number(dto.amount_minor) || 0);
    if (amount <= 0) throw new BadRequestException('El monto debe ser mayor que cero.');

    await this.db.transaction(async (m) => {
      // Lock the invoice so two concurrent payments can't both pass the balance check (overpay).
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`invpay:${invoiceId}`]);
      const [inv] = await m.query(`SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2`, [invoiceId, tenantId]);
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (!['issued', 'partially_paid'].includes(inv.financial_status)) {
        throw new BadRequestException('Solo se pueden registrar pagos en facturas emitidas o con pago parcial.');
      }
      const paid = await this.sumPaidMinor(m, invoiceId);
      const balance = Number(inv.total_minor) - paid;
      if (balance <= 0) throw new BadRequestException('La factura ya está pagada.');
      if (amount > balance) {
        throw new BadRequestException(`El pago supera el saldo pendiente. Saldo: ${balance} (unidades mínimas de ${inv.currency}).`);
      }
      await m.query(
        `INSERT INTO invoice_payments
           (tenant_id, invoice_id, method, direction, amount_minor, currency, status, received_at, recorded_by, note)
         VALUES ($1,$2,$3,'charge',$4,$5,'succeeded',COALESCE($6::timestamptz, NOW()),$7,$8)`,
        [tenantId, invoiceId, method, amount, inv.currency, dto.received_at || null, userId, dto.note || null],
      );
      await this.recompute(m, invoiceId);
    });
    return this.getOne(tenantId, invoiceId);
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

  // ── Stripe (Connect) payments — Etapa 5 (AISLADO del billing de suscripciones) ─
  /** Generate a Stripe Connect checkout link for an invoice (full balance or partial).
   *  Records a PENDING stripe payment; it turns succeeded via the Connect webhook or poll.
   *  Amount travels in MINOR units → correct for every currency (no 2-decimal assumption). */
  async createStripeLink(tenantId: string, invoiceId: string, userId: string | null, amountMinor?: number) {
    const inv = await this.getOne(tenantId, invoiceId);
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (!['issued', 'partially_paid'].includes(inv.financial_status)) {
      throw new BadRequestException('Solo se pueden cobrar facturas emitidas o con pago parcial.');
    }
    const balance = Number(inv.balance_minor);
    if (balance <= 0) throw new BadRequestException('La factura ya está pagada.');
    const amount = amountMinor ? Math.trunc(Number(amountMinor)) : balance;
    if (amount <= 0) throw new BadRequestException('El monto debe ser mayor que cero.');
    if (amount > balance) throw new BadRequestException('El pago supera el saldo pendiente.');

    const account = await this.billing.getConnectAccount(tenantId);
    if (!account?.account_id) throw new BadRequestException('No tienes una cuenta de Stripe Connect activa. Ve a Configuración → Pagos.');
    if (!account.charges_enabled) throw new BadRequestException('Tu cuenta de Stripe aún no tiene cobros habilitados.');

    const provider: any = await this.billing.getProvider(tenantId);
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    const session = await provider.createConnectCheckoutSessionMinor({
      accountId: account.account_id,
      amountMinor: amount,
      currency: inv.currency,
      description: `Factura ${inv.number || ''}`.trim(),
      successUrl: `${base}/invoices?payment=success`,
      cancelUrl: `${base}/invoices?payment=cancelled`,
      applicationFeePercent: 0, // decisión: 0% de comisión inicial
    });
    await this.db.query(
      `INSERT INTO invoice_payments
         (tenant_id, invoice_id, method, direction, amount_minor, currency, status, payment_session_id, recorded_by)
       VALUES ($1,$2,'stripe','charge',$3,$4,'pending',$5,$6)`,
      [tenantId, invoiceId, amount, inv.currency, session.sessionId, userId],
    );
    return { url: session.url, sessionId: session.sessionId };
  }

  /** Mark a pending stripe payment as succeeded (IDEMPOTENT) and recompute the invoice.
   *  Stores the payment_intent as provider_ref so a later refund can target this charge and
   *  so a `charge.refunded` webhook can map the refund back to this invoice. */
  async markStripePaymentPaid(sessionId: string, paymentIntent?: string) {
    if (!sessionId) return;
    await this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`stripepay:${sessionId}`]);
      const [pay] = await m.query(
        `SELECT id, invoice_id FROM invoice_payments WHERE payment_session_id=$1 AND method='stripe' AND status='pending' LIMIT 1`,
        [sessionId],
      );
      if (!pay) return; // not found or already processed → no-op (idempotent)
      await m.query(
        `UPDATE invoice_payments SET status='succeeded', received_at=NOW(),
                provider_ref=COALESCE($2, provider_ref)
          WHERE id=$1 AND status='pending'`,
        [pay.id, paymentIntent || null],
      );
      await this.recompute(m, pay.invoice_id);
    });
  }

  async expireStripePayment(sessionId: string) {
    if (!sessionId) return;
    await this.db.query(
      `UPDATE invoice_payments SET status='failed' WHERE payment_session_id=$1 AND method='stripe' AND status='pending'`,
      [sessionId],
    ).catch(() => {});
  }

  /** Poll fallback: reconcile this invoice's pending stripe payments against Stripe. */
  async reconcileInvoiceStripe(tenantId: string, invoiceId: string) {
    const pending = await this.db.query(
      `SELECT payment_session_id FROM invoice_payments
        WHERE tenant_id=$1 AND invoice_id=$2 AND method='stripe' AND status='pending' AND payment_session_id IS NOT NULL`,
      [tenantId, invoiceId],
    );
    if (!pending.length) return;
    const account = await this.billing.getConnectAccount(tenantId);
    if (!account?.account_id) return;
    const provider: any = await this.billing.getProvider(tenantId).catch(() => null);
    if (!provider?.retrieveConnectCheckoutSession) return;
    for (const p of pending) {
      try {
        const s = await provider.retrieveConnectCheckoutSession(account.account_id, p.payment_session_id);
        if (s.status === 'complete' && s.paymentStatus === 'paid') await this.markStripePaymentPaid(p.payment_session_id, s.paymentIntent);
        else if (s.status === 'expired') await this.expireStripePayment(p.payment_session_id);
      } catch { /* ignore individual failures */ }
    }
  }

  // ── Connect webhook (separate endpoint; does NOT touch the subscription webhook) ─
  async handleConnectWebhook(rawBody: Buffer | string, signature: string) {
    const secret = await this.platformSettings.get('stripe.connect_webhook_secret').catch(() => '');
    let event: any;
    try {
      if (secret) {
        const provider: any = await this.billing.getProvider();
        event = provider.constructWebhookEvent(rawBody, signature, secret);
      } else {
        event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(Buffer.from(rawBody).toString('utf8'));
      }
    } catch {
      throw new BadRequestException('Webhook signature verification failed');
    }
    // Dedup: a duplicate webhook delivery of the SAME event is ignored → never records twice.
    const [fresh] = await this.db.query(
      `INSERT INTO stripe_webhook_events (event_id, type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event?.id, event?.type],
    );
    if (!fresh) return { received: true, duplicate: true };
    await this.processConnectEvent(event).catch((e: any) => console.error('[invoices/webhook] process error', event?.type, e?.message));
    return { received: true };
  }

  private async processConnectEvent(event: any) {
    const obj = event?.data?.object;
    if (!obj) return;
    if (event.type === 'checkout.session.completed') {
      await this.markStripePaymentPaid(obj.id, obj.payment_intent ? String(obj.payment_intent) : undefined);
    } else if (event.type === 'checkout.session.expired') {
      await this.expireStripePayment(obj.id);
    } else if (event.type === 'charge.refunded') {
      // Refund initiated in Stripe (dashboard) OR echoed after an API refund → reconcile the ledger.
      await this.handleChargeRefunded(obj);
    }
    // Everything else (incl. subscription events) is intentionally ignored here.
  }

  /** Reconcile a Stripe `charge.refunded` into the ledger. Maps the charge to the invoice by its
   *  payment_intent (stored as provider_ref on the original charge) and inserts one refund row per
   *  Stripe refund id. UNIQUE(tenant_id, provider_ref) makes this idempotent: a refund already
   *  recorded by the API path (or a duplicate webhook) is skipped, so money is never double-counted. */
  async handleChargeRefunded(charge: any) {
    const pi = charge?.payment_intent ? String(charge.payment_intent) : null;
    if (!pi) return;
    const [orig] = await this.db.query(
      `SELECT tenant_id, invoice_id, currency FROM invoice_payments
        WHERE provider_ref=$1 AND direction='charge' AND method='stripe' LIMIT 1`,
      [pi],
    );
    if (!orig) return; // not one of ours (e.g. a subscription charge) → ignore
    const refunds = Array.isArray(charge?.refunds?.data) ? charge.refunds.data : [];
    if (!refunds.length) return;
    await this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`invpay:${orig.invoice_id}`]);
      for (const r of refunds) {
        if (!r?.id) continue;
        if (r.status && r.status !== 'succeeded' && r.status !== 'pending') continue;
        await m.query(
          `INSERT INTO invoice_payments
             (tenant_id, invoice_id, method, direction, amount_minor, currency, status, provider_ref, note)
           VALUES ($1,$2,'stripe','refund',$3,$4,'succeeded',$5,$6)
           ON CONFLICT (tenant_id, provider_ref) WHERE provider_ref IS NOT NULL DO NOTHING`,
          [orig.tenant_id, orig.invoice_id, Math.trunc(Number(r.amount) || 0), orig.currency, String(r.id), 'Reembolso Stripe'],
        );
      }
      await this.recompute(m, orig.invoice_id);
    });
  }

  // ── Refunds (Etapa 6) — admin only (enforced at the HTTP layer with @Roles('admin')) ─
  /** Refund a paid invoice, totally or partially. Stripe refunds hit the Stripe API and are
   *  reconciled idempotently with the `charge.refunded` webhook; manual (transfer/cash) refunds
   *  just record a ledger row. Can NEVER refund more than the net collected. */
  async refundInvoice(tenantId: string, invoiceId: string, userId: string | null, dto: any) {
    const method = String(dto.method || 'stripe');
    const reason = dto.reason || null;
    const requested = dto.amount_minor != null ? Math.trunc(Number(dto.amount_minor)) : null;
    if (requested != null && requested <= 0) throw new BadRequestException('El monto debe ser mayor que cero.');

    await this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`invpay:${invoiceId}`]);
      const [inv] = await m.query(`SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2`, [invoiceId, tenantId]);
      if (!inv) throw new NotFoundException('Factura no encontrada');

      const { charged, refunded } = await this.ledgerSums(m, invoiceId);
      const netPaid = charged - refunded; // maximum refundable
      if (netPaid <= 0) throw new BadRequestException('No hay un pago neto que reembolsar.');
      const amount = requested ?? netPaid;
      if (amount > netPaid) {
        throw new BadRequestException(`El reembolso supera lo cobrado. Máximo: ${netPaid} (unidades mínimas de ${inv.currency}).`);
      }

      if (method === 'transfer' || method === 'cash') {
        await m.query(
          `INSERT INTO invoice_payments
             (tenant_id, invoice_id, method, direction, amount_minor, currency, status, recorded_by, note)
           VALUES ($1,$2,$3,'refund',$4,$5,'succeeded',$6,$7)`,
          [tenantId, invoiceId, method, amount, inv.currency, userId, reason],
        );
        await this.recompute(m, invoiceId);
        return;
      }
      if (method !== 'stripe') throw new BadRequestException('Método de reembolso no soportado.');

      // Stripe: refund against a specific succeeded stripe charge (identified by its payment_intent).
      const charges = await m.query(
        `SELECT id, amount_minor, provider_ref FROM invoice_payments
          WHERE invoice_id=$1 AND tenant_id=$2 AND method='stripe' AND direction='charge'
            AND status='succeeded' AND provider_ref IS NOT NULL
          ORDER BY received_at ASC`,
        [invoiceId, tenantId],
      );
      const target = dto.payment_id ? charges.find((c: any) => c.id === dto.payment_id) : charges[0];
      if (!target) throw new BadRequestException('No hay un cargo de Stripe para reembolsar.');
      if (amount > Number(target.amount_minor)) {
        throw new BadRequestException('El reembolso supera el cargo seleccionado; elige otro cargo o divide el reembolso.');
      }
      const account = await this.billing.getConnectAccount(tenantId);
      if (!account?.account_id) throw new BadRequestException('No tienes una cuenta de Stripe Connect activa.');
      const provider: any = await this.billing.getProvider(tenantId);
      const r = await provider.createConnectRefund(account.account_id, target.provider_ref, amount);
      const status = (r.status === 'succeeded' || r.status === 'pending') ? 'succeeded' : 'failed';
      await m.query(
        `INSERT INTO invoice_payments
           (tenant_id, invoice_id, method, direction, amount_minor, currency, status, provider_ref, recorded_by, note)
         VALUES ($1,$2,'stripe','refund',$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, provider_ref) WHERE provider_ref IS NOT NULL DO NOTHING`,
        [tenantId, invoiceId, amount, inv.currency, status, String(r.refundId), userId, reason],
      );
      await this.recompute(m, invoiceId);
    });
    return this.getOne(tenantId, invoiceId);
  }

  // ── Credit notes with detail lines (Etapa 6) — admin only ────────────────────
  /** Issue a credit note against an issued invoice. It has its OWN gapless numbering
   *  (CN-2026-0001), frozen issuer snapshot, detail lines (concepts + tax), and references the
   *  original invoice. It does NOT edit the invoice (immutable) and does NOT move money by itself
   *  (a refund is a separate action). Total credited can never exceed the invoice total. */
  async createCreditNote(tenantId: string, userId: string | null, invoiceId: string, dto: any) {
    const inv = await this.getOne(tenantId, invoiceId); // tenant-scoped guard
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (!['issued', 'partially_paid', 'paid', 'partially_refunded', 'refunded'].includes(inv.financial_status)) {
      throw new BadRequestException('Solo una factura emitida puede tener nota de crédito.');
    }
    const defaultTaxRate = Number(dto.default_tax_rate ?? inv.default_tax_rate ?? 0) || 0;
    const { items, totals } = buildInvoiceLines((dto.items ?? []) as RawInvoiceItem[], defaultTaxRate);
    if (!items.length) throw new BadRequestException('La nota de crédito necesita al menos una línea.');
    if (totals.totalMinor <= 0) throw new BadRequestException('El total de la nota de crédito debe ser mayor que cero.');

    const alreadyCredited = Number(inv.credited_minor || 0);
    if (alreadyCredited + totals.totalMinor > Number(inv.total_minor)) {
      throw new BadRequestException('El total acreditado supera el total de la factura.');
    }

    const settings = await this.getSettings(tenantId);
    if (!settings.business_name) {
      throw new BadRequestException('Configura los datos del emisor en Ajustes → Facturación antes de emitir una nota de crédito.');
    }
    const issuer = {
      business_name: settings.business_name, address: settings.address, tax_id: settings.tax_id,
      email: settings.email, phone: settings.phone, logo_url: settings.logo_url,
    };
    const prefix = settings.cn_prefix || 'CN';
    const year = new Date().getFullYear();
    const currency = inv.currency;

    const cnId: string = await this.db.transaction(async (m) => {
      // Serialize credit-note numbering per (tenant, year) — gapless, same technique as invoices.
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`cnnum:${tenantId}:${year}`]);
      const [row] = await m.query(
        `SELECT COALESCE(MAX(number_seq),0)::int AS max FROM credit_notes
          WHERE tenant_id=$1 AND number_seq IS NOT NULL AND EXTRACT(YEAR FROM issued_at)=$2`,
        [tenantId, year],
      );
      const seq = Number(row?.max ?? 0) + 1;
      const number = formatInvoiceNumber(prefix, year, seq);
      const ins = await m.query(
        `INSERT INTO credit_notes
           (tenant_id, invoice_id, number, number_seq, reason, currency,
            subtotal_minor, tax_minor, total_minor, issuer_snapshot, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, invoiceId, number, seq, dto.reason ?? null, currency,
         totals.subtotalMinor, totals.taxMinor, totals.totalMinor, JSON.stringify(issuer), userId],
      );
      const id = ins[0].id;
      for (const it of items) {
        await m.query(
          `INSERT INTO credit_note_items
             (credit_note_id, description, quantity, unit_price_minor, discount_minor, tax_rate,
              line_subtotal_minor, line_tax_minor, line_total_minor, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, it.description, it.quantity, it.unit_price_minor, it.discount_minor, it.tax_rate,
           it.line_subtotal_minor, it.line_tax_minor, it.line_total_minor, it.sort_order],
        );
      }
      return id;
    });
    return this.getCreditNote(tenantId, cnId);
  }

  async listCreditNotes(tenantId: string, invoiceId?: string) {
    const params: any[] = [tenantId];
    let where = 'tenant_id=$1';
    if (invoiceId) { params.push(invoiceId); where += ` AND invoice_id=$${params.length}`; }
    return this.db.query(
      `SELECT id, invoice_id, number, reason, currency, subtotal_minor, tax_minor, total_minor, issued_at
         FROM credit_notes WHERE ${where} ORDER BY issued_at DESC`,
      params,
    );
  }

  async getCreditNote(tenantId: string, id: string) {
    const [cn] = await this.db.query(
      `SELECT * FROM credit_notes WHERE id=$1 AND tenant_id=$2`, [id, tenantId],
    );
    if (!cn) return null;
    const items = await this.db.query(
      `SELECT * FROM credit_note_items WHERE credit_note_id=$1 ORDER BY sort_order ASC`, [id],
    );
    return { ...cn, items };
  }
}
