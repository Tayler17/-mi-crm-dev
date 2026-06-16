import { IsString, IsOptional, IsUUID, IsBoolean, IsArray } from 'class-validator';

export class CreateChatDto {
  @IsUUID()
  targetUserId: string; // for DMs

  @IsString()
  @IsOptional()
  name?: string; // for group chats

  @IsBoolean()
  @IsOptional()
  isGroup?: boolean;

  @IsArray()
  @IsOptional()
  memberIds?: string[]; // extra members for group
}

export class SendMessageDto {
  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;

  @IsString()
  @IsOptional()
  attachmentType?: string; // image | audio | file

  @IsString()
  @IsOptional()
  attachmentName?: string;
}

export class EditMessageDto {
  @IsString()
  body: string;
}
