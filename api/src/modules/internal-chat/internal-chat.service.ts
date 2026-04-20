import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InternalChat } from './entities/internal-chat.entity';
import { InternalChatMember } from './entities/internal-chat-member.entity';
import { InternalChatMessage } from './entities/internal-chat-message.entity';
import { CreateChatDto, SendMessageDto } from './dto/internal-chat.dto';

@Injectable()
export class InternalChatService {
  constructor(
    @InjectRepository(InternalChat)
    private readonly chatRepo: Repository<InternalChat>,
    @InjectRepository(InternalChatMember)
    private readonly memberRepo: Repository<InternalChatMember>,
    @InjectRepository(InternalChatMessage)
    private readonly msgRepo: Repository<InternalChatMessage>,
  ) {}

  // List all chats where the current user is a member
  async findMyChats(tenantId: string, userId: string) {
    const memberships = await this.memberRepo.find({ where: { userId } });
    if (!memberships.length) return [];

    const chatIds = memberships.map((m) => m.chatId);
    const chats = await this.chatRepo.find({
      where: { id: In(chatIds), tenantId },
      relations: ['members'],
      order: { updatedAt: 'DESC' },
    });

    // Enrich with last message and unread count per chat
    const result = await Promise.all(
      chats.map(async (chat) => {
        const lastMsg = await this.msgRepo.findOne({
          where: { chatId: chat.id },
          order: { createdAt: 'DESC' },
        });

        // Unread = messages after the last read timestamp
        const readRow = await this.msgRepo.query(
          `SELECT read_at FROM internal_chat_reads WHERE chat_id = $1 AND user_id = $2`,
          [chat.id, userId],
        );
        const readAt = readRow[0]?.read_at ?? new Date(0);
        const unread = await this.msgRepo.count({
          where: { chatId: chat.id },
        }).then(async () => {
          const rows = await this.msgRepo.query(
            `SELECT COUNT(*)::int AS cnt FROM internal_chat_messages WHERE chat_id = $1 AND created_at > $2 AND sender_id != $3`,
            [chat.id, readAt, userId],
          );
          return rows[0]?.cnt ?? 0;
        });

        // Resolve member user info via raw query
        const memberInfos = await this.msgRepo.query(
          `SELECT u.id, u.full_name, u.email FROM users u WHERE u.id = ANY($1::uuid[])`,
          [chat.members.map((m) => m.userId)],
        );

        return {
          ...chat,
          lastMessage: lastMsg ? { body: lastMsg.body, senderId: lastMsg.senderId, createdAt: lastMsg.createdAt } : null,
          unreadCount: unread,
          memberDetails: memberInfos,
        };
      }),
    );

    return result;
  }

  // Find or create a DM between two users
  async findOrCreateDm(tenantId: string, userId: string, dto: CreateChatDto) {
    // Look for existing DM between these two users
    const existing = await this.chatRepo.query(
      `SELECT c.id FROM internal_chats c
       JOIN internal_chat_members m1 ON m1.chat_id = c.id AND m1.user_id = $2
       JOIN internal_chat_members m2 ON m2.chat_id = c.id AND m2.user_id = $3
       WHERE c.tenant_id = $1 AND c.is_group = false
       LIMIT 1`,
      [tenantId, userId, dto.targetUserId],
    );

    if (existing.length > 0) {
      return this.chatRepo.findOne({ where: { id: existing[0].id }, relations: ['members'] });
    }

    // Create new DM
    const chat = await this.chatRepo.save(
      this.chatRepo.create({ tenantId, isGroup: false }),
    );
    await this.memberRepo.save([
      this.memberRepo.create({ chatId: chat.id, userId }),
      this.memberRepo.create({ chatId: chat.id, userId: dto.targetUserId }),
    ]);
    return this.chatRepo.findOne({ where: { id: chat.id }, relations: ['members'] });
  }

  async getMessages(chatId: string, tenantId: string, userId: string, limit = 50) {
    await this.ensureMember(chatId, userId);
    const msgs = await this.msgRepo.find({
      where: { chatId, tenantId },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    // Enrich sender names
    const senderIds = [...new Set(msgs.map((m) => m.senderId))];
    const senders = senderIds.length
      ? await this.msgRepo.query(
          `SELECT id, full_name, email FROM users WHERE id = ANY($1::uuid[])`,
          [senderIds],
        )
      : [];
    const senderMap = Object.fromEntries(senders.map((s: any) => [s.id, s]));

    return msgs.map((m) => ({
      ...m,
      sender: senderMap[m.senderId] ?? { id: m.senderId },
    }));
  }

  async sendMessage(chatId: string, tenantId: string, userId: string, dto: SendMessageDto) {
    await this.ensureMember(chatId, userId);
    const msg = await this.msgRepo.save(
      this.msgRepo.create({ chatId, tenantId, senderId: userId, body: dto.body }),
    );
    // touch updated_at on the chat
    await this.chatRepo.update(chatId, { updatedAt: new Date() });
    return msg;
  }

  async markRead(chatId: string, userId: string) {
    await this.msgRepo.query(
      `INSERT INTO internal_chat_reads (chat_id, user_id, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET read_at = NOW()`,
      [chatId, userId],
    );
    return { ok: true };
  }

  private async ensureMember(chatId: string, userId: string) {
    const m = await this.memberRepo.findOne({ where: { chatId, userId } });
    if (!m) throw new ForbiddenException('Not a member of this chat');
  }
}
