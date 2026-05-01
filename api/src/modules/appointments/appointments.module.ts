import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentWorkerService } from './appointment-worker.service';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment]), ConnectionsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentWorkerService],
})
export class AppointmentsModule {}
