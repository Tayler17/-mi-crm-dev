import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { InternalChat } from './internal-chat.entity';

@Entity('internal_chat_members')
export class InternalChatMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id' })
  chatId: string;

  @ManyToOne(() => InternalChat, (c) => c.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: InternalChat;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
