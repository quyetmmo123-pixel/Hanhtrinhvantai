import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CostCategory, RevenueCategory } from '@prisma/client';

class FinancialEntryDto {
  @IsString() shipmentId!: string;
  @IsString() @MaxLength(180) description!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount!: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateCostDto extends FinancialEntryDto {
  @IsEnum(CostCategory) category!: CostCategory;
}
export class UpdateCostDto {
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsEnum(CostCategory) category?: CostCategory;
  @IsOptional() @IsString() @MaxLength(180) description?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateRevenueDto extends FinancialEntryDto {
  @IsEnum(RevenueCategory) category!: RevenueCategory;
}
export class UpdateRevenueDto {
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsEnum(RevenueCategory) category?: RevenueCategory;
  @IsOptional() @IsString() @MaxLength(180) description?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class InvoiceLineDto {
  @IsString() @MaxLength(180) description!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(99999999999.999) quantity!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsString() @MaxLength(40) invoiceNo!: string;
  @IsString() shipmentId!: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto) lines!: InvoiceLineDto[];
}

export class CreatePaymentDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount!: number;
  @IsDateString() paidAt!: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
