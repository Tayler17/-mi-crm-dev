import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity('campaign_contacts')
export class CampaignContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id' })
  campaignId: string;

  @ManyToOne(() => Campaign, (c) => c.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ name: 'sent_at', nullable: true, type: 'timestamp' })
  sentAt?: Date;
}
