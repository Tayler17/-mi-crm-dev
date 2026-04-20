import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Company } from '../contacts/entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company) private readonly repo: Repository<Company>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(tenantId: string) {
    return this.db.query(
      `SELECT c.*,
              COUNT(DISTINCT ct.id)::int AS contact_count,
              COUNT(DISTINCT d.id)::int  AS deal_count,
              COALESCE(SUM(d.value) FILTER (WHERE d.status = 'active'), 0)::numeric AS pipeline_value
       FROM companies c
       LEFT JOIN contacts ct ON ct.company_id = c.id
       LEFT JOIN deals d ON d.company_id = c.id
       WHERE c.tenant_id = $1
       GROUP BY c.id
       ORDER BY c.name`,
      [tenantId],
    );
  }

  async findOne(id: string, tenantId: string) {
    const company = await this.repo.findOne({ where: { id, tenantId } as any });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async getContacts(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.db.query(
      `SELECT id, full_name, email, phone, created_at FROM contacts WHERE company_id = $1 AND tenant_id = $2 ORDER BY full_name`,
      [id, tenantId],
    );
  }

  async getDeals(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.db.query(
      `SELECT d.id, d.title, d.value, d.status, d.created_at,
              ps.name AS stage_name, p.name AS pipeline_name
       FROM deals d
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       LEFT JOIN pipelines p ON p.id = ps.pipeline_id
       WHERE d.company_id = $1 AND d.tenant_id = $2
       ORDER BY d.created_at DESC`,
      [id, tenantId],
    );
  }

  async create(dto: any, tenantId: string) {
    const company = this.repo.create({
      tenantId,
      name: dto.name,
      industry: dto.industry,
      website: dto.website,
    } as any);
    return this.repo.save(company);
  }

  async update(id: string, dto: any, tenantId: string) {
    const company = await this.findOne(id, tenantId);
    Object.assign(company, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.industry !== undefined && { industry: dto.industry }),
      ...(dto.website !== undefined && { website: dto.website }),
    });
    return this.repo.save(company);
  }

  async remove(id: string, tenantId: string) {
    const company = await this.findOne(id, tenantId);
    await this.repo.remove(company);
  }
}
