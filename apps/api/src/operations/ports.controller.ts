import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { PortDto } from './operations.dto';
import { handleDatabaseError, upper } from './operations.util';

@Controller('ports')
export class PortsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list() { return this.prisma.port.findMany({ orderBy: { code: 'asc' } }); }

  @Post() @RequirePermission('shipments.manage')
  async create(@Body() dto: PortDto, @Req() req: AuthRequest) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const port = await tx.port.create({ data: { code: upper(dto.code), name: dto.name.trim(), country: dto.country.trim() } });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'PORT_CREATED', entity: 'Port', entityId: port.id, changes: { code: port.code }, ipAddress: req.ip } });
        return port;
      });
    } catch (error) { handleDatabaseError(error); }
  }
}
