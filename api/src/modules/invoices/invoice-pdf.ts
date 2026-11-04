import PDFDocument = require('pdfkit');
import { createWriteStream } from 'fs';
import { fromMinor, currencyDecimals } from './money';

export interface InvoicePdfLine {
  description?: string;
  quantity: number | string;
  unit_price_minor: number | string;
  discount_minor?: number | string;
  tax_rate?: number | string | null;
  line_subtotal_minor: number | string;
  line_tax_minor: number | string;
  line_total_minor: number | string;
}

export interface InvoicePdfData {
  docTitle: string;            // "FACTURA" | "NOTA DE CRÉDITO"
  number?: string | null;
  currency: string;
  issuer?: any;                // frozen issuer snapshot
  buyer?: any;                 // frozen buyer snapshot
  items: InvoicePdfLine[];
  subtotal_minor: number | string;
  tax_minor: number | string;
  total_minor: number | string;
  amount_paid_minor?: number | string;
  due_date?: string | null;
  issued_at?: string | null;
  notes?: string | null;
  terms?: string | null;
}

/** Render an invoice / credit-note PDF to `filePath`. Amounts come in minor units and are
 *  formatted with the currency's own decimals (no 2-decimal assumption). Returns when the
 *  file is fully flushed to disk. Pure I/O — no DB, so it's easy to call and reason about. */
export function buildInvoicePdf(filePath: string, data: InvoicePdfData): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const cur = (data.currency || 'GBP').toUpperCase();
      const dec = currencyDecimals(cur);
      const money = (m: number | string) => `${fromMinor(Number(m) || 0, cur).toFixed(dec)} ${cur}`;
      const dateStr = (d?: string | null) => (d ? String(d).slice(0, 10) : '—');

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      const left = 50;
      const right = 545;

      // ── Header: issuer (left) + document title/number (right) ──
      const issuer = data.issuer || {};
      doc.fontSize(18).fillColor('#111').text(issuer.business_name || 'Emisor', left, 50);
      doc.fontSize(9).fillColor('#555');
      if (issuer.address) doc.text(String(issuer.address), left, doc.y, { width: 260 });
      if (issuer.tax_id)  doc.text(`ID fiscal: ${issuer.tax_id}`);
      if (issuer.email)   doc.text(String(issuer.email));
      if (issuer.phone)   doc.text(String(issuer.phone));

      doc.fontSize(20).fillColor('#111').text(data.docTitle, 320, 50, { width: 225, align: 'right' });
      doc.fontSize(10).fillColor('#555')
        .text(`Nº: ${data.number || '—'}`, 320, 78, { width: 225, align: 'right' })
        .text(`Emitida: ${dateStr(data.issued_at)}`, { width: 225, align: 'right' });
      if (data.due_date) doc.text(`Vence: ${dateStr(data.due_date)}`, { width: 225, align: 'right' });

      // ── Buyer ──
      const buyer = data.buyer || {};
      let y = 150;
      doc.fontSize(10).fillColor('#111').text('Facturar a:', left, y);
      doc.fontSize(10).fillColor('#555');
      if (buyer.name)  doc.text(String(buyer.name), left, doc.y);
      if (buyer.email) doc.text(String(buyer.email));
      if (buyer.phone) doc.text(String(buyer.phone));

      // ── Items table ──
      y = Math.max(doc.y + 16, 215);
      const cols = { desc: left, qty: 300, unit: 350, tax: 420, total: 470 };
      doc.fontSize(9).fillColor('#111');
      doc.text('Descripción', cols.desc, y);
      doc.text('Cant.', cols.qty, y, { width: 40, align: 'right' });
      doc.text('Precio', cols.unit, y, { width: 60, align: 'right' });
      doc.text('IVA', cols.tax, y, { width: 40, align: 'right' });
      doc.text('Total', cols.total, y, { width: 75, align: 'right' });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#ccc').stroke();
      y += 6;

      doc.fillColor('#333');
      for (const it of data.items || []) {
        if (y > 740) { doc.addPage(); y = 50; }
        const taxPct = it.tax_rate == null ? 0 : Number(it.tax_rate) * 100;
        const descH = doc.heightOfString(String(it.description || ''), { width: 240 });
        doc.text(String(it.description || ''), cols.desc, y, { width: 240 });
        doc.text(String(Number(it.quantity) || 0), cols.qty, y, { width: 40, align: 'right' });
        doc.text(money(it.unit_price_minor), cols.unit, y, { width: 60, align: 'right' });
        doc.text(`${taxPct % 1 === 0 ? taxPct : taxPct.toFixed(2)}%`, cols.tax, y, { width: 40, align: 'right' });
        doc.text(money(it.line_total_minor), cols.total, y, { width: 75, align: 'right' });
        y += Math.max(descH, 12) + 6;
      }
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#ccc').stroke();
      y += 10;

      // ── Totals ──
      const totalsX = 360;
      const totRow = (label: string, val: string, bold = false) => {
        doc.fontSize(bold ? 11 : 10).fillColor(bold ? '#111' : '#555');
        doc.text(label, totalsX, y, { width: 100, align: 'right' });
        doc.text(val, 465, y, { width: 80, align: 'right' });
        y += bold ? 18 : 15;
      };
      totRow('Subtotal', money(data.subtotal_minor));
      totRow('IVA', money(data.tax_minor));
      totRow('Total', money(data.total_minor), true);
      const paid = Number(data.amount_paid_minor ?? 0);
      if (paid !== 0) {
        totRow('Pagado', money(paid));
        totRow('Saldo', money(Number(data.total_minor) - paid), true);
      }

      // ── Notes / terms ──
      y += 10;
      doc.fontSize(9).fillColor('#555');
      if (data.notes) { doc.text(`Notas: ${data.notes}`, left, y, { width: right - left }); y = doc.y + 4; }
      if (data.terms) { doc.text(String(data.terms), left, y, { width: right - left }); }

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    } catch (e) {
      reject(e as Error);
    }
  });
}
