import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { MetaWebhookController } from './meta-webhook.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [WebhooksService],
  controllers: [WebhooksController, MetaWebhookController],
})
export class WebhooksModule {}
