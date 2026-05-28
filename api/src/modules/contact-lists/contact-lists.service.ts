import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ContactList } from './contact-list.entity';

@Injectable()
export class ContactListsService {
  constructor(
    @InjectRepository(ContactList)
    private readonly repo: Repository<ContactList>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string) {
    const lists = await this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    const withCounts = await Promise.all(
      lists.map(async (l) => {
        const [{ count }] = await this.db.query(
          `SELECT COUNT(*) as count FROM contact_list_contacts WHERE list_id = $1`,
          [l.id],
        );
        return { ...l, contactCount: parseInt(count, 10) };
      }),
    );
    return withCounts;
  }

  async findOne(id: string, tenantId: string) {
    const l = await this.repo.findOne({ where: { id, tenantId } });
    if (!l) throw new NotFoundException('Contact list not found');
    return l;
  }

  async create(name: string, description: string | undefined, tenantId: string, userId?: string) {
    const list = this.repo.create({ tenantId, name, description, createdBy: userId });
    return this.repo.save(list);
  }

  async update(id: string, name: string | undefined, description: string | undefined, tenantId: string) {
    const list = await this.findOne(id, tenantId);
    if (name !== undefined) list.name = name;
    if (description !== undefined) list.description = description;
    return this.repo.save(list);
  }

  async remove(id: string, tenantId: string) {
    const list = await this.findOne(id, tenantId);
    await this.repo.remove(list);
  }

  async getContacts(listId: string, tenantId: string) {
    await this.findOne(listId, tenantId);
    return this.db.query(
      `SELECT ct.id, ct.full_name, ct.email,
              CASE WHEN ct.phone LIKE 'lid:%' THEN NULL ELSE ct.phone END AS phone,
              clc.added_at
       FROM contact_list_contacts clc
       JOIN contacts ct ON ct.id = clc.contact_id
       WHERE clc.list_id = $1
       ORDER BY ct.full_name
       LIMIT 1000`,
      [listId],
    );
  }

  async addContacts(listId: string, tenantId: string, contactIds: string[]) {
    await this.findOne(listId, tenantId);
    if (!contactIds.length) return { added: 0 };
    const values = contactIds.map((_, i) => `($1, $${i + 2})`).join(',');
    await this.db.query(
      `INSERT INTO contact_list_contacts (list_id, contact_id) VALUES ${values}
       ON CONFLICT (list_id, contact_id) DO NOTHING`,
      [listId, ...contactIds],
    );
    return { added: contactIds.length };
  }

  async removeContact(listId: string, tenantId: string, contactId: string) {
    await this.findOne(listId, tenantId);
    await this.db.query(
      `DELETE FROM contact_list_contacts WHERE list_id = $1 AND contact_id = $2`,
      [listId, contactId],
    );
    return { ok: true };
  }

  async clearContacts(listId: string, tenantId: string) {
    await this.findOne(listId, tenantId);
    await this.db.query(`DELETE FROM contact_list_contacts WHERE list_id = $1`, [listId]);
    return { ok: true };
  }

  async searchContacts(listId: string, tenantId: string, search?: string, tagIds?: string[]) {
    await this.findOne(listId, tenantId);
    let sql = `
      SELECT ct.id, ct.full_name, ct.email,
             CASE WHEN ct.phone LIKE 'lid:%' THEN NULL ELSE ct.phone END AS phone
      FROM contacts ct
      WHERE ct.tenant_id = $1
        AND ct.id NOT IN (SELECT contact_id FROM contact_list_contacts WHERE list_id = $2)
    `;
    const params: any[] = [tenantId, listId];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(ct.full_name) LIKE $${params.length} OR LOWER(ct.email) LIKE $${params.length} OR ct.phone LIKE $${params.length})`;
    }
    if (tagIds && tagIds.length) {
      params.push(tagIds);
      sql += ` AND ct.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = ANY($${params.length}::uuid[]))`;
    }
    sql += ` ORDER BY ct.full_name LIMIT 500`;
    return this.db.query(sql, params);
  }
}
