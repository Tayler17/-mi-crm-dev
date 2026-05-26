import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationFlow } from './flow.entity';
import { FlowsService } from './flows.service';
import { FlowsController } from './flows.controller';
import { FlowRunnerService } from './flow-runner.service';
import { FlowsListenerService } from './flows-listener.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([ConversationFlow]), NotificationsModule],
  controllers: [FlowsController],
  providers: [FlowsService, FlowRunnerService, FlowsListenerService],
  exports: [FlowsService, FlowRunnerService],
})
export class FlowsModule {}
