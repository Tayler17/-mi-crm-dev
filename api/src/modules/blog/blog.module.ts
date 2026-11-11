import { Module } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { BlogAdminController } from './blog-admin.controller';

@Module({
  providers: [BlogService],
  controllers: [BlogController, BlogAdminController],
  exports: [BlogService],
})
export class BlogModule {}
