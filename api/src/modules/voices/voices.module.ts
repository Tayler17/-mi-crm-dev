import { Module } from '@nestjs/common';
import { VoicesService } from './voices.service';
import { VoicesController } from './voices.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [VoicesService],
  controllers: [VoicesController],
  exports: [VoicesService],
})
export class VoicesModule {}
