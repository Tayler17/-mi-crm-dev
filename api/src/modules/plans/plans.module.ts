import { Module } from '@nestjs/common';
import { PlansController, PlansPublicController } from './plans.controller';

@Module({
  controllers: [PlansPublicController, PlansController],
})
export class PlansModule {}
