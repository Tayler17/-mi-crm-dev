import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('help_articles')
export class HelpArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'category_id', nullable: true, type: 'uuid' })
  categoryId: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'video_url', nullable: true })
  videoUrl: string | null;

  @Column({ default: 0 })
  position: number;

  @Column({ name: 'is_published', default: true })
  isPublished: boolean;

  @Column({ name: 'is_global', default: false })
  isGlobal: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
