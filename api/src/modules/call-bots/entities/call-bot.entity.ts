import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('call_bots')
export class CallBot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ default: 'inactive' })
  status: string; // active | inactive | draft

  @Column({ name: 'phone_number', nullable: true })
  phoneNumber?: string;

  @Column({ default: 'es-MX' })
  language: string;

  @Column({ name: 'voice_type', default: 'neutral' })
  voiceType: string;

  @Column({ default: 'twilio' })
  provider: string;

  @Column({ name: 'provider_config', type: 'jsonb', default: '{}' })
  providerConfig: Record<string, any>;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt?: string;

  @Column({ name: 'welcome_message', type: 'text', nullable: true })
  welcomeMessage?: string;

  @Column({ name: 'fallback_message', type: 'text', nullable: true })
  fallbackMessage?: string;

  @Column({ name: 'handoff_keyword', default: 'agente' })
  handoffKeyword: string;

  @Column({ name: 'max_call_duration', default: 300 })
  maxCallDuration: number;

  @Column({ name: 'total_calls', default: 0 })
  totalCalls: number;

  @Column({ name: 'handled_calls', default: 0 })
  handledCalls: number;

  @Column({ name: 'transferred_calls', default: 0 })
  transferredCalls: number;

  @Column({ name: 'queue_ids', type: 'uuid', array: true, nullable: true, default: [] })
  queueIds: string[];

  @Column({ name: 'created_by', nullable: true, type: 'uuid' })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
