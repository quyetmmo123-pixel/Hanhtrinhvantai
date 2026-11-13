import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ContainerStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { AssignContainerDto, ContainerDto, ContainerEventDto, UpdateContainerDto } from './operations.dto';
import { handleDatabaseError, upper } from './operations.util';

const statuses = Object.values(ContainerStatus);

@Controller('containers')
export class ContainersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string, @Query('status') status?: ContainerStatus) {
    const search = q?.trim().slice(0, 100);
    const normalizedStatus = status?.trim() || undefined;
    if (normalizedStatus && !statuses.includes(normalizedStatus as ContainerStatus)) throw new BadRequestException('Trạng thái không hợp lệ');
    return this.prisma.container.findMany({
      where: { status: normalizedStatus as ContainerStatus | undefined, OR: search ? [
        { containerNo: { contains: search, mode: 'insensitive' } },
        { sealNo: { contains: search, mode: 'insensitive' } },
        { shipments: { some: { shipment: { shipmentNo: { contains: search, mode: 'insensitive' } } } } },
      ] : undefined },
      include: { shipments: { where: { releasedAt: null }, include: { shipment: { select: { id: true, shipmentNo: true, customer: { select: { companyName: true } } } }, booking: { select: { id: true, bookingNo: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) {
    const container = await this.prisma.container.findUnique({
      where: { id }, include: {
        shipments: { include: { shipment: { include: { customer: true, pol: true, pod: true, bookings: { include: { billsOfLading: true } } } }, booking: { include: { billsOfLading: true } } }, orderBy: { assignedAt: 'desc' } },
        events: { include: { updatedBy: { select: { fullName: true } }, shipment: { select: { shipmentNo: true } } }, orderBy: { occurredAt: 'desc' } },
        transportJobs: { include: { truck: { select: { id: true, plateNo: true } }, driver: { select: { id: true, fullName: true, phone: true } }, shipment: { select: { id: true, shipmentNo: true } } }, orderBy: { pickupAt: 'desc' } },
      },
    });
    if (!container) throw new NotFoundException('Không tìm thấy Container');
    return container;
  }

  @Post() @RequirePermission('shipments.manage')
  async create(@Body() dto: ContainerDto, @Req() req: AuthRequest) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const container = await tx.container.create({ data: { containerNo: upper(dto.containerNo), type: dto.type, sealNo: dto.sealNo, shippingLine: dto.shippingLine, notes: dto.notes } });
        await tx.containerEvent.create({ data: { containerId: container.id, status: ContainerStatus.EMPTY_RELEASED, occurredAt: new Date(), updatedById: req.authUser.id, note: 'Tạo hồ sơ container' } });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CONTAINER_CREATED', entity: 'Container', entityId: container.id, changes: { containerNo: container.containerNo, type: container.type }, ipAddress: req.ip } });
        return container;
      });
    } catch (error) { handleDatabaseError(error); }
  }

  @Patch(':id') @RequirePermission('shipments.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateContainerDto, @Req() req: AuthRequest) {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Không có thay đổi nào');
    const before = await this.prisma.container.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy Container');
    return this.prisma.$transaction(async (tx) => {
      const container = await tx.container.update({ where: { id }, data: dto });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CONTAINER_UPDATED', entity: 'Container', entityId: id, changes: { before: { type: before.type, sealNo: before.sealNo }, after: { type: container.type, sealNo: container.sealNo } }, ipAddress: req.ip } });
      return container;
    });
  }

  @Post(':id/assign') @RequirePermission('shipments.manage')
  async assign(@Param('id') id: string, @Body() dto: AssignContainerDto, @Req() req: AuthRequest) {
    const [container, shipment, booking, active] = await Promise.all([
      this.prisma.container.findUnique({ where: { id } }),
      this.prisma.shipment.findUnique({ where: { id: dto.shipmentId } }),
      dto.bookingId ? this.prisma.booking.findUnique({ where: { id: dto.bookingId } }) : Promise.resolve(null),
      this.prisma.shipmentContainer.findFirst({ where: { containerId: id, releasedAt: null } }),
    ]);
    if (!container) throw new NotFoundException('Không tìm thấy Container');
    if (!shipment) throw new BadRequestException('Shipment không tồn tại');
    if (shipment.status === ShipmentStatus.CANCELLED || shipment.status === ShipmentStatus.COMPLETED) throw new BadRequestException('Shipment đã kết thúc');
    if (dto.bookingId && (!booking || booking.shipmentId !== shipment.id)) throw new BadRequestException('Booking không thuộc Shipment đã chọn');
    if (active) throw new ConflictException('Container đang thuộc một Shipment khác');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.shipmentContainer.create({ data: { containerId: id, shipmentId: shipment.id, bookingId: dto.bookingId } });
        if (container.status === ContainerStatus.EMPTY_RETURNED) {
          await tx.container.update({ where: { id }, data: { status: ContainerStatus.EMPTY_RELEASED } });
          await tx.containerEvent.create({ data: { containerId: id, shipmentId: shipment.id, status: ContainerStatus.EMPTY_RELEASED, occurredAt: new Date(), updatedById: req.authUser.id, note: 'Bắt đầu chu kỳ vận chuyển mới' } });
        }
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CONTAINER_ASSIGNED', entity: 'Container', entityId: id, changes: { shipmentId: shipment.id, bookingId: dto.bookingId || null }, ipAddress: req.ip } });
        return assignment;
      });
    } catch (error) { handleDatabaseError(error); }
  }

  @Post(':id/release') @RequirePermission('shipments.manage')
  async release(@Param('id') id: string, @Req() req: AuthRequest) {
    const active = await this.prisma.shipmentContainer.findFirst({ where: { containerId: id, releasedAt: null } });
    if (!active) throw new BadRequestException('Container không có Shipment đang liên kết');
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.shipmentContainer.update({ where: { id: active.id }, data: { releasedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CONTAINER_RELEASED', entity: 'Container', entityId: id, changes: { shipmentId: active.shipmentId }, ipAddress: req.ip } });
      return assignment;
    });
  }

  @Post(':id/events') @RequirePermission('shipments.manage')
  async addEvent(@Param('id') id: string, @Body() dto: ContainerEventDto, @Req() req: AuthRequest) {
    const container = await this.prisma.container.findUnique({ where: { id } });
    if (!container) throw new NotFoundException('Không tìm thấy Container');
    if (new Date(dto.occurredAt).getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('Thời gian thực tế không được ở tương lai');
    if (statuses.indexOf(dto.status) <= statuses.indexOf(container.status)) throw new BadRequestException('Trạng thái mới phải ở bước tiếp theo trong hành trình');
    const active = await this.prisma.shipmentContainer.findFirst({ where: { containerId: id, releasedAt: null } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await tx.container.updateMany({ where: { id, status: container.status }, data: { status: dto.status } });
        if (changed.count !== 1) throw new ConflictException('Trạng thái Container đã thay đổi, vui lòng tải lại');
        const event = await tx.containerEvent.create({ data: { containerId: id, shipmentId: active?.shipmentId, status: dto.status, occurredAt: new Date(dto.occurredAt), note: dto.note, updatedById: req.authUser.id } });
        if (active && (dto.status === ContainerStatus.LOADED_ON_VESSEL || dto.status === ContainerStatus.VESSEL_DEPARTED || dto.status === ContainerStatus.IN_TRANSIT)) {
          await tx.shipment.updateMany({ where: { id: active.shipmentId, status: { notIn: [ShipmentStatus.CANCELLED, ShipmentStatus.COMPLETED] } }, data: { status: ShipmentStatus.IN_TRANSIT } });
        }
        if (active && dto.status === ContainerStatus.EMPTY_RETURNED) await tx.shipmentContainer.update({ where: { id: active.id }, data: { releasedAt: new Date(dto.occurredAt) } });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CONTAINER_STATUS_CHANGED', entity: 'Container', entityId: id, changes: { before: container.status, after: dto.status, occurredAt: dto.occurredAt }, ipAddress: req.ip } });
        return event;
      });
    } catch (error) { handleDatabaseError(error); }
  }
}
