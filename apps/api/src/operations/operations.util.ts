import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function handleDatabaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new ConflictException('Mã hoặc số chứng từ đã tồn tại');
    if (error.code === 'P2003') throw new BadRequestException('Dữ liệu liên kết không hợp lệ');
  }
  throw error;
}

export const toDate = (value?: string) => value ? new Date(value) : undefined;
export const upper = (value: string) => value.trim().toUpperCase();
