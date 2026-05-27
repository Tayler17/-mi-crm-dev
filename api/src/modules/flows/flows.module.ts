import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationFlow } from './flow.entity';
import { FlowsService } from './flows.service';
import { FlowsController } from './flows.controller';
import { FlowRunnerService } from './flow-runner.service';
import { FlowsListenerService } from './flows-listener.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [TypeOrmModule.forFeature([ConversationFlow]), NotificationsModule, ConnectionsModule],
  controllers: [FlowsController],
  providers: [FlowsService, FlowRunnerService, FlowsListenerService],
  exports: [FlowsService, FlowRunnerService],
})
export class FlowsModule {}
