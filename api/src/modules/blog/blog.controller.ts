import { Controller, Get, Param, Query, Header } from '@nestjs/common';
import { BlogService } from './blog.service';

/** PUBLIC blog endpoints (no auth) — consumed by the landing's /blog pages.
 *  Only PUBLISHED posts are ever returned here. CORS open so the page can also
 *  be rendered/embedded from anywhere, same as the webchat widget. */
@Controller('blog')
export class BlogController {
  constructor(private readonly svc: BlogService) {}

  @Get()
  @Header('Access-Control-Allow-Origin', '*')
  list(@Query('tag') tag?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.svc.listPublished({
      tag: tag || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':slug')
  @Header('Access-Control-Allow-Origin', '*')
  getBySlug(@Param('slug') slug: string) {
    return this.svc.getPublishedBySlug(slug);
  }
}
