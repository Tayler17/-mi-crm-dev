import { Module, OnModuleInit } from '@nestjs/common';
import { OutboundWebhooksController } from './outbound-webhooks.controller';
import { OutboundWebhooksService } from './outbound-webhooks.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';

@Module({
  imports: [NotificationsModule],
  controllers: [OutboundWebhooksController],
  providers: [OutboundWebhooksService],
  exports: [OutboundWebhooksService],
})
export class OutboundWebhooksModule implements OnModuleInit {
  constructor(
    private readonly svc: OutboundWebhooksService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Forward SSE events to outbound webhooks — fire-and-forget
    this.notifications['bus$'].subscribe((event: any) => {
      this.svc.fire(event.tenantId, event.type, event.payload).catch(() => {});
    });
  }
}
