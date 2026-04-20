import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalChat } from './entities/internal-chat.entity';
import { InternalChatMember } from './entities/internal-chat-member.entity';
import { InternalChatMessage } from './entities/internal-chat-message.entity';
import { InternalChatService } from './internal-chat.service';
import { InternalChatController } from './internal-chat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InternalChat, InternalChatMember, InternalChatMessage])],
  controllers: [InternalChatController],
  providers: [InternalChatService],
})
export class InternalChatModule {}
