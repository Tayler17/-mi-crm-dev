import { Entity, Column } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';

@Entity('pipelines')
export class Pipeline extends BaseTenantEntity {
  @Column()
  name: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;
}
