import { IsString, IsNotEmpty, IsNumber, IsOptional, IsUUID, IsEnum, IsDateString } from 'class-validator';

export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsNumber()
  @IsOptional()
  value?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  priority?: string;

  @IsEnum(['open', 'won', 'lost'])
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsUUID()
  @IsOptional()
  stageId?: string;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @IsDateString()
  @IsOptional()
  closedAt?: string;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDealDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsNumber()
  @IsOptional()
  value?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  priority?: string;

  @IsEnum(['open', 'won', 'lost'])
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsUUID()
  @IsOptional()
  stageId?: string;

  @IsDateString()
  @IsOptional()
  closedAt?: string;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;
}

export class UpdateDealStageDto {
  @IsUUID()
  @IsNotEmpty()
  stageId: string;
}
