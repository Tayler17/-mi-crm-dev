import { IsString, IsOptional, IsUUID, IsEnum, IsNotEmpty } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  @IsOptional()
  inboxId?: string;

  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsEnum(['email', 'chat', 'whatsapp', 'whatsapp_web', 'instagram', 'facebook', 'telegram'])
  @IsOptional()
  channelType?: string;
}

export class UpdateConversationDto {
  @IsEnum(['open', 'resolved', 'pending', 'snoozed'])
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  subject?: string;
}

export class CreateCannedResponseDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  shortCode?: string;

  @IsString()
  @IsOptional()
  category?: string;
}

export class UpdateCannedResponseDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  shortCode?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
