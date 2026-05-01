import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ScheduleModule.forRoot(), SettingsModule],
  providers: [BackupsService],
  controllers: [BackupsController],
  exports: [BackupsService],
})
export class BackupsModule {}
