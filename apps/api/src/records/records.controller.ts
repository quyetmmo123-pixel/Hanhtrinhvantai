import { ConflictException, Controller, Delete, NotFoundException, Param, Req } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';

@Controller('records')
@RequirePermission('shipments.manage')
export class RecordsController {
  constructor(private readonly db: PrismaService) {}

  @Delete(':kind/:id')
  async remove(@Param('kind') kind: string, @Param('id') id: string, @Req() req: AuthRequest) {
    const model = {
      customers: this.db.customer, shipments: this.db.shipment, bookings: this.db.booking,
      containers: this.db.container, trucks: this.db.truck, trailers: this.db.trailer,
      drivers: this.db.driver, jobs: this.db.transportJob, vessels: this.db.vessel, voyages: this.db.voyage,
    }[kind];
    if (!model) throw new NotFoundException('Loại hồ sơ không hỗ trợ xóa');

    const refs: Record<string, () => Promise<number>> = {
      customers: () => this.db.shipment.count({ where: { customerId: id } }),
      shipments: async () => (await Promise.all([
        this.db.shipmentEvent.count({ where: { shipmentId: id } }), this.db.shipmentContainer.count({ where: { shipmentId: id } }),
        this.db.booking.count({ where: { shipmentId: id } }), this.db.transportJob.count({ where: { shipmentId: id } }),
        this.db.document.count({ where: { shipmentId: id } }), this.db.cost.count({ where: { shipmentId: id } }),
        this.db.revenue.count({ where: { shipmentId: id } }), this.db.invoice.count({ where: { shipmentId: id } }),
      ])).reduce((a, b) => a + b, 0),
      bookings: async () => (await Promise.all([this.db.billOfLading.count({ where: { bookingId: id } }), this.db.shipmentContainer.count({ where: { bookingId: id } })])).reduce((a,b)=>a+b,0),
      containers: async () => (await Promise.all([this.db.shipmentContainer.count({ where: { containerId: id } }), this.db.containerEvent.count({ where: { containerId: id } }), this.db.transportJob.count({ where: { containerId: id } }), this.db.voyageContainer.count({ where: { containerId: id } })])).reduce((a,b)=>a+b,0),
      trucks: async () => (await Promise.all([this.db.trailer.count({ where: { truckId: id } }), this.db.driver.count({ where: { assignedTruckId: id } }), this.db.transportJob.count({ where: { truckId: id } }), this.db.maintenance.count({ where: { truckId: id } })])).reduce((a,b)=>a+b,0),
      trailers: () => this.db.trailer.count({ where: { id, truckId: { not: null } } }),
      drivers: async () => (await Promise.all([this.db.transportJob.count({ where: { driverId: id } }), this.db.driver.count({ where: { id, userId: { not: null } } })])).reduce((a,b)=>a+b,0),
      jobs: () => this.db.transportJobEvent.count({ where: { jobId: id } }),
      vessels: async () => (await Promise.all([this.db.voyage.count({ where: { vesselId: id } }), this.db.vesselPosition.count({ where: { vesselId: id } })])).reduce((a,b)=>a+b,0),
      voyages: async () => (await Promise.all([this.db.voyageEvent.count({ where: { voyageId: id } }), this.db.voyageContainer.count({ where: { voyageId: id } })])).reduce((a,b)=>a+b,0),
    };
    const count = await refs[kind]();
    if (count) throw new ConflictException(`Không thể xóa: hồ sơ đang có ${count} liên kết hoặc lịch sử. Hãy giữ hồ sơ để bảo toàn dữ liệu.`);

    const exists = await (model as any).findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Không tìm thấy hồ sơ');
    await this.db.$transaction(async (tx) => {
      const transactionalModel = (tx as any)[kind === 'jobs' ? 'transportJob' : kind === 'trucks' ? 'truck' : kind === 'trailers' ? 'trailer' : kind === 'drivers' ? 'driver' : kind === 'customers' ? 'customer' : kind === 'shipments' ? 'shipment' : kind === 'bookings' ? 'booking' : kind === 'containers' ? 'container' : kind === 'vessels' ? 'vessel' : 'voyage'];
      await transactionalModel.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'RECORD_DELETED', entity: kind, entityId: id, changes: { kind }, ipAddress: req.ip } });
    });
    return { deleted: true };
  }
}
