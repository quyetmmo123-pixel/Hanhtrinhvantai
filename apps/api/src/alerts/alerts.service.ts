import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AlertSeverity, AlertStatus, ContainerStatus, Prisma, ShipmentStatus, TransportJobStatus, VoyageStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Detection = { sourceKey: string; type: string; severity: AlertSeverity; title: string; message: string; entity: string; entityId: string; dueAt?: Date | null };

@Injectable()
export class AlertsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);
  private scanTimer?: ReturnType<typeof setInterval>;
  constructor(private readonly db: PrismaService) {}

  onApplicationBootstrap() {
    void this.refresh().catch((error: unknown) => this.logger.warn(`Initial alert scan failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    this.scanTimer = setInterval(() => {
      void this.refresh().catch((error: unknown) => this.logger.warn(`Scheduled alert scan failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    }, 5 * 60_000);
    this.scanTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.scanTimer) clearInterval(this.scanTimer);
  }

  async list(filters: { status?: AlertStatus; severity?: AlertSeverity }) {
    await this.refresh();
    const rows = await this.db.alert.findMany({
      where: { status: filters.status, severity: filters.severity },
      include: { acknowledgedBy: { select: { id: true, fullName: true } } },
      orderBy: [{ detectedAt: 'desc' }], take: 500,
    });
    const priority: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return rows.sort((a, b) => priority[a.severity] - priority[b.severity] || b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  private async refresh() {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86_400_000);
    const week = new Date(now.getTime() + 7 * 86_400_000);
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const detections: Detection[] = [];
    const add = (item: Detection) => detections.push(item);

    const [delayedShipments, overdueShipments, gateInShipments, delayedVoyages, etaChanges, lateJobs, trucks, drivers, maintenance, waitingContainers] = await Promise.all([
      this.db.shipment.findMany({ where: { status: ShipmentStatus.DELAYED }, select: { id: true, shipmentNo: true, eta: true }, take: 500 }),
      this.db.shipment.findMany({ where: { status: { in: [ShipmentStatus.PROCESSING, ShipmentStatus.IN_TRANSIT] }, eta: { lt: now } }, select: { id: true, shipmentNo: true, eta: true }, take: 500 }),
      this.db.shipment.findMany({ where: { status: { notIn: [ShipmentStatus.COMPLETED, ShipmentStatus.CANCELLED] }, events: { some: { milestone: 'GATE_IN', plannedAt: { lt: now }, actualAt: null } }, containers: { some: { releasedAt: null, container: { status: { in: [ContainerStatus.EMPTY_RELEASED, ContainerStatus.PICKED_UP, ContainerStatus.STUFFING] } } } } }, select: { id: true, shipmentNo: true, events: { where: { milestone: 'GATE_IN', plannedAt: { lt: now }, actualAt: null }, orderBy: { plannedAt: 'asc' }, take: 1 } }, take: 500 }),
      this.db.voyage.findMany({ where: { status: VoyageStatus.DEPARTED, eta: { lt: now } }, select: { id: true, voyageNo: true, eta: true, vessel: { select: { name: true } }, pod: { select: { name: true } } }, take: 500 }),
      this.db.voyage.findMany({ where: { status: VoyageStatus.DEPARTED }, select: { id: true, voyageNo: true, eta: true, vessel: { select: { name: true, positions: { orderBy: { lastUpdate: 'desc' }, take: 1, select: { eta: true, lastUpdate: true } } } }, pod: { select: { name: true } } }, take: 500 }),
      this.db.transportJob.findMany({ where: { status: { in: [TransportJobStatus.ASSIGNED, TransportJobStatus.PICKING_UP, TransportJobStatus.IN_TRANSIT, TransportJobStatus.DELIVERING] }, OR: [{ status: TransportJobStatus.ASSIGNED, pickupAt: { lt: now } }, { status: { in: [TransportJobStatus.PICKING_UP, TransportJobStatus.IN_TRANSIT, TransportJobStatus.DELIVERING] }, deliveryAt: { lt: now } }] }, select: { id: true, jobNo: true, status: true, pickupAt: true, deliveryAt: true, truck: { select: { plateNo: true } }, driver: { select: { fullName: true } }, shipment: { select: { shipmentNo: true } } }, take: 500 }),
      this.db.truck.findMany({ where: { OR: [{ inspectionExpires: { lte: soon } }, { insuranceExpires: { lte: soon } }] }, select: { id: true, plateNo: true, inspectionExpires: true, insuranceExpires: true }, take: 500 }),
      this.db.driver.findMany({ where: { licenseExpires: { lte: soon } }, select: { id: true, code: true, fullName: true, licenseExpires: true }, take: 500 }),
      this.db.maintenance.findMany({ where: { completedAt: null, startsAt: { lte: week }, endsAt: { gte: now } }, select: { id: true, truckId: true, startsAt: true, description: true, truck: { select: { plateNo: true } } }, take: 500 }),
      this.db.container.findMany({ where: { status: ContainerStatus.AVAILABLE, updatedAt: { lte: dayAgo }, shipments: { some: { releasedAt: null } } }, select: { id: true, containerNo: true, shipments: { where: { releasedAt: null }, take: 1, select: { shipment: { select: { id: true, shipmentNo: true } } } } }, take: 500 }),
    ]);

    for (const shipment of delayedShipments) add({ sourceKey: `SHIPMENT_DELAY:${shipment.id}`, type: 'SHIPMENT_DELAY', severity: 'CRITICAL', title: `Shipment ${shipment.shipmentNo} đang bị chậm`, message: shipment.eta ? `ETA kế hoạch ${shipment.eta.toISOString()}; kiểm tra lịch trình và cập nhật khách hàng.` : 'Shipment đang ở trạng thái DELAYED; cần kiểm tra lịch trình.', entity: 'Shipment', entityId: shipment.id, dueAt: shipment.eta });
    for (const shipment of overdueShipments) add({ sourceKey: `SHIPMENT_ETA:${shipment.id}`, type: 'SHIPMENT_DELAY', severity: 'WARNING', title: `Shipment ${shipment.shipmentNo} quá ETA`, message: `ETA ${shipment.eta!.toISOString()} đã qua nhưng Shipment chưa hoàn thành.`, entity: 'Shipment', entityId: shipment.id, dueAt: shipment.eta });
    for (const shipment of gateInShipments) { const event = shipment.events[0]; add({ sourceKey: `GATE_IN:${shipment.id}`, type: 'GATE_IN_MISSED', severity: 'WARNING', title: `Shipment ${shipment.shipmentNo} chưa Gate In`, message: `Container chưa Gate In theo lịch ${event?.plannedAt?.toISOString() || ''}.`, entity: 'Shipment', entityId: shipment.id, dueAt: event?.plannedAt }); }
    for (const voyage of delayedVoyages) { const lateHours = (now.getTime() - voyage.eta.getTime()) / 3_600_000; add({ sourceKey: `VESSEL_DELAY:${voyage.id}`, type: 'VESSEL_DELAY', severity: lateHours >= 24 ? 'CRITICAL' : 'WARNING', title: `Voyage ${voyage.voyageNo} quá ETA`, message: `${voyage.vessel.name} chưa đến ${voyage.pod.name}; ETA kế hoạch ${voyage.eta.toISOString()}.`, entity: 'Voyage', entityId: voyage.id, dueAt: voyage.eta }); }
    for (const voyage of etaChanges) { const position = voyage.vessel.positions[0]; if (position?.eta && Math.abs(position.eta.getTime() - voyage.eta.getTime()) >= 6 * 3_600_000) add({ sourceKey: `ETA_CHANGE:${voyage.id}`, type: 'ETA_CHANGED', severity: 'WARNING', title: `AIS báo ETA thay đổi · ${voyage.voyageNo}`, message: `AIS cập nhật ${position.eta.toISOString()}, khác ETA lịch trình ${voyage.eta.toISOString()}. Bản tin nhận lúc ${position.lastUpdate.toISOString()}.`, entity: 'Voyage', entityId: voyage.id, dueAt: position.eta }); }
    for (const job of lateJobs) { const pickupLate = job.status === TransportJobStatus.ASSIGNED; add({ sourceKey: `TRUCK_LATE:${job.id}`, type: 'TRUCK_LATE', severity: 'CRITICAL', title: `Chuyến xe ${job.jobNo} bị trễ`, message: `${job.truck.plateNo} · ${job.driver.fullName} · Shipment ${job.shipment.shipmentNo} chưa ${pickupLate ? 'nhận container đúng lịch' : 'giao hàng đúng lịch'}.`, entity: 'TransportJob', entityId: job.id, dueAt: pickupLate ? job.pickupAt : job.deliveryAt }); }
    for (const truck of trucks) {
      for (const [type, label, dueAt] of [['INSPECTION_EXPIRY', 'đăng kiểm', truck.inspectionExpires], ['INSURANCE_EXPIRY', 'bảo hiểm', truck.insuranceExpires]] as const) {
        if (!dueAt || dueAt > soon) continue;
        const days = (dueAt.getTime() - now.getTime()) / 86_400_000;
        add({ sourceKey: `${type}:${truck.id}`, type, severity: days < 0 ? 'CRITICAL' : days <= 7 ? 'WARNING' : 'INFO', title: `${label} xe ${truck.plateNo} ${days < 0 ? 'đã hết hạn' : 'sắp hết hạn'}`, message: `${label} hết hạn ${dueAt.toISOString()}.`, entity: 'Truck', entityId: truck.id, dueAt });
      }
    }
    for (const driver of drivers) { const days = (driver.licenseExpires.getTime() - now.getTime()) / 86_400_000; add({ sourceKey: `LICENSE_EXPIRY:${driver.id}`, type: 'LICENSE_EXPIRY', severity: days < 0 ? 'CRITICAL' : days <= 7 ? 'WARNING' : 'INFO', title: `GPLX tài xế ${driver.fullName} ${days < 0 ? 'đã hết hạn' : 'sắp hết hạn'}`, message: `GPLX ${driver.code} hết hạn ${driver.licenseExpires.toISOString()}.`, entity: 'Driver', entityId: driver.id, dueAt: driver.licenseExpires }); }
    for (const task of maintenance) add({ sourceKey: `MAINTENANCE_DUE:${task.id}`, type: 'MAINTENANCE_DUE', severity: task.startsAt <= now ? 'WARNING' : 'INFO', title: `Xe ${task.truck.plateNo} đến lịch bảo dưỡng`, message: `${task.description} · bắt đầu ${task.startsAt.toISOString()}.`, entity: 'Maintenance', entityId: task.id, dueAt: task.startsAt });
    for (const container of waitingContainers) { const shipment = container.shipments[0]?.shipment; if (shipment) add({ sourceKey: `CONTAINER_NOT_PICKED:${container.id}`, type: 'CONTAINER_NOT_PICKED', severity: 'WARNING', title: `Container ${container.containerNo} chưa được lấy`, message: `Container đã Available quá 24 giờ · Shipment ${shipment.shipmentNo}.`, entity: 'Container', entityId: container.id }); }

    const cappedTypes = new Set<string>();
    if (delayedShipments.length === 500 || overdueShipments.length === 500) cappedTypes.add('SHIPMENT_DELAY');
    if (gateInShipments.length === 500) cappedTypes.add('GATE_IN_MISSED');
    if (delayedVoyages.length === 500) cappedTypes.add('VESSEL_DELAY');
    if (etaChanges.length === 500) cappedTypes.add('ETA_CHANGED');
    if (lateJobs.length === 500) cappedTypes.add('TRUCK_LATE');
    if (trucks.length === 500) { cappedTypes.add('INSPECTION_EXPIRY'); cappedTypes.add('INSURANCE_EXPIRY'); }
    if (drivers.length === 500) cappedTypes.add('LICENSE_EXPIRY');
    if (maintenance.length === 500) cappedTypes.add('MAINTENANCE_DUE');
    if (waitingContainers.length === 500) cappedTypes.add('CONTAINER_NOT_PICKED');

    const keys = detections.map((item) => item.sourceKey);
    await this.db.$transaction(async (tx) => {
      for (const item of detections) {
        await tx.alert.upsert({ where: { sourceKey: item.sourceKey }, create: { ...item }, update: {
          type: item.type, severity: item.severity, title: item.title, message: item.message,
          entity: item.entity, entityId: item.entityId, dueAt: item.dueAt, lastSeenAt: now,
        } });
        await tx.alert.updateMany({ where: { sourceKey: item.sourceKey, status: AlertStatus.RESOLVED }, data: { status: AlertStatus.OPEN, resolvedAt: null, acknowledgedAt: null, acknowledgedById: null } });
      }
      await tx.alert.updateMany({ where: { status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }, ...(keys.length ? { sourceKey: { notIn: keys } } : {}), ...(cappedTypes.size ? { type: { notIn: [...cappedTypes] } } : {}) }, data: { status: AlertStatus.RESOLVED, resolvedAt: now } });
    }, { maxWait: 10_000, timeout: 30_000 });
  }
}
