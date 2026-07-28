import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { CreateMessageDto, CreateNoteDto } from './dto/message.dto';

@Injectable()
export class MessagesService implements OnModuleInit {
  constructor(
    @InjectRepository(Message)
    private readonly repo: Repository<Message>,
  ) {}

  async onModuleInit() {
    await this.repo.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    `).catch(() => {});
    // Q2: track how many times a conversation has been reopened. Each reopen counts as a
    // separate "session" for reporting, while the chat history stays unified in one record.
    await this.repo.query(
      `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS session_count integer NOT NULL DEFAULT 1`,
    ).catch(() => {});
  }

  /** Fetch a message scoped to tenant + conversation (for edit/delete). */
  async findOneOwned(messageId: string, conversationId: string, tenantId: string) {
    return this.repo.findOne({ where: { id: messageId, conversationId, tenantId } });
  }

  async markEdited(messageId: string, body: string) {
    await this.repo.update(messageId, { body, editedAt: new Date() });
  }

  async markDeleted(messageId: string) {
    await this.repo.update(messageId, { deletedAt: new Date() });
  }

  findByConversation(conversationId: string, tenantId: string) {
    return this.repo.find({
      where: { conversationId, tenantId, isPrivate: false },
      order: { createdAt: 'ASC' },
      take: 500,
    });
  }

  findNotesByConversation(conversationId: string, tenantId: string) {
    return this.repo.find({
      where: { conversationId, tenantId, isPrivate: true },
      order: { createdAt: 'ASC' },
      take: 200,
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
      replyToMessageId: dto.replyToMessageId || null,
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
