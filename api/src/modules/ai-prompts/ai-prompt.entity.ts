import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_prompts')
export class AiPrompt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenant_id: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ default: 'general' }) category: string;
  @Column({ type: 'text' }) prompt_text: string;
  @Column({ type: 'jsonb', default: [] }) variables: any[];
  @Column({ type: 'uuid', array: true, default: [] }) queue_ids: string[];
  @Column({ default: 'openai' }) provider: string;
  @Column({ default: 'gpt-4o-mini' }) model: string;
  @Column({ type: 'numeric', default: 0.7 }) temperature: number;
  @Column({ default: 300 }) max_tokens: number;
  @Column({ default: true }) is_active: boolean;
  @Column({ default: 0 }) usage_count: number;
  @Column({ nullable: true }) created_by: string;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
