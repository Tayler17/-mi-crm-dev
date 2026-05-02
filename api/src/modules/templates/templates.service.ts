import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

export interface TemplateTag     { name: string; color: string }
export interface TemplateCanned  { title: string; shortCode: string; category: string; content: string }
export interface TemplateQueue   { name: string; description: string }
export interface TemplatePipeline { name: string; stages: string[] }
export interface TemplateCallBot {
  name: string;
  language: string;
  voiceType: string;
  welcomeMessage: string;
  systemPrompt: string;
  fallbackMessage: string;
  handoffKeyword: string;
  maxCallDuration: number;
}

interface Template {
  slug: string;
  name: string;
  description: string;
  icon: string;
  pipelines: TemplatePipeline[];
  tags: TemplateTag[];
  cannedResponses: TemplateCanned[];
  queues: TemplateQueue[];
  callBots?: TemplateCallBot[];
}

@Injectable()
export class TemplatesService {
  private readonly templates: Map<string, Template>;

  constructor(@InjectDataSource() private readonly db: DataSource) {
    this.templates = this.loadTemplates();
  }

  private loadTemplates(): Map<string, Template> {
    const dataDir = path.join(__dirname, 'data');
    const map = new Map<string, Template>();
    for (const file of fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
      const tpl: Template = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
      map.set(tpl.slug, tpl);
    }
    return map;
  }

  list() {
    return [...this.templates.values()].map(({ slug, name, description, icon, pipelines, tags, cannedResponses, queues, callBots }) => ({
      slug, name, description, icon,
      counts: {
        pipelines: pipelines.length,
        tags: tags.length,
        cannedResponses: cannedResponses.length,
        queues: queues.length,
        callBots: (callBots ?? []).length,
      },
      pipelines,
      tags,
      cannedResponses,
      queues,
      callBots: callBots ?? [],
    }));
  }

  async apply(slug: string, tenantId: string): Promise<{ applied: Record<string, number> }> {
    const tpl = this.templates.get(slug);
    if (!tpl) throw new NotFoundException(`Template "${slug}" no encontrado`);

    const applied = { pipelines: 0, stages: 0, tags: 0, cannedResponses: 0, queues: 0, callBots: 0 };

    // ── Pipelines + stages ──────────────────────────────────────────────────
    for (const p of tpl.pipelines) {
      const [existing] = await this.db.query(
        `SELECT id FROM pipelines WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [tenantId, p.name],
      );
      let pipelineId: string;
      if (existing) {
        pipelineId = existing.id;
      } else {
        const [row] = await this.db.query(
          `INSERT INTO pipelines (tenant_id, name, is_default, created_at, updated_at)
           VALUES ($1, $2, false, NOW(), NOW()) RETURNING id`,
          [tenantId, p.name],
        );
        pipelineId = row.id;
        applied.pipelines++;
      }

      for (let i = 0; i < p.stages.length; i++) {
        const [stageExists] = await this.db.query(
          `SELECT id FROM pipeline_stages WHERE tenant_id = $1 AND pipeline_id = $2 AND LOWER(name) = LOWER($3) LIMIT 1`,
          [tenantId, pipelineId, p.stages[i]],
        );
        if (!stageExists) {
          await this.db.query(
            `INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, position, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [tenantId, pipelineId, p.stages[i], i],
          );
          applied.stages++;
        }
      }
    }

    // ── Tags ────────────────────────────────────────────────────────────────
    for (const tag of tpl.tags) {
      const [exists] = await this.db.query(
        `SELECT id FROM tags WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [tenantId, tag.name],
      );
      if (!exists) {
        await this.db.query(
          `INSERT INTO tags (tenant_id, name, color, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [tenantId, tag.name, tag.color],
        );
        applied.tags++;
      }
    }

    // ── Canned responses ────────────────────────────────────────────────────
    for (const cr of tpl.cannedResponses) {
      const [exists] = await this.db.query(
        `SELECT id FROM canned_responses WHERE tenant_id = $1 AND short_code = $2 LIMIT 1`,
        [tenantId, cr.shortCode],
      );
      if (!exists) {
        await this.db.query(
          `INSERT INTO canned_responses (tenant_id, title, content, short_code, category, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [tenantId, cr.title, cr.content, cr.shortCode, cr.category],
        );
        applied.cannedResponses++;
      }
    }

    // ── Queues ──────────────────────────────────────────────────────────────
    for (const q of tpl.queues) {
      const [exists] = await this.db.query(
        `SELECT id FROM queues WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [tenantId, q.name],
      );
      if (!exists) {
        await this.db.query(
          `INSERT INTO queues (tenant_id, name, description, priority, max_wait_minutes, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, 0, 60, true, NOW(), NOW())`,
          [tenantId, q.name, q.description],
        );
        applied.queues++;
      }
    }

    // ── Call Bots ────────────────────────────────────────────────────────────
    for (const bot of tpl.callBots ?? []) {
      const [exists] = await this.db.query(
        `SELECT id FROM call_bots WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [tenantId, bot.name],
      );
      if (!exists) {
        await this.db.query(
          `INSERT INTO call_bots
             (tenant_id, name, language, voice_type, welcome_message, system_prompt,
              fallback_message, handoff_keyword, max_call_duration, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW(), NOW())`,
          [
            tenantId,
            bot.name,
            bot.language,
            bot.voiceType,
            bot.welcomeMessage,
            bot.systemPrompt,
            bot.fallbackMessage,
            bot.handoffKeyword,
            bot.maxCallDuration,
          ],
        );
        applied.callBots++;
      }
    }

    return { applied };
  }
}
