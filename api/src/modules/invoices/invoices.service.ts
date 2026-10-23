import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Invoices module — Etapa 0 (cimientos).
 * By now this only manages the per-tenant issuer legal/fiscal data required on a valid
 * invoice (name, address, tax id, numbering prefix, default currency/tax). Drafts can be
 * created later without it; issuing an invoice will REQUIRE it (enforced in Etapa 2).
 *
 * Isolated by design: this does NOT touch `payment_links`, the Stripe subscription webhook,
 * or any existing billing flow.
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
  }

  /** Issuer settings for a tenant. Returns sensible defaults (configured:false) when unset. */
  async getSettings(tenantId: string) {
    const [row] = await this.db.query(
      `SELECT * FROM tenant_invoice_settings WHERE tenant_id=$1`,
      [tenantId],
    );
    if (row) return { ...row, configured: !!row.business_name };
    return {
      tenant_id: tenantId, business_name: null, address: null, tax_id: null,
      email: null, phone: null, logo_url: null, number_prefix: 'INV', cn_prefix: 'CN',
      default_currency: 'GBP', default_tax_rate: 0, footer_terms: null, configured: false,
    };
  }

  /** Upsert issuer settings (tenant-scoped). Called only by admins (enforced in controller). */
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
}
