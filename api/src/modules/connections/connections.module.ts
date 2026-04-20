import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Connection } from './connection.entity';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { WhatsappWebService } from './whatsapp-web.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Connection]), EventEmitterModule, NotificationsModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, WhatsappWebService],
  exports: [ConnectionsService, WhatsappWebService],
})
export class ConnectionsModule {}
