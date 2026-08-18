import { Module } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { PublicApiController } from './public-api.controller';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  controllers: [PublicApiController, ApiKeysController],
  providers: [PublicApiService, ApiKeyGuard],
  exports: [PublicApiService],
})
export class PublicApiModule {}
