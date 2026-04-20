import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inbox } from './entities/inbox.entity';
import { InboxesService } from './inboxes.service';
import { InboxesController } from './inboxes.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Inbox]), AuditModule],
  providers: [InboxesService],
  controllers: [InboxesController],
  exports: [InboxesService],
})
export class InboxesModule {}
