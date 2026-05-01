import { IsString, IsOptional, IsArray, IsDateString, IsIn } from 'class-validator';

const STATUSES = ['draft', 'pending_review', 'approved', 'published'] as const;
const CHANNELS = ['blog', 'instagram', 'facebook', 'linkedin', 'twitter', 'youtube', 'other'] as const;

export class CreateContentPostDto {
  @IsString()
  title: string;

  @IsOptional() @IsString()
  body?: string;

  @IsOptional() @IsIn(STATUSES)
  status?: string;

  @IsOptional() @IsIn(CHANNELS)
  channel?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString()
  coverUrl?: string;

  @IsOptional() @IsDateString()
  scheduledAt?: string;

  @IsOptional() @IsString()
  assignedTo?: string;

  @IsOptional() @IsString()
  assignedTeam?: string;

  @IsOptional() @IsString()
  mediaUrl?: string;

  @IsOptional() @IsString()
  mediaType?: string;

  @IsOptional() @IsString()
  altText?: string;
}

export class UpdateContentPostDto {
  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsString()
  body?: string;

  @IsOptional() @IsIn(STATUSES)
  status?: string;

  @IsOptional() @IsIn(CHANNELS)
  channel?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString()
  coverUrl?: string;

  @IsOptional() @IsDateString()
  scheduledAt?: string;

  @IsOptional() @IsDateString()
  publishedAt?: string;

  @IsOptional() @IsString()
  assignedTo?: string;

  @IsOptional() @IsString()
  assignedTeam?: string;

  @IsOptional() @IsString()
  mediaUrl?: string;

  @IsOptional() @IsString()
  mediaType?: string;

  @IsOptional() @IsString()
  altText?: string;
}

export class GenerateContentDto {
  @IsString()
  title: string;

  @IsIn(CHANNELS)
  channel: string;

  @IsOptional() @IsString()
  keywords?: string;

  @IsOptional() @IsString()
  tone?: string;
}
