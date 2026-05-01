import { IsString, IsEmail, IsNotEmpty, IsOptional, IsEnum, IsBoolean, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(['owner', 'admin', 'agent'])
  @IsOptional()
  role?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEnum(['owner', 'admin', 'agent'])
  @IsOptional()
  role?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
