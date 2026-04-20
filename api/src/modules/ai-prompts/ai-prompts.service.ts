import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiPrompt } from './ai-prompt.entity';

@Injectable()
export class AiPromptsService {
  constructor(
    @InjectRepository(AiPrompt) private readonly repo: Repository<AiPrompt>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  findAll(tenantId: string, category?: string) {
    const qb = this.repo.createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.usage_count', 'DESC')
      .addOrderBy('p.created_at', 'DESC');
    if (category) qb.andWhere('p.category = :category', { category });
    return qb.getMany();
  }

  async findOne(id: string, tenantId: string) {
    const p = await this.repo.findOne({ where: { id, tenant_id: tenantId } });
    if (!p) throw new NotFoundException('Prompt not found');
    return p;
  }

  async create(dto: any, tenantId: string, userId: string) {
    const p = this.repo.create({ ...dto, tenant_id: tenantId, created_by: userId });
    return this.repo.save(p);
  }

  async update(id: string, dto: any, tenantId: string) {
    const p = await this.findOne(id, tenantId);
    Object.assign(p, dto);
    return this.repo.save(p);
  }

  async remove(id: string, tenantId: string) {
    const p = await this.findOne(id, tenantId);
    return this.repo.remove(p);
  }

  async duplicate(id: string, tenantId: string, userId: string) {
    const p = await this.findOne(id, tenantId);
    const { id: _id, created_at, updated_at, usage_count, ...rest } = p as any;
    return this.repo.save(this.repo.create({ ...rest, name: `${p.name} (copia)`, is_active: false, tenant_id: tenantId, created_by: userId }));
  }

  // Run prompt with variable substitution and call AI provider
  async runPrompt(id: string, tenantId: string, variableValues: Record<string, string>, conversationContext?: string) {
    const prompt = await this.findOne(id, tenantId);

    // Substitute variables into prompt text
    let filledPrompt = prompt.prompt_text;
    for (const [key, val] of Object.entries(variableValues)) {
      filledPrompt = filledPrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
    if (conversationContext) {
      filledPrompt = `${filledPrompt}\n\nContexto de la conversación:\n${conversationContext}`;
    }

    // Increment usage count
    await this.repo.update(id, { usage_count: () => 'usage_count + 1' } as any);

    // Return the prepared prompt (actual AI call happens client-side or via future AI gateway)
    return {
      prompt_id: id,
      filled_prompt: filledPrompt,
      provider: prompt.provider,
      model: prompt.model,
      temperature: prompt.temperature,
      max_tokens: prompt.max_tokens,
    };
  }

  async getCategories(tenantId: string) {
    const rows = await this.db.query(
      `SELECT category, COUNT(*)::int AS count FROM ai_prompts WHERE tenant_id = $1 GROUP BY category ORDER BY count DESC`,
      [tenantId],
    );
    return rows;
  }
}
