import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRule } from './automation-rule.entity';
import { AutomationsService } from './automations.service';
import { AutomationsController } from './automations.controller';
import { AutomationExecutorService } from './automation-executor.service';
import { AutomationsListenerService } from './automations-listener.service';

@Module({
  imports: [TypeOrmModule.forFeature([AutomationRule])],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationExecutorService, AutomationsListenerService],
  exports: [AutomationsService, AutomationExecutorService],
})
export class AutomationsModule {}
