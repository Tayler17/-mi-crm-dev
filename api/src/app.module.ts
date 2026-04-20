import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DealsModule } from './modules/deals/deals.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { InboxesModule } from './modules/inboxes/inboxes.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AuditModule } from './modules/audit/audit.module';
import { TagsModule } from './modules/tags/tags.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { InternalChatModule } from './modules/internal-chat/internal-chat.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CallBotsModule } from './modules/call-bots/call-bots.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ContactListsModule } from './modules/contact-lists/contact-lists.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { QueuesModule } from './modules/queues/queues.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FlowsModule } from './modules/flows/flows.module';
import { AiChatbotsModule } from './modules/ai-chatbots/ai-chatbots.module';
import { AiPromptsModule } from './modules/ai-prompts/ai-prompts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PlansModule } from './modules/plans/plans.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [__dirname + '/modules/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    ContactsModule,
    DealsModule,
    PipelinesModule,
    TasksModule,
    InboxesModule,
    ConversationsModule,
    MessagesModule,
    AuditModule,
    TagsModule,
    SchedulesModule,
    InternalChatModule,
    CampaignsModule,
    CallBotsModule,
    DashboardModule,
    ContactListsModule,
    AppointmentsModule,
    TeamsModule,
    QueuesModule,
    ConnectionsModule,
    CompaniesModule,
    SettingsModule,
    AutomationsModule,
    ReportsModule,
    FlowsModule,
    AiChatbotsModule,
    AiPromptsModule,
    NotificationsModule,
    WebhooksModule,
    PlansModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
