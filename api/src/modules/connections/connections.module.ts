import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Connection } from './connection.entity';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { MetaOAuthController } from './meta-oauth.controller';
import { WhatsappWebService } from './whatsapp-web.service';
import { SmsService } from './sms.service';
import { SmsWebhookController } from './sms-webhook.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Connection]), EventEmitterModule, NotificationsModule, SettingsModule],
  controllers: [ConnectionsController, MetaOAuthController, SmsWebhookController],
  providers: [ConnectionsService, WhatsappWebService, SmsService],
  exports: [ConnectionsService, WhatsappWebService, SmsService],
})
export class ConnectionsModule {}
