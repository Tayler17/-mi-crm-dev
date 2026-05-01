import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MulterModule } from '@nestjs/platform-express';
import { KB_QUEUE } from './knowledge-base.constants';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { ScraperService } from './scraper.service';
import { EmbeddingsService } from './embeddings.service';
import { KnowledgeIndexerProcessor } from './knowledge-indexer.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: KB_QUEUE }),
    MulterModule.register({}),
  ],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    ScraperService,
    EmbeddingsService,
    KnowledgeIndexerProcessor,
  ],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
