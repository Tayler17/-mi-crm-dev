import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';
import { Pipeline } from './pipeline.entity';

@Entity('pipeline_stages')
export class PipelineStage extends BaseTenantEntity {
  @Column({ name: 'pipeline_id' })
  pipelineId: string;

  @Column()
  name: string;

  @Column({ default: 0 })
  position: number;

  @ManyToOne(() => Pipeline)
  @JoinColumn({ name: 'pipeline_id' })
  pipeline?: Pipeline;
}
