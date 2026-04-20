import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { CannedResponse } from './entities/canned-response.entity';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { CannedResponsesService } from './canned-responses.service';
import { CannedResponsesController } from './canned-responses.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, CannedResponse]), AuditModule],
  providers: [ConversationsService, CannedResponsesService],
  controllers: [ConversationsController, CannedResponsesController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
