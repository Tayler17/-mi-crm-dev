import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_chatbots')
export class AiChatbot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenant_id: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ default: 'inactive' }) status: string;
  @Column({ default: 'openai' }) provider: string;
  @Column({ default: 'gpt-4o-mini' }) model: string;
  @Column({ nullable: true, type: 'text' }) system_prompt: string;
  @Column({ nullable: true }) welcome_message: string;
  @Column({ nullable: true }) fallback_message: string;
  @Column({ nullable: true }) handoff_keyword: string;
  @Column({ nullable: true }) handoff_message: string;
  @Column({ default: 500 }) max_tokens: number;
  @Column({ type: 'numeric', default: 0.7 }) temperature: number;
  @Column({ default: 5 }) memory_conversations: number;
  @Column({ type: 'uuid', array: true, default: [] }) inbox_ids: string[];
  @Column({ type: 'uuid', array: true, default: [] }) queue_ids: string[];
  @Column({ default: 0 }) total_conversations: number;
  @Column({ default: 0 }) handoff_count: number;
  @Column({ nullable: true }) created_by: string;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
