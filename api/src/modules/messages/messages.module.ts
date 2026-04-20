import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { ScheduledMessagesService } from './scheduled-messages.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [TypeOrmModule.forFeature([Message]), NotificationsModule, ConnectionsModule],
  providers: [MessagesService, ScheduledMessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
