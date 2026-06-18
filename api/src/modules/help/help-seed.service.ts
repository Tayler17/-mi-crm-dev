import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { HelpCategory } from './entities/help-category.entity';
import { HelpArticle } from './entities/help-article.entity';
import { HELP_CATEGORIES, HELP_ARTICLES } from './help-seed.content';

/**
 * Seeds the Help Center with the official, code-managed articles.
 *
 * - GLOBAL content (isGlobal=true)  → every tenant sees it (end-user features).
 * - OWNER-ONLY content (isGlobal=false on the owner's tenant) → only the owner
 *   sees it (platform settings/API keys, billing, deploy, voice-catalog config).
 *
 * Idempotent: every row carries a stable `seed_key`. On each boot we UPSERT by
 * (tenant_id, seed_key), so re-deploys refresh the text without duplicating and
 * without ever touching content the user created by hand (seed_key IS NULL).
 */
@Injectable()
export class HelpSeedService implements OnModuleInit {
  private readonly logger = new Logger('HelpSeed');

  constructor(
    @InjectRepository(HelpCategory)
    private readonly categoryRepo: Repository<HelpCategory>,
    @InjectRepository(HelpArticle)
    private readonly articleRepo: Repository<HelpArticle>,
  ) {}

  async onModuleInit() {
    try {
      // 1. seed_key columns (no migrations in this project) + dedup safety index.
      await this.categoryRepo.query(`ALTER TABLE help_categories ADD COLUMN IF NOT EXISTS seed_key VARCHAR`);
      await this.articleRepo.query(`ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS seed_key VARCHAR`);

      // 2. Resolve the owner's tenant. All seeded rows live under it; isGlobal
      //    decides visibility. If there is no owner yet, skip silently.
      const owner = await this.categoryRepo.query(
        `SELECT tenant_id FROM users WHERE role = 'owner' AND is_active = true ORDER BY created_at ASC LIMIT 1`,
      );
      const ownerTenantId: string | undefined = owner?.[0]?.tenant_id;
      if (!ownerTenantId) {
        this.logger.warn('No owner user found — skipping help-center seed');
        return;
      }

      // 3. Categories first (need their ids to link articles).
      const catIdBySeedKey = new Map<string, string>();
      for (const def of HELP_CATEGORIES) {
        catIdBySeedKey.set(def.seedKey, await this.upsertCategory(ownerTenantId, def));
      }

      // 4. Articles.
      let count = 0;
      for (const def of HELP_ARTICLES) {
        const categoryId = catIdBySeedKey.get(def.categorySeedKey) ?? null;
        await this.upsertArticle(ownerTenantId, categoryId, def);
        count++;
      }

      this.logger.log(`Help center seeded: ${HELP_CATEGORIES.length} categories, ${count} articles`);
    } catch (e) {
      // Never block boot on seeding.
      this.logger.error(`Help-center seed failed: ${(e as Error).message}`);
    }
  }

  private async upsertCategory(
    tenantId: string,
    def: { seedKey: string; name: string; icon: string; position: number; isGlobal: boolean },
  ): Promise<string> {
    const found = await this.categoryRepo.query(
      `SELECT id FROM help_categories WHERE tenant_id = $1 AND seed_key = $2 LIMIT 1`,
      [tenantId, def.seedKey],
    );
    if (found.length) {
      await this.categoryRepo.query(
        `UPDATE help_categories SET name = $1, icon = $2, position = $3, is_global = $4, updated_at = now() WHERE id = $5`,
        [def.name, def.icon, def.position, def.isGlobal, found[0].id],
      );
      return found[0].id;
    }
    const id = randomUUID();
    await this.categoryRepo.query(
      `INSERT INTO help_categories (id, tenant_id, name, icon, position, is_global, seed_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
      [id, tenantId, def.name, def.icon, def.position, def.isGlobal, def.seedKey],
    );
    return id;
  }

  private async upsertArticle(
    tenantId: string,
    categoryId: string | null,
    def: { seedKey: string; title: string; body: string; position: number; isGlobal: boolean; lang: string },
  ): Promise<void> {
    const found = await this.articleRepo.query(
      `SELECT id FROM help_articles WHERE tenant_id = $1 AND seed_key = $2 LIMIT 1`,
      [tenantId, def.seedKey],
    );
    if (found.length) {
      await this.articleRepo.query(
        `UPDATE help_articles
           SET title = $1, body = $2, category_id = $3, position = $4, is_global = $5, lang = $6, is_published = true, updated_at = now()
         WHERE id = $7`,
        [def.title, def.body, categoryId, def.position, def.isGlobal, def.lang, found[0].id],
      );
      return;
    }
    await this.articleRepo.query(
      `INSERT INTO help_articles (id, tenant_id, category_id, title, body, position, is_published, is_global, lang, seed_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, now(), now())`,
      [randomUUID(), tenantId, categoryId, def.title, def.body, def.position, def.isGlobal, def.lang, def.seedKey],
    );
  }
}
