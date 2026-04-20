import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class CreateInboxDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['email', 'chat', 'whatsapp', 'instagram', 'telegram'])
  @IsOptional()
  channelType?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateInboxDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}
