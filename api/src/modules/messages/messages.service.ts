import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { CreateMessageDto, CreateNoteDto } from './dto/message.dto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly repo: Repository<Message>,
  ) {}

  findByConversation(conversationId: string, tenantId: string) {
    return this.repo.find({
      where: { conversationId, tenantId, isPrivate: false },
      order: { createdAt: 'ASC' },
    });
  }

  findNotesByConversation(conversationId: string, tenantId: string) {
    return this.repo.find({
      where: { conversationId, tenantId, isPrivate: true },
      order: { createdAt: 'ASC' },
    });
  }

  create(conversationId: string, dto: CreateMessageDto, tenantId: string, senderId?: string) {
    return this.repo.save(this.repo.create({
      conversationId,
      tenantId,
      senderId,
      body: dto.body,
      contentType: dto.contentType || 'text',
      direction: dto.direction || 'outbound',
      senderType: 'agent',
      isPrivate: false,
    }));
  }

  createNote(conversationId: string, dto: CreateNoteDto, tenantId: string, senderId?: string) {
    return this.repo.save(this.repo.create({
      conversationId,
      tenantId,
      senderId,
      body: dto.body,
      contentType: 'text',
      direction: 'outbound',
      senderType: 'agent',
      isPrivate: true,
    }));
  }
}
