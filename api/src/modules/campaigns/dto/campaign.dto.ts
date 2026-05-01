import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsArray, IsBoolean } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['email', 'whatsapp', 'sms', 'phone'])
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsOptional()
  messages?: string[];

  @IsString()
  @IsOptional()
  inboxId?: string;

  @IsString()
  @IsOptional()
  botId?: string;

  @IsString()
  @IsOptional()
  scheduleId?: string;

  @IsBoolean()
  @IsOptional()
  confirmationEnabled?: boolean;

  @IsString()
  @IsOptional()
  queueId?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(['email', 'whatsapp', 'sms', 'phone'])
  @IsOptional()
  type?: string;

  @IsEnum(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsOptional()
  messages?: string[];

  @IsString()
  @IsOptional()
  inboxId?: string;

  @IsString()
  @IsOptional()
  botId?: string;

  @IsString()
  @IsOptional()
  scheduleId?: string;

  @IsBoolean()
  @IsOptional()
  confirmationEnabled?: boolean;

  @IsString()
  @IsOptional()
  queueId?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class AddContactsDto {
  @IsArray()
  contactIds: string[];
}

export class AddContactsByFilterDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsArray()
  @IsOptional()
  tagIds?: string[];

  @IsArray()
  @IsOptional()
  contactIds?: string[];
}
