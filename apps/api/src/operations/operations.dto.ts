import { BookingStatus, ContainerStatus, ContainerType, ShipmentMilestone, ShipmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CustomerDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,30}$/) code!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) companyName!: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class PortDto {
  @IsString() @Matches(/^[A-Za-z]{2}[A-Za-z0-9]{3}$/) code!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsString() @Matches(/\S/) @MaxLength(100) country!: string;
}

export class ShipmentDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{3,40}$/) shipmentNo!: string;
  @IsString() customerId!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) cargoName!: string;
  @IsOptional() @IsString() @MaxLength(200) shipper?: string;
  @IsOptional() @IsString() @MaxLength(200) consignee?: string;
  @IsOptional() @IsString() @MaxLength(100) cargoType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cbm?: number;
  @IsOptional() @IsString() @MaxLength(20) incoterm?: string;
  @IsOptional() @IsString() polId?: string;
  @IsOptional() @IsString() podId?: string;
  @IsOptional() @IsString() @MaxLength(200) placeOfReceipt?: string;
  @IsOptional() @IsString() @MaxLength(200) placeOfDelivery?: string;
  @IsOptional() @IsISO8601() etd?: string;
  @IsOptional() @IsISO8601() eta?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateShipmentDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(200) cargoName?: string;
  @IsOptional() @IsString() @MaxLength(200) shipper?: string;
  @IsOptional() @IsString() @MaxLength(200) consignee?: string;
  @IsOptional() @IsString() @MaxLength(100) cargoType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cbm?: number;
  @IsOptional() @IsString() @MaxLength(20) incoterm?: string;
  @IsOptional() @IsString() polId?: string;
  @IsOptional() @IsString() podId?: string;
  @IsOptional() @IsString() @MaxLength(200) placeOfReceipt?: string;
  @IsOptional() @IsString() @MaxLength(200) placeOfDelivery?: string;
  @IsOptional() @IsISO8601() etd?: string;
  @IsOptional() @IsISO8601() atd?: string;
  @IsOptional() @IsISO8601() eta?: string;
  @IsOptional() @IsISO8601() ata?: string;
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ShipmentEventDto {
  @IsEnum(ShipmentMilestone) milestone!: ShipmentMilestone;
  @IsOptional() @IsISO8601() plannedAt?: string;
  @IsOptional() @IsISO8601() actualAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class BookingDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{3,50}$/) bookingNo!: string;
  @IsString() shipmentId!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) shippingLine!: string;
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @IsISO8601() confirmedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateBookingDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) shippingLine?: string;
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @IsISO8601() confirmedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class BillOfLadingDto {
  @IsString() @Matches(/^[A-Za-z0-9_/-]{3,70}$/) blNo!: string;
  @IsString() bookingId!: string;
  @IsOptional() @IsISO8601() issuedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ContainerDto {
  @IsString() @Matches(/^[A-Za-z]{4}[0-9]{7}$/) containerNo!: string;
  @IsEnum(ContainerType) type!: ContainerType;
  @IsOptional() @IsString() @MaxLength(50) sealNo?: string;
  @IsOptional() @IsString() @MaxLength(120) shippingLine?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateContainerDto {
  @IsOptional() @IsEnum(ContainerType) type?: ContainerType;
  @IsOptional() @IsString() @MaxLength(50) sealNo?: string;
  @IsOptional() @IsString() @MaxLength(120) shippingLine?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class AssignContainerDto {
  @IsString() shipmentId!: string;
  @IsOptional() @IsString() bookingId?: string;
}

export class ContainerEventDto {
  @IsEnum(ContainerStatus) status!: ContainerStatus;
  @IsISO8601() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
