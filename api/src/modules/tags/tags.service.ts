import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tag } from './entities/tag.entity';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly repo: Repository<Tag>,
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string) {
    const rows = await this.db.query(
      `SELECT t.id, t.tenant_id AS "tenantId", t.name, t.color, t.created_by AS "createdBy",
              t.created_at AS "createdAt", t.updated_at AS "updatedAt",
              COUNT(ct.contact_id)::int AS "contactCount"
       FROM tags t
       LEFT JOIN contact_tags ct ON ct.tag_id = t.id
       WHERE t.tenant_id = $1
       GROUP BY t.id
       ORDER BY t.name ASC
       LIMIT 500`,
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const tag = await this.repo.findOne({ where: { id, tenantId } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  create(dto: Partial<Tag>, tenantId: string, userId?: string) {
    return this.repo.save(this.repo.create({ ...dto, tenantId, createdBy: userId }));
  }

  async update(id: string, dto: Partial<Tag>, tenantId: string) {
    const tag = await this.findOne(id, tenantId);
    Object.assign(tag, dto);
    return this.repo.save(tag);
  }

  async remove(id: string, tenantId: string) {
    const tag = await this.findOne(id, tenantId);
    await this.repo.remove(tag);
  }
}
