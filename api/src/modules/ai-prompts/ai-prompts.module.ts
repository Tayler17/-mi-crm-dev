import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiPrompt } from './ai-prompt.entity';
import { AiPromptsService } from './ai-prompts.service';
import { AiPromptsController } from './ai-prompts.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiPrompt]), SettingsModule],
  controllers: [AiPromptsController],
  providers: [AiPromptsService],
  exports: [AiPromptsService],
})
export class AiPromptsModule {}
