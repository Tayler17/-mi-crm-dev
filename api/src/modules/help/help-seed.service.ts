import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { HelpCategory } from './entities/help-category.entity';
import { HelpArticle } from './entities/help-article.entity';
import { HELP_CATEGORIES, HELP_ARTICLES, SeedArticle } from './help-seed.content';

/**
 * Documents NEW features in the EXISTING help center — it does not rebuild it.
 *
 * - Articles with `categoryNames` are slotted into an existing hand-made category
 *   (matched by name); they inherit that category's visibility.
 * - Articles with `categorySeedKey` go into a NEW category defined in the seed.
 * - OWNER-ONLY content (isGlobal=false on the owner's tenant) is never shown to
 *   tenants.
 *
 * Idempotent: every seeded row carries a stable `seed_key`. We UPSERT by
 * (tenant_id, seed_key) and PRUNE any seed-managed row that is no longer listed
 * here. The user's hand-made content (seed_key IS NULL) is never touched.
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
      // 1. seed_key columns (no migrations in this project).
      await this.categoryRepo.query(`ALTER TABLE help_categories ADD COLUMN IF NOT EXISTS seed_key VARCHAR`);
      await this.articleRepo.query(`ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS seed_key VARCHAR`);

      // 2. Resolve the owner's tenant. Seeded rows live under it; isGlobal decides
      //    visibility. If there is no owner yet, skip silently.
      const owner = await this.categoryRepo.query(
        `SELECT tenant_id FROM users WHERE role = 'owner' AND is_active = true ORDER BY created_at ASC LIMIT 1`,
      );
      const ownerTenantId: string | undefined = owner?.[0]?.tenant_id;
      if (!ownerTenantId) {
        this.logger.warn('No owner user found — skipping help-center seed');
        return;
      }

      // 3. NEW categories (need their ids to link articles).
      const catIdBySeedKey = new Map<string, string>();
      for (const def of HELP_CATEGORIES) {
        catIdBySeedKey.set(def.seedKey, await this.upsertCategory(ownerTenantId, def));
      }

      // 4. Articles — resolve the target category, then upsert.
      for (const def of HELP_ARTICLES) {
        let categoryId: string | null = null;
        let isGlobal = def.isGlobal;

        if (def.categorySeedKey) {
          categoryId = catIdBySeedKey.get(def.categorySeedKey) ?? null;
        } else if (def.categoryNames?.length) {
          const existing = await this.findCategoryByName(ownerTenantId, def.categoryNames);
          if (existing) {
            categoryId = existing.id;
            isGlobal = existing.is_global; // match the host category's visibility
          } else {
            this.logger.warn(`No existing category found for "${def.title}" (tried: ${def.categoryNames.join(', ')})`);
          }
        }

        await this.upsertArticle(ownerTenantId, categoryId, isGlobal, def);
      }

      // 5. PRUNE seed-managed rows that are no longer listed (removes old
      //    duplicates from previous deploys). Only touches this seed's own rows.
      await this.pruneOrphans(ownerTenantId);

      this.logger.log(`Help center updated: +${HELP_CATEGORIES.length} categories, ${HELP_ARTICLES.length} articles`);
    } catch (e) {
      // Never block boot on seeding.
      this.logger.error(`Help-center seed failed: ${(e as Error).message}`);
    }
  }

  private async findCategoryByName(
    tenantId: string,
    names: string[],
  ): Promise<{ id: string; is_global: boolean } | null> {
    const rows = await this.categoryRepo.query(
      `SELECT id, is_global FROM help_categories
        WHERE (tenant_id = $1 OR is_global = true) AND lower(name) = ANY($2)
        ORDER BY is_global DESC
        LIMIT 1`,
      [tenantId, names.map((n) => n.toLowerCase())],
    );
    return rows[0] ?? null;
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
    isGlobal: boolean,
    def: SeedArticle,
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
        [def.title, def.body, categoryId, def.position, isGlobal, def.lang, found[0].id],
      );
      return;
    }
    await this.articleRepo.query(
      `INSERT INTO help_articles (id, tenant_id, category_id, title, body, position, is_published, is_global, lang, seed_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, now(), now())`,
      [randomUUID(), tenantId, categoryId, def.title, def.body, def.position, isGlobal, def.lang, def.seedKey],
    );
  }

  /**
   * Deletes seed-managed rows (seed_key NOT NULL on the owner tenant) that are no
   * longer in the current seed lists — i.e. duplicates created by earlier deploys.
   * Never touches hand-made content (seed_key IS NULL).
   */
  private async pruneOrphans(tenantId: string): Promise<void> {
    const keepArticleKeys = HELP_ARTICLES.map((a) => a.seedKey);
    const keepCategoryKeys = HELP_CATEGORIES.map((c) => c.seedKey);

    await this.articleRepo.query(
      `DELETE FROM help_articles
        WHERE seed_key IS NOT NULL AND tenant_id = $1 AND NOT (seed_key = ANY($2))`,
      [tenantId, keepArticleKeys.length ? keepArticleKeys : ['']],
    );

    // Detach any remaining articles pointing at categories we are about to remove.
    await this.articleRepo.query(
      `UPDATE help_articles SET category_id = NULL
        WHERE category_id IN (
          SELECT id FROM help_categories
           WHERE seed_key IS NOT NULL AND tenant_id = $1 AND NOT (seed_key = ANY($2))
        )`,
      [tenantId, keepCategoryKeys.length ? keepCategoryKeys : ['']],
    );

    await this.categoryRepo.query(
      `DELETE FROM help_categories
        WHERE seed_key IS NOT NULL AND tenant_id = $1 AND NOT (seed_key = ANY($2))`,
      [tenantId, keepCategoryKeys.length ? keepCategoryKeys : ['']],
    );
  }
}
