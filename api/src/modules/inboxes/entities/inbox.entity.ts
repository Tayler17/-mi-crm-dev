import { Entity, Column } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base-tenant.entity';

@Entity('inboxes')
export class Inbox extends BaseTenantEntity {
  @Column()
  name: string;

  @Column({ name: 'channel_type', default: 'email' })
  channelType: string;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  settings: any;
}
