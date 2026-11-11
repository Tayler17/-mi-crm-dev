import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { BlogService, BlogPostInput } from './blog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** OWNER-only blog management (create / edit / publish / delete). The blog is a
 *  platform resource (AutoMarkIQ's own site), so only the platform owner manages it,
 *  same gate as the Voice Catalog. */
@Controller('blog-admin')
@UseGuards(JwtAuthGuard)
export class BlogAdminController {
  constructor(private readonly svc: BlogService) {}

  private assertOwner(req: any) {
    if (req.user?.role !== 'owner') {
      throw new ForbiddenException('Solo el propietario puede gestionar el blog.');
    }
  }

  @Get()
  list(@Request() req: any) {
    this.assertOwner(req);
    return this.svc.adminList();
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Request() req: any) {
    this.assertOwner(req);
    return this.svc.adminGet(id);
  }

  @Post()
  create(@Body() body: BlogPostInput, @Request() req: any) {
    this.assertOwner(req);
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: BlogPostInput, @Request() req: any) {
    this.assertOwner(req);
    return this.svc.update(id, body);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Query('publish') publish: string, @Request() req: any) {
    this.assertOwner(req);
    // ?publish=false unpublishes; anything else (or absent) publishes.
    return this.svc.setPublished(id, publish !== 'false');
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    this.assertOwner(req);
    return this.svc.remove(id);
  }
}
