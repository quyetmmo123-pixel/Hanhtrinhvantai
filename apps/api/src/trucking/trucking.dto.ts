import { DriverStatus, TransportJobStatus, TruckType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class TruckDto {
  @IsString() @Matches(/\S/) @MaxLength(20) plateNo!: string;
  @IsEnum(TruckType) type!: TruckType;
  @Type(() => Number) @IsNumber() @Min(1) capacityKg!: number;
  @IsOptional() @IsString() @MaxLength(80) gpsDeviceId?: string;
  @IsOptional() @IsISO8601() inspectionExpires?: string;
  @IsOptional() @IsISO8601() insuranceExpires?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateTruckDto {
  @IsOptional() @IsEnum(TruckType) type?: TruckType;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) capacityKg?: number;
  @IsOptional() @IsString() @MaxLength(80) gpsDeviceId?: string;
  @IsOptional() @IsISO8601() inspectionExpires?: string;
  @IsOptional() @IsISO8601() insuranceExpires?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class TrailerDto {
  @IsString() @Matches(/\S/) @MaxLength(20) plateNo!: string;
  @IsString() @Matches(/\S/) @MaxLength(80) type!: string;
  @Type(() => Number) @IsNumber() @Min(1) capacityKg!: number;
  @IsOptional() @IsString() truckId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateTrailerDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(80) type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) capacityKg?: number;
  @IsOptional() @IsString() truckId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class DriverDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,30}$/) code!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) fullName!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsString() @Matches(/\S/) @MaxLength(50) licenseNo!: string;
  @IsString() @Matches(/\S/) @MaxLength(30) licenseClass!: string;
  @IsISO8601() licenseExpires!: string;
  @IsOptional() @IsString() assignedTruckId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateDriverDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) fullName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(50) licenseNo?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(30) licenseClass?: string;
  @IsOptional() @IsISO8601() licenseExpires?: string;
  @IsOptional() @IsString() assignedTruckId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEnum(DriverStatus) status?: DriverStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class MaintenanceDto {
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
  @IsString() @Matches(/\S/) @MaxLength(500) description!: string;
}
export class CreateJobDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{3,40}$/) jobNo!: string;
  @IsString() shipmentId!: string;
  @IsOptional() @IsString() containerId?: string;
  @IsString() truckId!: string;
  @IsString() driverId!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) pickupPlace!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) deliveryPlace!: string;
  @IsISO8601() pickupAt!: string;
  @IsISO8601() deliveryAt!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class JobEventDto {
  @IsEnum(TransportJobStatus) status!: TransportJobStatus;
  @IsISO8601() occurredAt!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) loadedKm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) emptyKm?: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
