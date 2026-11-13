import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { DriverStatus, Prisma, TransportJobStatus, TruckStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { handleDatabaseError, upper } from '../operations/operations.util';
import { DriverDto, MaintenanceDto, TrailerDto, TruckDto, UpdateDriverDto, UpdateTrailerDto, UpdateTruckDto } from './trucking.dto';

const openStatuses = [TransportJobStatus.ASSIGNED, TransportJobStatus.PICKING_UP, TransportJobStatus.IN_TRANSIT, TransportJobStatus.DELIVERING];
const trim = (value: string) => value.trim();

@Controller('trucks')
export class TrucksController {
  constructor(private readonly db: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string) { return this.db.truck.findMany({ where: q ? { plateNo: { contains: q.trim().slice(0, 100), mode: 'insensitive' } } : undefined, include: { _count: { select: { jobs: true, trailers: true } } }, orderBy: { plateNo: 'asc' }, take: 100 }); }

  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) {
    const truck = await this.db.truck.findUnique({ where: { id }, include: { trailers: true, maintenance: { orderBy: { startsAt: 'desc' } }, jobs: { include: { shipment: { select: { shipmentNo: true } }, driver: { select: { fullName: true } } }, orderBy: { pickupAt: 'desc' }, take: 100 } } });
    if (!truck) throw new NotFoundException('Không tìm thấy xe');
    return truck;
  }

  @Post() @RequirePermission('trucking.manage')
  async create(@Body() dto: TruckDto, @Req() req: AuthRequest) {
    try { return await this.db.$transaction(async tx => {
      const truck = await tx.truck.create({ data: { ...dto, plateNo: upper(dto.plateNo), inspectionExpires: dto.inspectionExpires ? new Date(dto.inspectionExpires) : undefined, insuranceExpires: dto.insuranceExpires ? new Date(dto.insuranceExpires) : undefined } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'TRUCK_CREATED', entity: 'Truck', entityId: truck.id, changes: { plateNo: truck.plateNo, capacityKg: String(truck.capacityKg) }, ipAddress: req.ip } });
      return truck;
    }); } catch (error) { handleDatabaseError(error); }
  }

  @Patch(':id') @RequirePermission('trucking.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateTruckDto, @Req() req: AuthRequest) {
    if (!Object.keys(dto).length) throw new BadRequestException('Không có thay đổi');
    const before = await this.db.truck.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy xe');
    try { return await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trucks WHERE id = ${id} FOR UPDATE`;
      if (dto.capacityKg !== undefined) {
        const jobs = await tx.transportJob.findMany({ where: { truckId: id, status: { in: openStatuses } }, include: { shipment: { select: { weightKg: true } } } });
        if (jobs.some(job => job.shipment.weightKg && Number(job.shipment.weightKg) > dto.capacityKg!)) throw new ConflictException('Tải trọng mới không đủ cho chuyến đang mở');
      }
      const truck = await tx.truck.update({ where: { id }, data: { ...dto, inspectionExpires: dto.inspectionExpires ? new Date(dto.inspectionExpires) : undefined, insuranceExpires: dto.insuranceExpires ? new Date(dto.insuranceExpires) : undefined } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'TRUCK_UPDATED', entity: 'Truck', entityId: id, changes: { before: { capacityKg: String(before.capacityKg), type: before.type }, after: { capacityKg: String(truck.capacityKg), type: truck.type } }, ipAddress: req.ip } });
      return truck;
    }); } catch (error) { handleDatabaseError(error); }
  }

  @Post(':id/maintenance') @RequirePermission('trucking.manage')
  async scheduleMaintenance(@Param('id') id: string, @Body() dto: MaintenanceDto, @Req() req: AuthRequest) {
    const startsAt = new Date(dto.startsAt), endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    return this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trucks WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Không tìm thấy xe');
      const [job, maintenance] = await Promise.all([
        tx.transportJob.findFirst({ where: { truckId: id, status: { in: openStatuses }, pickupAt: { lt: endsAt }, deliveryAt: { gt: startsAt } } }),
        tx.maintenance.findFirst({ where: { truckId: id, completedAt: null, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }),
      ]);
      if (job || maintenance) throw new ConflictException('Xe có chuyến hoặc lịch bảo dưỡng trùng thời gian');
      const item = await tx.maintenance.create({ data: { truckId: id, startsAt, endsAt, description: trim(dto.description) } });
      if (startsAt <= new Date() && endsAt > new Date()) await tx.truck.update({ where: { id }, data: { status: TruckStatus.MAINTENANCE } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'MAINTENANCE_SCHEDULED', entity: 'Maintenance', entityId: item.id, changes: { truckId: id, startsAt: dto.startsAt, endsAt: dto.endsAt }, ipAddress: req.ip } });
      return item;
    });
  }

  @Patch(':id/maintenance/:maintenanceId/complete') @RequirePermission('trucking.manage')
  async completeMaintenance(@Param('id') id: string, @Param('maintenanceId') maintenanceId: string, @Req() req: AuthRequest) {
    return this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM trucks WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Không tìm thấy xe');
      const maintenance = await tx.maintenance.findFirst({ where: { id: maintenanceId, truckId: id, completedAt: null } });
      if (!maintenance) throw new NotFoundException('Không tìm thấy lịch bảo dưỡng đang mở');
      const updated = await tx.maintenance.update({ where: { id: maintenanceId }, data: { completedAt: new Date() } });
      const activeMaintenance = await tx.maintenance.count({ where: { truckId: id, completedAt: null, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } });
      const activeJobs = await tx.transportJob.count({ where: { truckId: id, status: { in: openStatuses } } });
      await tx.truck.update({ where: { id }, data: { status: activeMaintenance ? TruckStatus.MAINTENANCE : activeJobs ? TruckStatus.ASSIGNED : TruckStatus.AVAILABLE } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'MAINTENANCE_COMPLETED', entity: 'Maintenance', entityId: maintenanceId, changes: { truckId: id }, ipAddress: req.ip } });
      return updated;
    });
  }
}

@Controller('trailers')
export class TrailersController {
  constructor(private readonly db: PrismaService) {}
  @Get() @RequirePermission('operations.view')
  list() { return this.db.trailer.findMany({ include: { truck: { select: { id: true, plateNo: true } } }, orderBy: { plateNo: 'asc' }, take: 100 }); }
  @Post() @RequirePermission('trucking.manage')
  async create(@Body() dto: TrailerDto, @Req() req: AuthRequest) {
    try { return await this.db.$transaction(async tx => {
      const item = await tx.trailer.create({ data: { ...dto, plateNo: upper(dto.plateNo), type: trim(dto.type) } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'TRAILER_CREATED', entity: 'Trailer', entityId: item.id, changes: { plateNo: item.plateNo }, ipAddress: req.ip } });
      return item;
    }); } catch (error) { handleDatabaseError(error); }
  }
  @Patch(':id') @RequirePermission('trucking.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateTrailerDto, @Req() req: AuthRequest) {
    if (!Object.keys(dto).length) throw new BadRequestException('Không có thay đổi');
    try { return await this.db.$transaction(async tx => {
      const item = await tx.trailer.update({ where: { id }, data: { ...dto, type: dto.type?.trim() } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'TRAILER_UPDATED', entity: 'Trailer', entityId: id, changes: { type: item.type, truckId: item.truckId, capacityKg: String(item.capacityKg) }, ipAddress: req.ip } });
      return item;
    }); } catch (error) { handleDatabaseError(error); }
  }
}

@Controller('drivers')
export class DriversController {
  constructor(private readonly db: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string) { return this.db.driver.findMany({ where: q ? { OR: [{ code: { contains: q.trim(), mode: 'insensitive' } }, { fullName: { contains: q.trim(), mode: 'insensitive' } }, { licenseNo: { contains: q.trim(), mode: 'insensitive' } }] } : undefined, include: { assignedTruck: { select: { plateNo: true } }, user: { select: { email: true } } }, orderBy: { fullName: 'asc' }, take: 100 }); }

  @Get('users') @RequirePermission('trucking.manage')
  availableUsers() { return this.db.user.findMany({ where: { active: true, roles: { some: { role: { code: 'DRIVER' } } } }, select: { id: true, email: true, fullName: true, driverProfile: { select: { id: true } } }, orderBy: { fullName: 'asc' } }); }

  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) {
    const item = await this.db.driver.findUnique({ where: { id }, include: { assignedTruck: true, user: { select: { id: true, email: true } }, jobs: { include: { shipment: { select: { shipmentNo: true } }, truck: { select: { plateNo: true } } }, orderBy: { pickupAt: 'desc' }, take: 100 } } });
    if (!item) throw new NotFoundException('Không tìm thấy tài xế');
    return item;
  }

  private async checkUser(tx: Prisma.TransactionClient, userId?: string) {
    if (!userId) return;
    const user = await tx.user.findFirst({ where: { id: userId, active: true, roles: { some: { role: { code: 'DRIVER' } } } } });
    if (!user) throw new BadRequestException('Tài khoản liên kết phải có vai trò DRIVER');
  }

  @Post() @RequirePermission('trucking.manage')
  async create(@Body() dto: DriverDto, @Req() req: AuthRequest) {
    try { return await this.db.$transaction(async tx => {
      await this.checkUser(tx, dto.userId);
      const item = await tx.driver.create({ data: { ...dto, code: upper(dto.code), fullName: trim(dto.fullName), licenseNo: upper(dto.licenseNo), licenseClass: upper(dto.licenseClass), licenseExpires: new Date(dto.licenseExpires) } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'DRIVER_CREATED', entity: 'Driver', entityId: item.id, changes: { code: item.code, userId: item.userId }, ipAddress: req.ip } });
      return item;
    }); } catch (error) { handleDatabaseError(error); }
  }

  @Patch(':id') @RequirePermission('trucking.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateDriverDto, @Req() req: AuthRequest) {
    if (!Object.keys(dto).length) throw new BadRequestException('Không có thay đổi');
    const before = await this.db.driver.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy tài xế');
    try { return await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${id} FOR UPDATE`;
      await this.checkUser(tx, dto.userId);
      if (dto.status && dto.status !== DriverStatus.AVAILABLE && dto.status !== DriverStatus.OFF_DUTY) throw new BadRequestException('Trạng thái đang chạy được cập nhật theo tiến độ chuyến');
      if (dto.status && await tx.transportJob.count({ where: { driverId: id, status: { in: openStatuses } } })) throw new ConflictException('Tài xế còn chuyến đang mở');
      const item = await tx.driver.update({ where: { id }, data: { ...dto, fullName: dto.fullName?.trim(), licenseNo: dto.licenseNo ? upper(dto.licenseNo) : undefined, licenseClass: dto.licenseClass ? upper(dto.licenseClass) : undefined, licenseExpires: dto.licenseExpires ? new Date(dto.licenseExpires) : undefined } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'DRIVER_UPDATED', entity: 'Driver', entityId: id, changes: { before: { status: before.status, assignedTruckId: before.assignedTruckId }, after: { status: item.status, assignedTruckId: item.assignedTruckId } }, ipAddress: req.ip } });
      return item;
    }); } catch (error) { handleDatabaseError(error); }
  }
}
