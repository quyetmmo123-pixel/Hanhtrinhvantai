import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';

@Controller('assignees')
@RequirePermission('operations.view')
export class AssigneesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  list() { return this.prisma.user.findMany({ where: { active: true, roles: { some: { role: { code: { in: ['ADMIN', 'OPERATIONS'] } } } } }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } }); }
}
