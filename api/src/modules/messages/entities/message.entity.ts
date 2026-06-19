import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column({ name: 'sender_type', default: 'agent' })
  senderType: string;

  @Column({ name: 'sender_id', nullable: true })
  senderId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'content_type', default: 'text' })
  contentType: string;

  @Column({ default: 'outbound' })
  direction: string;

  @Column({ name: 'is_private', default: false })
  isPrivate: boolean;

  @Column({ default: 'sent' })
  status: string;

  @Column({ name: 'external_id', nullable: true })
  externalId: string;

  @Column({ name: 'reply_to_message_id', type: 'uuid', nullable: true })
  replyToMessageId: string | null;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
