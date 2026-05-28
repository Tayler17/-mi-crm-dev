import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiPrompt } from './ai-prompt.entity';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import axios from 'axios';

@Injectable()
export class AiPromptsService {
  constructor(
    @InjectRepository(AiPrompt) private readonly repo: Repository<AiPrompt>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
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

  // Run prompt with variable substitution and actually call the AI provider
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

    // Resolve API key — same logic as ai-chatbot-engine
    const platformAI = await this.platformSettings.getAI().catch(() => null);
    const [tenantRow] = await this.db.query(
      `SELECT t.settings, p.allow_own_api_keys
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1 LIMIT 1`,
      [tenantId],
    ).catch(() => [null]);
    const allowOwnApiKeys: boolean = tenantRow?.allow_own_api_keys ?? false;
    const tenantKeys: Record<string, string> = tenantRow?.settings?.aiKeys ?? {};

    const provider = prompt.provider || platformAI?.provider || 'openai';
    const model = prompt.model || platformAI?.model || 'gpt-4o-mini';
    const temperature = prompt.temperature ?? 0.7;
    const maxTokens = prompt.max_tokens ?? 500;

    let apiKey: string | null = null;
    if (allowOwnApiKeys) {
      apiKey = tenantKeys[provider] || platformAI?.apiKey || null;
    } else {
      apiKey = platformAI?.apiKey || null;
    }

    let result: string | null = null;
    let aiError: string | null = null;

    if (apiKey) {
      try {
        if (provider === 'openai') {
          const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            { model, messages: [{ role: 'user', content: filledPrompt }], temperature, max_tokens: maxTokens },
            { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 },
          );
          result = res.data?.choices?.[0]?.message?.content?.trim() ?? null;
        } else if (provider === 'anthropic') {
          const res = await axios.post(
            'https://api.anthropic.com/v1/messages',
            { model, max_tokens: maxTokens, messages: [{ role: 'user', content: filledPrompt }] },
            { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 30000 },
          );
          result = res.data?.content?.[0]?.text?.trim() ?? null;
        } else if (provider === 'gemini') {
          const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: filledPrompt }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
          );
          result = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
        }
      } catch (e: any) {
        aiError = e?.response?.data?.error?.message ?? e?.message ?? 'AI call failed';
      }
    } else {
      aiError = 'No API key configured. Configure it in Settings → Integrations.';
    }

    return {
      prompt_id: id,
      result: result ?? filledPrompt,
      filled_prompt: filledPrompt,
      ai_generated: result !== null,
      ai_error: aiError,                        // null when AI succeeded
      provider,
      model,
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
