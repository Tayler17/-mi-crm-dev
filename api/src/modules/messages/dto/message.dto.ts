import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEnum(['text', 'html', 'template'])
  @IsOptional()
  contentType?: string;

  @IsEnum(['inbound', 'outbound'])
  @IsOptional()
  direction?: string;

  @IsString()
  @IsOptional()
  replyToMessageId?: string;
}

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;
}
