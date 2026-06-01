import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, Max, IsObject, IsArray, IsUUID } from 'class-validator';

export class CreateCallBotDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsOptional()
  phoneNumber?: string;

  @IsString() @IsOptional()
  language?: string;

  @IsEnum(['neutral', 'female', 'male']) @IsOptional()
  voiceType?: string;

  @IsEnum(['twilio', 'vonage', 'telnyx']) @IsOptional()
  provider?: string;

  @IsObject() @IsOptional()
  providerConfig?: Record<string, any>;

  @IsString() @IsOptional()
  systemPrompt?: string;

  @IsString() @IsOptional()
  welcomeMessage?: string;

  @IsString() @IsOptional()
  fallbackMessage?: string;

  @IsString() @IsOptional()
  handoffKeyword?: string;

  @IsInt() @Min(30) @Max(3600) @IsOptional()
  maxCallDuration?: number;

  @IsUUID('4') @IsOptional()
  inboxId?: string;

  @IsArray() @IsUUID('4', { each: true }) @IsOptional()
  queueIds?: string[];

  @IsEnum(['twilio_basic', 'openai_tts', 'elevenlabs']) @IsOptional()
  ttsProvider?: string;

  @IsString() @IsOptional()
  ttsVoiceId?: string;

  @IsString() @IsOptional()
  transferToNumber?: string;

  @IsUUID('4') @IsOptional()
  voiceCatalogId?: string;

  // Accept both camelCase (TS convention) and snake_case (sent by frontend)
  @IsObject() @IsOptional()
  visualConfig?: Record<string, any>;

  @IsObject() @IsOptional()
  // eslint-disable-next-line @typescript-eslint/naming-convention
  visual_config?: Record<string, any>;
}

export class UpdateCallBotDto {
  @IsString() @IsOptional()
  name?: string;

  @IsEnum(['active', 'inactive', 'draft']) @IsOptional()
  status?: string;

  @IsString() @IsOptional()
  phoneNumber?: string;

  @IsString() @IsOptional()
  language?: string;

  @IsEnum(['neutral', 'female', 'male']) @IsOptional()
  voiceType?: string;

  @IsEnum(['twilio', 'vonage', 'telnyx']) @IsOptional()
  provider?: string;

  @IsObject() @IsOptional()
  providerConfig?: Record<string, any>;

  @IsString() @IsOptional()
  systemPrompt?: string;

  @IsString() @IsOptional()
  welcomeMessage?: string;

  @IsString() @IsOptional()
  fallbackMessage?: string;

  @IsString() @IsOptional()
  handoffKeyword?: string;

  @IsInt() @Min(30) @Max(3600) @IsOptional()
  maxCallDuration?: number;

  @IsUUID('4') @IsOptional()
  inboxId?: string;

  @IsArray() @IsUUID('4', { each: true }) @IsOptional()
  queueIds?: string[];

  @IsEnum(['twilio_basic', 'openai_tts', 'elevenlabs']) @IsOptional()
  ttsProvider?: string;

  @IsString() @IsOptional()
  ttsVoiceId?: string;

  @IsString() @IsOptional()
  transferToNumber?: string;

  @IsUUID('4') @IsOptional()
  voiceCatalogId?: string;

  @IsObject() @IsOptional()
  visualConfig?: Record<string, any>;

  @IsObject() @IsOptional()
  // eslint-disable-next-line @typescript-eslint/naming-convention
  visual_config?: Record<string, any>;
}
