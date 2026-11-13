import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ContainerStatus, ShipmentStatus, TransportJobStatus, TruckStatus, VesselStatus, VoyageContainerStatus, VoyageStatus } from '@prisma/client';
import { RequirePermission } from '../auth/auth.decorators';
import { TrackingService } from '../tracking/tracking.service';

@Controller('dashboard')
@RequirePermission('dashboard.view')
export class DashboardController {
  constructor(private readonly prisma: PrismaService, private readonly tracking: TrackingService) {}

  @Get('summary')
  async summary() {
    const [users, activeSessions, roles, shipmentTotal, shipmentGroups, containerTotal, containerGroups, truckTotal, truckAvailable, truckRunning, jobsCompletedToday, vesselTotal, vesselsUnderway, activeVoyages, voyageContainers] = await Promise.all([
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      this.prisma.role.findMany({ select: { code: true, name: true, _count: { select: { users: true } } }, orderBy: { code: 'asc' } }),
      this.prisma.shipment.count(),
      this.prisma.shipment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.container.count(),
      this.prisma.container.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.truck.count(),
      this.prisma.truck.count({ where: { status: TruckStatus.AVAILABLE } }),
      this.prisma.truck.count({ where: { status: { in: [TruckStatus.PICKING_UP, TruckStatus.IN_TRANSIT, TruckStatus.DELIVERING] } } }),
      this.prisma.transportJob.count({ where: { status: TransportJobStatus.COMPLETED, actualDeliveryAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      this.prisma.vessel.count(),
      this.prisma.vessel.count({ where: { status: { in: [VesselStatus.UNDERWAY, VesselStatus.IN_TRANSIT] } } }),
      this.prisma.voyage.count({ where: { status: { in: [VoyageStatus.CONFIRMED, VoyageStatus.DEPARTED] } } }),
      this.prisma.voyageContainer.count({ where: { status: { in: [VoyageContainerStatus.BOOKED, VoyageContainerStatus.LOADED] } } }),
    ]);
    const shipmentCount = (status: ShipmentStatus) => shipmentGroups.find((item) => item.status === status)?._count._all || 0;
    const containerCount = (status: ContainerStatus) => containerGroups.find((item) => item.status === status)?._count._all || 0;
    const [revenueByCurrency, costByCurrency] = await Promise.all([
      this.prisma.revenue.groupBy({ by: ['currency'], _sum: { amount: true } }),
      this.prisma.cost.groupBy({ by: ['currency'], _sum: { amount: true } }),
    ]);
    const finance = [...new Set([...revenueByCurrency.map((row) => row.currency), ...costByCurrency.map((row) => row.currency)])].map((currency) => {
      const revenue = revenueByCurrency.find((row) => row.currency === currency)?._sum.amount?.toNumber() || 0;
      const cost = costByCurrency.find((row) => row.currency === currency)?._sum.amount?.toNumber() || 0;
      return { currency, revenue, cost, profit: revenue - cost };
    });
    return {
      phase: 7,
      users,
      activeSessions,
      roles: roles.map(({ code, name, _count }) => ({ code, name, users: _count.users })),
      businessMetrics: {
        shipments: { total: shipmentTotal, new: shipmentCount(ShipmentStatus.NEW), processing: shipmentCount(ShipmentStatus.PROCESSING), inTransit: shipmentCount(ShipmentStatus.IN_TRANSIT), completed: shipmentCount(ShipmentStatus.COMPLETED), delayed: shipmentCount(ShipmentStatus.DELAYED) },
        containers: { total: containerTotal, atPort: containerCount(ContainerStatus.GATE_IN) + containerCount(ContainerStatus.AVAILABLE) + containerCount(ContainerStatus.DISCHARGED), onVessel: containerCount(ContainerStatus.LOADED_ON_VESSEL) + containerCount(ContainerStatus.VESSEL_DEPARTED) + containerCount(ContainerStatus.IN_TRANSIT) + containerCount(ContainerStatus.TRANSSHIPMENT), arrived: containerCount(ContainerStatus.ARRIVED) + containerCount(ContainerStatus.DISCHARGED) + containerCount(ContainerStatus.AVAILABLE) },
        trucking: { total: truckTotal, available: truckAvailable, running: truckRunning, completedToday: jobsCompletedToday },
        vessels: { total: vesselTotal, underway: vesselsUnderway, activeVoyages, containersOnVoyage: voyageContainers },
      },
      finance,
      businessMetricsMessage: 'Số liệu Shipment, Container, xe và Voyage lấy trực tiếp từ database. Vị trí tàu chỉ có khi AIS provider thật được cấu hình.',
      aisStatus: this.tracking.getStatus().connection === 'CONNECTED' ? 'AIS PROVIDER CONNECTED' : 'AIS DATA NOT CONNECTED',
    };
  }
}
