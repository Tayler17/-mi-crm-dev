import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { HelpService } from './help.service';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateArticleDto, UpdateArticleDto,
} from './dto/help.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('help')
@UseGuards(JwtAuthGuard)
export class HelpController {
  constructor(private readonly helpService: HelpService) {}

  // ── Read (all authenticated users) ───────────────────────────────────────

  @Get('tree')
  getTree(@TenantId() tenantId: string, @Request() req: any, @Query('lang') lang?: string) {
    const role = req.user?.role ?? 'agent';
    const isAdmin = role === 'admin' || role === 'owner';
    return this.helpService.getTree(tenantId, isAdmin, lang ?? 'es');
  }

  @Get('categories')
  getCategories(@TenantId() tenantId: string) {
    return this.helpService.getCategories(tenantId);
  }

  @Get('articles')
  getArticles(
    @TenantId() tenantId: string,
    @Query('categoryId') categoryId?: string,
    @Query('lang') lang?: string,
    @Request() req?: any,
  ) {
    const role = req?.user?.role ?? 'agent';
    const isAdmin = role === 'admin' || role === 'owner';
    return this.helpService.getArticles(tenantId, categoryId, isAdmin, lang ?? 'es');
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.helpService.getArticle(id, tenantId);
  }

  // ── Write (admin or owner) ────────────────────────────────────────────────

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.helpService.createCategory(dto, tenantId, req.user?.role ?? 'agent');
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    return this.helpService.updateCategory(id, dto, tenantId, req.user?.role ?? 'agent');
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.helpService.deleteCategory(id, tenantId, req.user?.role ?? 'agent');
  }

  @Post('articles')
  createArticle(@Body() dto: CreateArticleDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.helpService.createArticle(dto, tenantId, req.user?.role ?? 'agent');
  }

  @Patch('articles/:id')
  updateArticle(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    return this.helpService.updateArticle(id, dto, tenantId, req.user?.role ?? 'agent');
  }

  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.helpService.deleteArticle(id, tenantId, req.user?.role ?? 'agent');
  }
}
