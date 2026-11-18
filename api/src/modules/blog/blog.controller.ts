import { Controller, Get, Post, Param, Query, Header, Headers, Body, HttpCode } from '@nestjs/common';
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

  /** Inbound webhook for GrandRanker's "Custom API" (and compatible tools). Public, but
   *  authenticated by a Bearer token. Creates/updates/deletes a blog post from the payload. */
  @Post('ingest')
  @HttpCode(200)
  ingest(@Headers('authorization') auth: string, @Body() body: any) {
    return this.svc.ingestExternal(auth, body);
  }

  @Get(':slug')
  @Header('Access-Control-Allow-Origin', '*')
  getBySlug(@Param('slug') slug: string) {
    return this.svc.getPublishedBySlug(slug);
  }
}
