import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ContentPost } from './entities/content-post.entity';
import { Connection } from '../connections/connection.entity';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { ContentPublishProcessor } from './content-publish.processor';
import { CONTENT_PUBLISH_QUEUE } from './content-publish.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentPost, Connection]),
    BullModule.registerQueue({ name: CONTENT_PUBLISH_QUEUE }),
  ],
  controllers: [ContentController],
  providers: [ContentService, ContentPublishProcessor],
})
export class ContentModule {}
