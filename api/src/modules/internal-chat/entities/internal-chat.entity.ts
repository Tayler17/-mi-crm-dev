import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { InternalChatMember } from './internal-chat-member.entity';
import { InternalChatMessage } from './internal-chat-message.entity';

@Entity('internal_chats')
export class InternalChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ name: 'is_group', default: false })
  isGroup: boolean;

  @OneToMany(() => InternalChatMember, (m) => m.chat, { eager: true })
  members: InternalChatMember[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
