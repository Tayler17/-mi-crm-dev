import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, PlatformSettingsService],
  exports: [SettingsService, PlatformSettingsService],
})
export class SettingsModule {}
