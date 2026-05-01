import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('content_posts')
export class ContentPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ default: 'draft' })
  status: string; // draft | pending_review | approved | published

  @Column({ default: 'blog' })
  channel: string; // blog | instagram | facebook | linkedin | twitter | youtube | other

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  @Column({ name: 'cover_url', nullable: true })
  coverUrl?: string;

  @Column({ name: 'scheduled_at', nullable: true, type: 'timestamptz' })
  scheduledAt?: Date;

  @Column({ name: 'published_at', nullable: true, type: 'timestamptz' })
  publishedAt?: Date;

  @Column({ name: 'author_id', nullable: true, type: 'uuid' })
  authorId?: string;

  @Column({ name: 'author_name', nullable: true })
  authorName?: string;

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo?: string;

  @Column({ name: 'assigned_team', nullable: true })
  assignedTeam?: string;

  @Column({ name: 'media_url', nullable: true })
  mediaUrl?: string;

  @Column({ name: 'media_type', nullable: true })
  mediaType?: string; // image | gif | video

  @Column({ name: 'alt_text', nullable: true })
  altText?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
