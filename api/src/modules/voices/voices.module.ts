import { Module } from '@nestjs/common';
import { VoicesService } from './voices.service';
import { VoicesController } from './voices.controller';

@Module({
  providers: [VoicesService],
  controllers: [VoicesController],
  exports: [VoicesService],
})
export class VoicesModule {}
