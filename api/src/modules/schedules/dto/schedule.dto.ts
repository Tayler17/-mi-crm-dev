import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsInt, Min, Max, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsBoolean()
  @IsOptional()
  isClosed?: boolean;

  @IsString()
  @IsOptional()
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be HH:MM' })
  openTime?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([0-1]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be HH:MM' })
  closeTime?: string;
}

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsString()
  @IsOptional()
  aiFallbackMessage?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScheduleHoursDto)
  hours?: ScheduleHoursDto[];
}

export class UpdateScheduleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsString()
  @IsOptional()
  aiFallbackMessage?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScheduleHoursDto)
  hours?: ScheduleHoursDto[];
}
