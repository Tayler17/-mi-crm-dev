import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsEmail, MinLength, Matches, Equals } from 'class-validator';

export class CreateTenantDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsNotEmpty()
  slug: string;

  @IsEnum(['free', 'starter', 'pro', 'enterprise'])
  @IsOptional()
  plan?: string;

  @IsEmail()
  adminEmail: string;

  @IsString() @MinLength(8)
  adminPassword: string;

  @IsString() @IsOptional()
  adminName?: string;
}

export class RegisterDto {
  @IsString() @IsNotEmpty() @MinLength(2)
  workspaceName: string;

  @IsString() @IsNotEmpty() @MinLength(3)
  @Matches(/^[a-z0-9-]+$/, { message: 'El slug solo puede contener letras minúsculas, números y guiones' })
  slug: string;

  @IsString() @IsNotEmpty() @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8)
  password: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los Términos de uso y la Política de privacidad' })
  acceptedTerms: boolean;
}

export class UpdateTenantDto {
  @IsString() @IsOptional()
  name?: string;

  @IsString() @IsOptional()
  plan?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;

  @IsString() @IsOptional()
  planId?: string | null;

  @IsString() @IsOptional()
  billingEmail?: string;

  @IsString() @IsOptional()
  billingNotes?: string;

  @IsString() @IsOptional()
  planExpiresAt?: string | null;
}
