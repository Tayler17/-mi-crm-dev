import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Executes CRM actions triggered by a call bot via AI function calling.
 * All methods are tenant-scoped for safety.
 */
@Injectable()
export class BotActionsService {
  private readonly logger = new Logger(BotActionsService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async lookupContactByPhone(
    tenantId: string,
    phone: string,
  ): Promise<{ id: string; name: string; email: string | null } | null> {
    const digits = phone.replace(/\D/g, '');
    // Match on last 9 digits to handle different country-code formats
    // e.g. Twilio "+447123456789" vs DB "07123456789" → both end in "7123456789" (9+ chars)
    const last9 = digits.slice(-9);
    const [contact] = await this.db
      .query(
        `SELECT id, full_name AS name, email FROM contacts
         WHERE tenant_id::text = $1
           AND phone IS NOT NULL
           AND (
             phone = $2
             OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $3
             OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE $4
           )
         LIMIT 1`,
        [tenantId, phone, digits, `%${last9}`],
      )
      .catch((e: any) => { this.logger.warn(`[bot-action] lookupContactByPhone error: ${e.message}`); return [null]; });
    return contact ?? null;
  }

  /** Returns pipeline stages (all pipelines, default first) and available tags for context injection. */
  async getContext(tenantId: string): Promise<{ stages: Array<{ id: string; name: string }>; tags: Array<{ id: string; name: string }> }> {
    const [stages, tags] = await Promise.all([
      this.db
        .query(
          `SELECT ps.id, ps.name, p.name AS pipeline_name
           FROM pipeline_stages ps
           JOIN pipelines p ON p.id = ps.pipeline_id
           WHERE p.tenant_id = $1
           ORDER BY p.is_default DESC, p.created_at, ps.position`,
          [tenantId],
        )
        .catch(() => []),
      this.db
        .query(`SELECT id, name FROM tags WHERE tenant_id = $1 ORDER BY name LIMIT 50`, [tenantId])
        .catch(() => []),
    ]);
    return { stages, tags };
  }

  async createDeal(
    tenantId: string,
    contactId: string,
    args: { title: string; value?: number; stage_name?: string; notes?: string; priority?: string },
  ): Promise<{ success: boolean; id?: string; message: string }> {
    let stageId: string | null = null;
    if (args.stage_name) {
      const [stage] = await this.db
        .query(
          `SELECT ps.id FROM pipeline_stages ps
           JOIN pipelines p ON p.id = ps.pipeline_id
           WHERE p.tenant_id = $1 AND LOWER(ps.name) LIKE LOWER($2)
           LIMIT 1`,
          [tenantId, `%${args.stage_name}%`],
        )
        .catch(() => [null]);
      stageId = stage?.id ?? null;
    }
    const [deal] = await this.db.query(
      `INSERT INTO deals (tenant_id, contact_id, title, value, stage_id, notes, priority, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())
       RETURNING id, title`,
      [tenantId, contactId, args.title, args.value ?? null, stageId, args.notes ?? null, args.priority ?? 'medium'],
    );
    this.logger.log(`[bot-action] Created deal "${deal.title}" (${deal.id}) for contact ${contactId}`);
    return { success: true, id: deal.id, message: `Trato "${deal.title}" creado correctamente.` };
  }

  async createTask(
    tenantId: string,
    contactId: string,
    args: { title: string; description?: string; due_date?: string; priority?: string },
  ): Promise<{ success: boolean; id?: string; message: string }> {
    const [task] = await this.db.query(
      `INSERT INTO tasks (tenant_id, title, description, due_date, status, priority, contact_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::date, 'pending', $5, $6, NOW(), NOW())
       RETURNING id, title`,
      [tenantId, args.title, args.description ?? null, args.due_date ?? null, args.priority ?? 'medium', contactId],
    );
    this.logger.log(`[bot-action] Created task "${task.title}" (${task.id}) for contact ${contactId}`);
    return { success: true, id: task.id, message: `Tarea "${task.title}" registrada.` };
  }

  async addTag(
    tenantId: string,
    contactId: string,
    tagName: string,
  ): Promise<{ success: boolean; message: string }> {
    let [tag] = await this.db
      .query(`SELECT id FROM tags WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [tenantId, tagName])
      .catch(() => [null]);

    if (!tag) {
      [tag] = await this.db.query(
        `INSERT INTO tags (tenant_id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
        [tenantId, tagName],
      ).catch(() => [null]);
    }

    if (!tag?.id) return { success: false, message: 'No se pudo encontrar o crear la etiqueta.' };

    await this.db
      .query(`INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [contactId, tag.id])
      .catch(() => {});

    this.logger.log(`[bot-action] Tagged contact ${contactId} with "${tagName}"`);
    return { success: true, message: `Etiqueta "${tagName}" agregada al contacto.` };
  }

  async updateDeal(
    tenantId: string,
    dealId: string,
    args: { status?: string; notes?: string; value?: number },
  ): Promise<{ success: boolean; message: string }> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [dealId, tenantId];
    let i = 3;
    if (args.status !== undefined) { sets.push(`status = $${i++}`); params.push(args.status); }
    if (args.notes  !== undefined) { sets.push(`notes = $${i++}`);  params.push(args.notes);  }
    if (args.value  !== undefined) { sets.push(`value = $${i++}`);  params.push(args.value);  }

    await this.db
      .query(`UPDATE deals SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`, params)
      .catch(() => {});

    this.logger.log(`[bot-action] Updated deal ${dealId}`);
    return { success: true, message: `Trato actualizado.` };
  }

  /** Save details the caller gives onto their contact record so it isn't left as just
   *  a phone number. Name overwrites only a placeholder; email/address fill only if
   *  empty; notes are appended. */
  async updateContact(
    tenantId: string,
    contactId: string,
    args: { name?: string; email?: string; address?: string; notes?: string },
  ): Promise<{ success: boolean; message: string }> {
    const [cur] = await this.db.query(
      `SELECT full_name, email, location, notes FROM contacts WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [contactId, tenantId],
    ).catch(() => [null]);
    if (!cur) return { success: false, message: 'Contacto no encontrado.' };

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [contactId, tenantId];
    let i = 3;

    // Name: set only if the current one is empty or an auto placeholder ("Llamada entrante +44…").
    const isPlaceholder = !cur.full_name || /^(llamada entrante|llamada|sin nombre|unknown|desconocido|\+?\d)/i.test(String(cur.full_name).trim());
    if (args.name?.trim() && isPlaceholder) { sets.push(`full_name = $${i++}`); params.push(args.name.trim()); }
    // Email / address: fill only when empty (never overwrite existing good data).
    if (args.email?.trim() && !cur.email) { sets.push(`email = $${i++}`); params.push(args.email.trim()); }
    if (args.address?.trim() && !cur.location) { sets.push(`location = $${i++}`); params.push(args.address.trim()); }
    // Notes: append, don't replace.
    if (args.notes?.trim()) { sets.push(`notes = $${i++}`); params.push([cur.notes, args.notes.trim()].filter(Boolean).join('\n')); }

    if (sets.length === 1) return { success: true, message: 'Contacto sin cambios.' };
    await this.db.query(`UPDATE contacts SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`, params).catch(() => {});
    this.logger.log(`[bot-action] Updated contact ${contactId}`);
    return { success: true, message: 'Datos del contacto actualizados.' };
  }

  /** Unified tool executor called from callAi */
  async executeTool(
    tenantId: string,
    contactId: string | null,
    toolName: string,
    args: Record<string, any>,
  ): Promise<string> {
    // For contact-scoped actions without a known contact, skip gracefully
    if (!contactId && !['update_deal'].includes(toolName)) {
      this.logger.warn(`[bot-action] ${toolName} skipped — no contactId for tenant ${tenantId}`);
      return JSON.stringify({ success: false, message: 'Contacto no registrado en el sistema. Acción no guardada.' });
    }

    try {
      let result: any;
      switch (toolName) {
        case 'create_deal':
          result = await this.createDeal(tenantId, contactId!, args as any);
          break;
        case 'create_task':
          result = await this.createTask(tenantId, contactId!, args as any);
          break;
        case 'add_tag':
          result = await this.addTag(tenantId, contactId!, args.tag_name ?? args.tagName ?? '');
          break;
        case 'update_deal':
          result = await this.updateDeal(tenantId, args.deal_id ?? args.dealId ?? '', args);
          break;
        case 'update_contact':
          result = await this.updateContact(tenantId, contactId!, args as any);
          break;
        default:
          result = { success: false, message: `Herramienta desconocida: ${toolName}` };
      }
      return JSON.stringify(result);
    } catch (err: any) {
      this.logger.error(`[bot-action] executeTool ${toolName} error: ${err.message}`);
      return JSON.stringify({ success: false, message: `Error al ejecutar ${toolName}.` });
    }
  }
}
