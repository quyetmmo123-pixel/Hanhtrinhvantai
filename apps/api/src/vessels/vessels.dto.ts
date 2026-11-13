import { VesselStatus, VoyageContainerStatus, VoyageStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VesselDto {
  @IsString() @Matches(/\S/) @MaxLength(150) name!: string;
  @IsString() @Matches(/^\d{7}$/) imo!: string;
  @IsOptional() @IsString() @Matches(/^\d{9}$/) mmsi?: string;
  @IsOptional() @IsString() @MaxLength(20) callSign?: string;
  @IsOptional() @IsString() @MaxLength(60) flag?: string;
  @IsString() @Matches(/\S/) @MaxLength(120) shippingLine!: string;
  @IsString() @Matches(/\S/) @MaxLength(80) vesselType!: string;
  @IsOptional() @IsEnum(VesselStatus) status?: VesselStatus;
}
export class UpdateVesselDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(150) name?: string;
  @IsOptional() @IsString() @Matches(/^\d{9}$/) mmsi?: string;
  @IsOptional() @IsString() @MaxLength(20) callSign?: string;
  @IsOptional() @IsString() @MaxLength(60) flag?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) shippingLine?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(80) vesselType?: string;
  @IsOptional() @IsEnum(VesselStatus) status?: VesselStatus;
}
export class VoyageDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/) voyageNo!: string;
  @IsString() vesselId!: string;
  @IsString() polId!: string;
  @IsString() podId!: string;
  @IsISO8601() etd!: string;
  @IsISO8601() eta!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateVoyageDto {
  @IsOptional() @IsISO8601() etd?: string;
  @IsOptional() @IsISO8601() atd?: string;
  @IsOptional() @IsISO8601() eta?: string;
  @IsOptional() @IsISO8601() ata?: string;
  @IsOptional() @IsEnum(VoyageStatus) status?: VoyageStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class LinkVoyageContainerDto {
  @IsString() containerId!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class VoyageContainerEventDto {
  @IsEnum(VoyageContainerStatus) status!: VoyageContainerStatus;
  @IsISO8601() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
