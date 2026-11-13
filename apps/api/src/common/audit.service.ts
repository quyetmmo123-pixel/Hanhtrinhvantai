import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: { actorId?: string; action: string; entity: string; entityId?: string; changes?: Prisma.InputJsonValue; ipAddress?: string }) {
    await this.prisma.auditLog.create({ data });
  }
}
