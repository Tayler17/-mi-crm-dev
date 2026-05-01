import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpCategory } from './entities/help-category.entity';
import { HelpArticle } from './entities/help-article.entity';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateArticleDto, UpdateArticleDto,
} from './dto/help.dto';

@Injectable()
export class HelpService {
  constructor(
    @InjectRepository(HelpCategory)
    private readonly categoryRepo: Repository<HelpCategory>,
    @InjectRepository(HelpArticle)
    private readonly articleRepo: Repository<HelpArticle>,
  ) {}

  // ── Categories ────────────────────────────────────────────────────────────

  getCategories(tenantId: string) {
    return this.categoryRepo.find({
      where: [{ tenantId }, { isGlobal: true }],
      order: { isGlobal: 'DESC', position: 'ASC', createdAt: 'ASC' },
    });
  }

  async createCategory(dto: CreateCategoryDto, tenantId: string, role: string) {
    if (dto.isGlobal && role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede crear contenido global');
    }
    const cat = this.categoryRepo.create({
      ...dto,
      tenantId,
      position: dto.position ?? 0,
      isGlobal: dto.isGlobal ?? false,
    });
    return this.categoryRepo.save(cat);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, tenantId: string, role: string) {
    const cat = await this.categoryRepo.findOne({
      where: [{ id, tenantId }, { id, isGlobal: true }],
    });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    if (cat.isGlobal && role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede editar contenido global');
    }
    if (!cat.isGlobal && cat.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    Object.assign(cat, dto);
    return this.categoryRepo.save(cat);
  }

  async deleteCategory(id: string, tenantId: string, role: string) {
    const cat = await this.categoryRepo.findOne({
      where: [{ id, tenantId }, { id, isGlobal: true }],
    });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    if (cat.isGlobal && role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede eliminar contenido global');
    }
    if (!cat.isGlobal && cat.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    await this.articleRepo.update({ categoryId: id }, { categoryId: null });
    await this.categoryRepo.remove(cat);
  }

  // ── Articles ──────────────────────────────────────────────────────────────

  getArticles(tenantId: string, categoryId?: string, includeUnpublished = false) {
    const baseWhere: any = includeUnpublished ? {} : { isPublished: true };
    const where = categoryId
      ? [
          { ...baseWhere, tenantId, categoryId },
          { ...baseWhere, isGlobal: true, categoryId },
        ]
      : [
          { ...baseWhere, tenantId },
          { ...baseWhere, isGlobal: true },
        ];
    return this.articleRepo.find({ where, order: { isGlobal: 'DESC', position: 'ASC', createdAt: 'ASC' } });
  }

  async getArticle(id: string, tenantId: string) {
    const article = await this.articleRepo.findOne({
      where: [{ id, tenantId }, { id, isGlobal: true }],
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    return article;
  }

  async createArticle(dto: CreateArticleDto, tenantId: string, role: string) {
    if (dto.isGlobal && role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede crear contenido global');
    }
    const article = this.articleRepo.create({
      ...dto,
      tenantId,
      categoryId: dto.categoryId ?? null,
      position: dto.position ?? 0,
      isPublished: dto.isPublished ?? true,
      isGlobal: dto.isGlobal ?? false,
    });
    return this.articleRepo.save(article);
  }

  async updateArticle(id: string, dto: UpdateArticleDto, tenantId: string, role: string) {
    const article = await this.articleRepo.findOne({
      where: [{ id, tenantId }, { id, isGlobal: true }],
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    if (article.isGlobal && role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede editar contenido global');
    }
    if (!article.isGlobal && article.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    Object.assign(article, dto);
    return this.articleRepo.save(article);
  }

  async deleteArticle(id: string, tenantId: string, role: string) {
    const article = await this.articleRepo.findOne({
      where: [{ id, tenantId }, { id, isGlobal: true }],
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    if (article.isGlobal && role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede eliminar contenido global');
    }
    if (!article.isGlobal && article.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    await this.articleRepo.remove(article);
  }

  // ── Full tree (categories + their articles) ───────────────────────────────

  async getTree(tenantId: string, isAdmin = false) {
    const categories = await this.getCategories(tenantId);
    const articles = await this.getArticles(tenantId, undefined, isAdmin);

    return categories.map((cat) => ({
      ...cat,
      articles: articles
        .filter((a) => a.categoryId === cat.id)
        .sort((a, b) => a.position - b.position),
    }));
  }
}
