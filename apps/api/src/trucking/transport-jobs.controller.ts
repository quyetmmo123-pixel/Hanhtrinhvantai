import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ContainerStatus, DriverStatus, Prisma, ShipmentStatus, TransportJobStatus, TruckStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { handleDatabaseError, upper } from '../operations/operations.util';
import { CreateJobDto, JobEventDto } from './trucking.dto';

const active = [TransportJobStatus.ASSIGNED, TransportJobStatus.PICKING_UP, TransportJobStatus.IN_TRANSIT, TransportJobStatus.DELIVERING];
const progress: TransportJobStatus[] = [TransportJobStatus.ASSIGNED, TransportJobStatus.PICKING_UP, TransportJobStatus.IN_TRANSIT, TransportJobStatus.DELIVERING, TransportJobStatus.COMPLETED];
const detailInclude = {
  shipment: { include: { customer: { select: { id: true, companyName: true } } } },
  container: { select: { id: true, containerNo: true, status: true } },
  truck: { select: { id: true, plateNo: true, capacityKg: true, status: true } },
  driver: { select: { id: true, code: true, fullName: true, phone: true, userId: true } },
  events: { include: { updatedBy: { select: { fullName: true } } }, orderBy: { occurredAt: 'asc' as const } },
} satisfies Prisma.TransportJobInclude;

@Injectable()
export class TransportJobsService {
  constructor(private readonly db: PrismaService) {}

  async create(dto: CreateJobDto, req: AuthRequest) {
    const pickupAt = new Date(dto.pickupAt), deliveryAt = new Date(dto.deliveryAt);
    if (deliveryAt <= pickupAt) throw new BadRequestException('Giờ giao phải sau giờ lấy');
    try { return await this.db.$transaction(async tx => {
      // Lock the two shared resources before checking availability, so competing dispatches serialize.
      const truckLock = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trucks WHERE id = ${dto.truckId} FOR UPDATE`;
      const driverLock = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM drivers WHERE id = ${dto.driverId} FOR UPDATE`;
      if (!truckLock.length || !driverLock.length) throw new BadRequestException('Xe hoặc tài xế không tồn tại');
      const [truck, driver, shipment, container, truckConflict, driverConflict, maintenance] = await Promise.all([
        tx.truck.findUniqueOrThrow({ where: { id: dto.truckId } }),
        tx.driver.findUniqueOrThrow({ where: { id: dto.driverId } }),
        tx.shipment.findUnique({ where: { id: dto.shipmentId } }),
        dto.containerId ? tx.container.findUnique({ where: { id: dto.containerId }, include: { shipments: { where: { releasedAt: null } } } }) : Promise.resolve(null),
        tx.transportJob.findFirst({ where: { truckId: dto.truckId, status: { in: active }, pickupAt: { lt: deliveryAt }, deliveryAt: { gt: pickupAt } } }),
        tx.transportJob.findFirst({ where: { driverId: dto.driverId, status: { in: active }, pickupAt: { lt: deliveryAt }, deliveryAt: { gt: pickupAt } } }),
        tx.maintenance.findFirst({ where: { truckId: dto.truckId, completedAt: null, startsAt: { lt: deliveryAt }, endsAt: { gt: pickupAt } } }),
      ]);
      if (!shipment || shipment.status === ShipmentStatus.CANCELLED || shipment.status === ShipmentStatus.COMPLETED) throw new BadRequestException('Shipment không tồn tại hoặc đã kết thúc');
      if (dto.containerId && (!container || !container.shipments.some(link => link.shipmentId === shipment.id))) throw new BadRequestException('Container không đang thuộc Shipment này');
      if (container?.status === ContainerStatus.EMPTY_RETURNED) throw new BadRequestException('Container đã trả rỗng');
      if (truck.status === TruckStatus.MAINTENANCE || maintenance) throw new ConflictException('Xe đang hoặc sẽ bảo dưỡng trong lịch chuyến');
      if (truckConflict) throw new ConflictException('Xe bị trùng lịch');
      if (driverConflict) throw new ConflictException('Tài xế bị trùng lịch');
      if (driver.status === DriverStatus.OFF_DUTY) throw new ConflictException('Tài xế đang nghỉ');
      if (driver.licenseExpires < deliveryAt) throw new BadRequestException('GPLX hết hạn trước khi chuyến kết thúc');
      if (truck.inspectionExpires && truck.inspectionExpires < deliveryAt) throw new BadRequestException('Đăng kiểm xe hết hạn trước khi chuyến kết thúc');
      if (truck.insuranceExpires && truck.insuranceExpires < deliveryAt) throw new BadRequestException('Bảo hiểm xe hết hạn trước khi chuyến kết thúc');
      if (shipment.weightKg && Number(shipment.weightKg) > Number(truck.capacityKg)) throw new BadRequestException('Xe không phù hợp tải trọng Shipment');
      const job = await tx.transportJob.create({ data: { jobNo: upper(dto.jobNo), shipmentId: dto.shipmentId, containerId: dto.containerId, truckId: dto.truckId, driverId: dto.driverId, pickupPlace: dto.pickupPlace.trim(), deliveryPlace: dto.deliveryPlace.trim(), pickupAt, deliveryAt, notes: dto.notes } });
      await tx.transportJobEvent.create({ data: { jobId: job.id, status: TransportJobStatus.ASSIGNED, occurredAt: new Date(), updatedById: req.authUser.id, note: 'Điều xe' } });
      await tx.truck.update({ where: { id: dto.truckId }, data: { status: TruckStatus.ASSIGNED } });
      await tx.driver.update({ where: { id: dto.driverId }, data: { status: DriverStatus.ASSIGNED } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'TRANSPORT_JOB_CREATED', entity: 'TransportJob', entityId: job.id, changes: { jobNo: job.jobNo, truckId: job.truckId, driverId: job.driverId, shipmentId: job.shipmentId }, ipAddress: req.ip } });
      return job;
    }); } catch (error) { handleDatabaseError(error); }
  }

  async addEvent(id: string, dto: JobEventDto, req: AuthRequest, driverOnly: boolean) {
    if (dto.status === TransportJobStatus.ASSIGNED) throw new BadRequestException('Không thể quay lại trạng thái đã điều xe');
    if (driverOnly && dto.status === TransportJobStatus.CANCELLED) throw new ForbiddenException('Tài xế không thể hủy chuyến');
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('Thời gian thực tế không được ở tương lai');
    return this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM transport_jobs WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Không tìm thấy chuyến');
      const job = await tx.transportJob.findUniqueOrThrow({ where: { id }, include: { driver: true } });
      if (driverOnly && job.driver.userId !== req.authUser.id) throw new ForbiddenException('Chỉ được cập nhật chuyến được giao');
      if (job.status === TransportJobStatus.COMPLETED || job.status === TransportJobStatus.CANCELLED) throw new BadRequestException('Chuyến đã kết thúc');
      if (dto.status !== TransportJobStatus.CANCELLED && progress.indexOf(dto.status) <= progress.indexOf(job.status)) throw new BadRequestException('Tiến độ mới phải sau bước hiện tại');
      const changed = await tx.transportJob.update({ where: { id }, data: { status: dto.status, actualPickupAt: dto.status === TransportJobStatus.PICKING_UP ? occurredAt : undefined, actualDeliveryAt: dto.status === TransportJobStatus.COMPLETED ? occurredAt : undefined, loadedKm: dto.loadedKm, emptyKm: dto.emptyKm } });
      const event = await tx.transportJobEvent.create({ data: { jobId: id, status: dto.status, occurredAt, note: dto.note, updatedById: req.authUser.id } });
      if (dto.status === TransportJobStatus.COMPLETED || dto.status === TransportJobStatus.CANCELLED) {
        const [otherTruckJobs, otherDriverJobs, currentMaintenance] = await Promise.all([
          tx.transportJob.count({ where: { truckId: job.truckId, id: { not: id }, status: { in: active } } }),
          tx.transportJob.count({ where: { driverId: job.driverId, id: { not: id }, status: { in: active } } }),
          tx.maintenance.count({ where: { truckId: job.truckId, completedAt: null, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } }),
        ]);
        await tx.truck.update({ where: { id: job.truckId }, data: { status: currentMaintenance ? TruckStatus.MAINTENANCE : otherTruckJobs ? TruckStatus.ASSIGNED : TruckStatus.AVAILABLE } });
        await tx.driver.update({ where: { id: job.driverId }, data: { status: otherDriverJobs ? DriverStatus.ASSIGNED : DriverStatus.AVAILABLE } });
      } else {
        const truckStatus = dto.status === TransportJobStatus.PICKING_UP ? TruckStatus.PICKING_UP : dto.status === TransportJobStatus.IN_TRANSIT ? TruckStatus.IN_TRANSIT : TruckStatus.DELIVERING;
        await tx.truck.update({ where: { id: job.truckId }, data: { status: truckStatus } });
        await tx.driver.update({ where: { id: job.driverId }, data: { status: DriverStatus.ON_TRIP } });
      }
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'TRANSPORT_JOB_STATUS_CHANGED', entity: 'TransportJob', entityId: id, changes: { before: job.status, after: dto.status, occurredAt: dto.occurredAt }, ipAddress: req.ip } });
      return { ...changed, event };
    });
  }
}

@Controller('transport-jobs')
export class TransportJobsController {
  constructor(private readonly db: PrismaService, private readonly service: TransportJobsService) {}
  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string, @Query('shipmentId') shipmentId?: string, @Query('containerId') containerId?: string) { return this.db.transportJob.findMany({ where: { shipmentId, containerId, OR: q ? [{ jobNo: { contains: q.trim(), mode: 'insensitive' } }, { truck: { plateNo: { contains: q.trim(), mode: 'insensitive' } } }, { driver: { fullName: { contains: q.trim(), mode: 'insensitive' } } }] : undefined }, include: { shipment: { select: { id: true, shipmentNo: true } }, container: { select: { containerNo: true } }, truck: { select: { plateNo: true } }, driver: { select: { fullName: true } } }, orderBy: { pickupAt: 'desc' }, take: 100 }); }
  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) { const job = await this.db.transportJob.findUnique({ where: { id }, include: detailInclude }); if (!job) throw new NotFoundException('Không tìm thấy chuyến'); return job; }
  @Post() @RequirePermission('trucking.manage')
  create(@Body() dto: CreateJobDto, @Req() req: AuthRequest) { return this.service.create(dto, req); }
  @Post(':id/events') @RequirePermission('trucking.manage')
  event(@Param('id') id: string, @Body() dto: JobEventDto, @Req() req: AuthRequest) { return this.service.addEvent(id, dto, req, false); }
}

@Controller('my-jobs')
export class MyJobsController {
  constructor(private readonly db: PrismaService, private readonly service: TransportJobsService) {}
  @Get() @RequirePermission('jobs.own.view')
  list(@Req() req: AuthRequest) { return this.db.transportJob.findMany({ where: { driver: { userId: req.authUser.id } }, include: { shipment: { select: { shipmentNo: true } }, container: { select: { containerNo: true } }, truck: { select: { plateNo: true } } }, orderBy: { pickupAt: 'desc' }, take: 100 }); }
  @Get(':id') @RequirePermission('jobs.own.view')
  async detail(@Param('id') id: string, @Req() req: AuthRequest) { const job = await this.db.transportJob.findFirst({ where: { id, driver: { userId: req.authUser.id } }, include: detailInclude }); if (!job) throw new NotFoundException('Không tìm thấy chuyến được giao'); return job; }
  @Post(':id/events') @RequirePermission('jobs.own.update')
  event(@Param('id') id: string, @Body() dto: JobEventDto, @Req() req: AuthRequest) { return this.service.addEvent(id, dto, req, true); }
}
