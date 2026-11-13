import { BadRequestException, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { AlertSeverity, AlertStatus } from '@prisma/client';
import { AuthRequest } from '../auth/auth.types';
import { RequirePermission } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@RequirePermission('operations.view')
export class AlertsController {
  constructor(private readonly alerts: AlertsService, private readonly db: PrismaService) {}

  @Get()
  list(@Query('status') status?: string, @Query('severity') severity?: string) {
    if (status && !Object.values(AlertStatus).includes(status as AlertStatus)) throw new BadRequestException('Trạng thái cảnh báo không hợp lệ');
    if (severity && !Object.values(AlertSeverity).includes(severity as AlertSeverity)) throw new BadRequestException('Mức cảnh báo không hợp lệ');
    return this.alerts.list({ status: status as AlertStatus | undefined, severity: severity as AlertSeverity | undefined });
  }

  @Post(':id/acknowledge')
  @RequirePermission('alerts.manage')
  async acknowledge(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      const alert = await tx.alert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundException('Không tìm thấy cảnh báo');
      if (alert.status === AlertStatus.RESOLVED) throw new ConflictException('Cảnh báo đã được xử lý');
      const updated = await tx.alert.update({ where: { id }, data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date(), acknowledgedById: req.authUser.id }, include: { acknowledgedBy: { select: { id: true, fullName: true } } } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'ALERT_ACKNOWLEDGED', entity: 'Alert', entityId: id, changes: { sourceKey: alert.sourceKey, severity: alert.severity, previousStatus: alert.status, status: updated.status }, ipAddress: req.ip } });
      return updated;
    });
  }
}
