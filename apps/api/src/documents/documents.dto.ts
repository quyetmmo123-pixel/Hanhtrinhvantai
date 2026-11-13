import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @IsString() shipmentId!: string;
  @IsEnum(DocumentType) type!: DocumentType;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
