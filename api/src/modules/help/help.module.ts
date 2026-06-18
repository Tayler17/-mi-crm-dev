import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpCategory } from './entities/help-category.entity';
import { HelpArticle } from './entities/help-article.entity';
import { HelpService } from './help.service';
import { HelpSeedService } from './help-seed.service';
import { HelpController } from './help.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HelpCategory, HelpArticle])],
  providers: [HelpService, HelpSeedService],
  controllers: [HelpController],
})
export class HelpModule {}
