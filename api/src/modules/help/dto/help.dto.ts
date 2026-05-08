import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsUrl, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsOptional()
  icon?: string;

  @IsInt() @Min(0) @IsOptional()
  position?: number;

  @IsBoolean() @IsOptional()
  isGlobal?: boolean;
}

export class UpdateCategoryDto {
  @IsString() @IsOptional()
  name?: string;

  @IsString() @IsOptional()
  icon?: string;

  @IsInt() @Min(0) @IsOptional()
  position?: number;

  @IsBoolean() @IsOptional()
  isGlobal?: boolean;
}

export class CreateArticleDto {
  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsOptional()
  categoryId?: string;

  @IsString() @IsOptional()
  body?: string;

  @IsString() @IsOptional()
  videoUrl?: string;

  @IsInt() @Min(0) @IsOptional()
  position?: number;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;

  @IsBoolean() @IsOptional()
  isGlobal?: boolean;

  @IsString() @IsOptional()
  lang?: string;
}

export class UpdateArticleDto {
  @IsString() @IsOptional()
  title?: string;

  @IsString() @IsOptional()
  categoryId?: string;

  @IsString() @IsOptional()
  body?: string;

  @IsString() @IsOptional()
  videoUrl?: string;

  @IsInt() @Min(0) @IsOptional()
  position?: number;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;

  @IsBoolean() @IsOptional()
  isGlobal?: boolean;

  @IsString() @IsOptional()
  lang?: string;
}
