import { Module } from '@nestjs/common';
import { CsatController } from './csat.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CsatController],
})
export class CsatModule {}
