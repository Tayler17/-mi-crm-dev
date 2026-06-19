import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'full_name', nullable: true })
  fullName: string;

  @Column({ default: 'agent' })
  role: string;

  @Column({ name: 'avatar_url', nullable: true, type: 'varchar' })
  avatarUrl: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ default: 'online' })
  availability: string; // online | away | busy | offline

  @Column({ name: 'reset_token', nullable: true, type: 'varchar' })
  resetToken: string | null;

  @Column({ name: 'reset_token_expires_at', nullable: true, type: 'timestamptz' })
  resetTokenExpiresAt: Date | null;

  @Column({ name: 'email_verification_token', nullable: true, type: 'varchar' })
  emailVerificationToken: string | null;

  @Column({ name: 'email_verified_at', nullable: true, type: 'timestamptz' })
  emailVerifiedAt: Date | null;

  @Column({ name: 'last_seen_at', nullable: true, type: 'timestamptz' })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
