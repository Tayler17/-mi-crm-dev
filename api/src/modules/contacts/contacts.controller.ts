import {
  Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { checkPlanLimit } from '../../common/utils/limits';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private readonly service: ContactsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ── CSV Import ────────────────────────────────────────────────────────────────

  @Post('import')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    fileFilter: (_req, file, cb) => {
      const ok = /\.(csv|txt)$/i.test(file.originalname) || file.mimetype === 'text/csv' || file.mimetype === 'text/plain';
      if (!ok) return cb(new BadRequestException('Solo se aceptan archivos CSV'), false);
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async importCsv(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('Archivo CSV requerido');
    const text = file.buffer.toString('utf-8');
    const rows = parseCsv(text);
    if (rows.length < 1) throw new BadRequestException('El archivo está vacío');

    // Detect header
    const first = rows[0].map((h) => h.toLowerCase().trim());
    const isHeader = first.some((h) => ['name', 'nombre', 'email', 'phone', 'telefono'].includes(h));
    const dataRows = isHeader ? rows.slice(1) : rows;
    const headers = isHeader ? first : defaultHeaders(rows[0].length);

    const idx = (names: string[]) => {
      for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; }
      return -1;
    };

    const nameIdx     = idx(['full_name', 'nombre', 'name', 'nombre completo', 'fullname']);
    const firstIdx    = idx(['first_name', 'nombre']);
    const lastIdx     = idx(['last_name', 'apellido', 'apellidos']);
    const emailIdx    = idx(['email', 'correo', 'e-mail']);
    const phoneIdx    = idx(['phone', 'telefono', 'teléfono', 'mobile', 'celular']);
    const jobIdx      = idx(['job_title', 'cargo', 'puesto', 'jobtitle', 'title']);
    const locationIdx = idx(['location', 'ciudad', 'city', 'ubicacion', 'país', 'pais']);
    const notesIdx    = idx(['notes', 'notas', 'comentarios', 'note']);
    const companyIdx  = idx(['company', 'empresa', 'company_name']);

    let created = 0, updated = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = (isHeader ? i + 2 : i + 1);
      try {
        let fullName = nameIdx >= 0 ? (row[nameIdx] ?? '').trim() : '';
        if (!fullName && firstIdx >= 0) {
          const first2 = (row[firstIdx] ?? '').trim();
          const last   = lastIdx >= 0 ? (row[lastIdx] ?? '').trim() : '';
          fullName = [first2, last].filter(Boolean).join(' ');
        }
        if (!fullName) { errors.push({ row: rowNum, reason: 'Nombre requerido' }); continue; }

        const email    = emailIdx    >= 0 ? ((row[emailIdx]    ?? '').trim() || null) : null;
        const phone    = phoneIdx    >= 0 ? ((row[phoneIdx]    ?? '').trim() || null) : null;
        const jobTitle = jobIdx      >= 0 ? ((row[jobIdx]      ?? '').trim() || null) : null;
        const location = locationIdx >= 0 ? ((row[locationIdx] ?? '').trim() || null) : null;
        const notes    = notesIdx    >= 0 ? ((row[notesIdx]    ?? '').trim() || null) : null;
        const company  = companyIdx  >= 0 ? ((row[companyIdx]  ?? '').trim() || null) : null;

        // Upsert by email if present
        if (email) {
          const [existing] = await this.db.query(
            `SELECT id FROM contacts WHERE tenant_id=$1 AND email=$2 LIMIT 1`,
            [tenantId, email],
          );
          if (existing) {
            await this.db.query(
              `UPDATE contacts SET full_name=$1, phone=COALESCE($2,phone), job_title=COALESCE($3,job_title),
               location=COALESCE($4,location), notes=COALESCE($5,notes), updated_at=NOW()
               WHERE id=$6`,
              [fullName, phone, jobTitle, location, notes, existing.id],
            );
            updated++;
            continue;
          }
        }

        await this.db.query(
          `INSERT INTO contacts (tenant_id,full_name,email,phone,job_title,location,notes,created_by,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
          [tenantId, fullName, email, phone, jobTitle, location, notes, req.user?.sub ?? req.user?.id ?? null],
        );
        if (company) {
          // Best-effort company linkage (ignore errors)
          this.db.query(
            `UPDATE contacts SET company_id=(SELECT id FROM companies WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1) WHERE tenant_id=$1 AND email=$3 AND full_name=$4`,
            [tenantId, company, email, fullName],
          ).catch(() => {});
        }
        created++;
      } catch (e: any) {
        errors.push({ row: rowNum, reason: e.message ?? 'Error desconocido' });
      }
    }

    return { created, updated, skipped: errors.length, errors: errors.slice(0, 20), total: dataRows.length };
  }

  @Post()
  async create(@Body() dto: CreateContactDto, @TenantId() tenantId: string, @Request() req: any) {
    await checkPlanLimit(this.db, tenantId, 'contacts');
    return this.service.create(dto as any, tenantId, req.user.id);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Get(':id/profile')
  async getProfile(@Param('id') id: string, @TenantId() tenantId: string) {
    const [contact, deals, conversations, tags, notes, activities] = await Promise.all([
      this.db.query(
        `SELECT c.*, comp.name AS company_name
         FROM contacts c LEFT JOIN companies comp ON comp.id = c.company_id
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT d.*, ps.name AS stage_name, p.name AS pipeline_name
         FROM deals d
         LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
         LEFT JOIN pipelines p ON p.id = ps.pipeline_id
         WHERE d.contact_id = $1 AND d.tenant_id = $2
         ORDER BY d.created_at DESC`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT c.id, c.status, c.created_at, c.updated_at,
           json_build_object('id', i.id, 'name', i.name, 'channelType', i.channel_type) AS inbox,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
         FROM conversations c LEFT JOIN inboxes i ON i.id = c.inbox_id
         WHERE c.contact_id = $1 AND c.tenant_id = $2
         ORDER BY c.updated_at DESC LIMIT 20`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT t.id, t.name, t.color FROM tags t
         JOIN contact_tags ct ON ct.tag_id = t.id
         WHERE ct.contact_id = $1 AND t.tenant_id = $2`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT m.id, m.body, m.created_at, u.full_name AS author
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id IN (
           SELECT id FROM conversations WHERE contact_id = $1 AND tenant_id = $2
         ) AND m.is_private = true
         ORDER BY m.created_at DESC LIMIT 20`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT al.id, al.action, al.entity_type, al.new_values, al.old_values, al.created_at, u.full_name AS user_name
         FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.entity_id = $1 AND al.tenant_id = $2
         ORDER BY al.created_at DESC LIMIT 30`,
        [id, tenantId],
      ),
    ]);
    return { contact: contact[0], deals, conversations, tags, notes, activities };
  }

  @Get(':id/timeline')
  async getTimeline(@Param('id') id: string, @TenantId() tenantId: string) {
    const [conversations, deals, tasks] = await Promise.all([
      this.db.query(
        `SELECT c.id, c.status, c.channel_type, c.subject, c.created_at,
                (SELECT body FROM messages m WHERE m.conversation_id = c.id
                 AND m.content_type != 'activity' ORDER BY m.created_at DESC LIMIT 1) AS last_message
         FROM conversations c
         WHERE c.contact_id = $1 AND c.tenant_id = $2
         ORDER BY c.updated_at DESC LIMIT 5`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT d.id, d.title, d.value, d.currency, d.status, d.created_at,
                ps.name AS stage_name
         FROM deals d
         LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
         WHERE d.contact_id = $1 AND d.tenant_id = $2
         ORDER BY d.updated_at DESC LIMIT 5`,
        [id, tenantId],
      ),
      this.db.query(
        `SELECT id, title, status, priority, due_date, created_at
         FROM tasks
         WHERE contact_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [id, tenantId],
      ),
    ]);
    return { conversations, deals, tasks };
  }

  @Post(':id/tags/:tagId')
  async addTag(@Param('id') contactId: string, @Param('tagId') tagId: string) {
    await this.db.query(
      `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [contactId, tagId],
    );
    return { ok: true };
  }

  @Delete(':id/tags/:tagId')
  async removeTag(@Param('id') contactId: string, @Param('tagId') tagId: string) {
    await this.db.query(
      `DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, tagId],
    );
    return { ok: true };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.update(id, dto as any, tenantId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.remove(id, tenantId, req.user.id);
  }

  // ── Duplicate detection ────────────────────────────────────────────────────

  @Get('duplicates/list')
  async getDuplicates(@TenantId() tenantId: string) {
    // Find contacts sharing the same non-null email or phone
    const rows = await this.db.query(
      `SELECT ARRAY_AGG(id ORDER BY created_at ASC) AS ids,
              ARRAY_AGG(full_name ORDER BY created_at ASC) AS names,
              email, phone, COUNT(*)::int AS count
       FROM contacts
       WHERE tenant_id = $1
         AND (email IS NOT NULL AND email != '' OR phone IS NOT NULL AND phone != '')
       GROUP BY COALESCE(NULLIF(email,''), NULL), COALESCE(NULLIF(phone,''), NULL)
       HAVING COUNT(*) > 1
       ORDER BY count DESC
       LIMIT 50`,
      [tenantId],
    );
    return rows;
  }

  @Post(':keepId/merge/:mergeId')
  async mergeContacts(
    @Param('keepId') keepId: string,
    @Param('mergeId') mergeId: string,
    @TenantId() tenantId: string,
  ) {
    // Re-assign all foreign keys from mergeId → keepId, then delete mergeId
    await this.db.query(`UPDATE conversations   SET contact_id=$1 WHERE contact_id=$2 AND tenant_id=$3`, [keepId, mergeId, tenantId]);
    await this.db.query(`UPDATE deals           SET contact_id=$1 WHERE contact_id=$2 AND tenant_id=$3`, [keepId, mergeId, tenantId]);
    await this.db.query(`UPDATE tasks           SET contact_id=$1 WHERE contact_id=$2 AND tenant_id=$3`, [keepId, mergeId, tenantId]);
    await this.db.query(`UPDATE appointments    SET contact_id=$1 WHERE contact_id=$2 AND tenant_id=$3`, [keepId, mergeId, tenantId]).catch(() => {});
    await this.db.query(
      `INSERT INTO contact_tags (contact_id, tag_id)
       SELECT $1, tag_id FROM contact_tags WHERE contact_id=$2
       ON CONFLICT DO NOTHING`,
      [keepId, mergeId],
    );
    await this.db.query(`DELETE FROM contact_tags WHERE contact_id=$1`, [mergeId]);
    await this.db.query(`DELETE FROM contacts WHERE id=$1 AND tenant_id=$2`, [mergeId, tenantId]);
    return { ok: true, kept: keepId, removed: mergeId };
  }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function defaultHeaders(colCount: number): string[] {
  const defaults = ['full_name', 'email', 'phone', 'job_title', 'location', 'notes'];
  return Array.from({ length: colCount }, (_, i) => defaults[i] ?? `col_${i}`);
}
