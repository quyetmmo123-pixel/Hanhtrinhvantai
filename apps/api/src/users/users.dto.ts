import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const ROLE_CODES = ['ADMIN', 'MANAGER', 'OPERATIONS', 'ACCOUNTANT', 'DRIVER'] as const;

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsString() @MinLength(12) password!: string;
  @IsArray() @IsIn(ROLE_CODES, { each: true }) roleCodes!: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @IsIn(ROLE_CODES, { each: true }) roleCodes?: string[];
}
