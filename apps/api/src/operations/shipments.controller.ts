import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Prisma, ShipmentMilestone, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { ShipmentDto, ShipmentEventDto, UpdateShipmentDto } from './operations.dto';
import { handleDatabaseError, toDate, upper } from './operations.util';

const detailInclude = {
  customer: true, pol: true, pod: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  bookings: { include: { billsOfLading: true }, orderBy: { createdAt: 'asc' as const } },
  containers: { include: { container: true, booking: true }, orderBy: { assignedAt: 'desc' as const } },
  events: { include: { updatedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' as const } },
  transportJobs: { include: { truck: { select: { id: true, plateNo: true } }, driver: { select: { id: true, fullName: true } }, container: { select: { id: true, containerNo: true } } }, orderBy: { pickupAt: 'desc' as const } },
} satisfies Prisma.ShipmentInclude;

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string, @Query('status') status?: ShipmentStatus, @Query('customerId') customerId?: string) {
    const search = q?.trim().slice(0, 100);
    const normalizedStatus = status?.trim() || undefined;
    if (normalizedStatus && !Object.values(ShipmentStatus).includes(normalizedStatus as ShipmentStatus)) throw new BadRequestException('Trạng thái không hợp lệ');
    return this.prisma.shipment.findMany({
      where: {
        status: normalizedStatus as ShipmentStatus | undefined, customerId: customerId?.trim() || undefined,
        OR: search ? [
          { shipmentNo: { contains: search, mode: 'insensitive' } },
          { cargoName: { contains: search, mode: 'insensitive' } },
          { customer: { companyName: { contains: search, mode: 'insensitive' } } },
          { bookings: { some: { bookingNo: { contains: search, mode: 'insensitive' } } } },
          { containers: { some: { container: { containerNo: { contains: search, mode: 'insensitive' } } } } },
        ] : undefined,
      },
      include: { customer: { select: { id: true, code: true, companyName: true } }, pol: true, pod: true, _count: { select: { bookings: true, containers: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id }, include: detailInclude });
    if (!shipment) throw new NotFoundException('Không tìm thấy Shipment');
    return shipment;
  }

  @Post() @RequirePermission('shipments.manage')
  async create(@Body() dto: ShipmentDto, @Req() req: AuthRequest) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.create({ data: {
          shipmentNo: upper(dto.shipmentNo), customerId: dto.customerId, cargoName: dto.cargoName.trim(),
          shipper: dto.shipper, consignee: dto.consignee, cargoType: dto.cargoType,
          quantity: dto.quantity, weightKg: dto.weightKg, cbm: dto.cbm, incoterm: dto.incoterm,
          polId: dto.polId, podId: dto.podId, placeOfReceipt: dto.placeOfReceipt, placeOfDelivery: dto.placeOfDelivery,
          etd: toDate(dto.etd), eta: toDate(dto.eta), assigneeId: dto.assigneeId, notes: dto.notes,
        } });
        await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, milestone: ShipmentMilestone.CREATED, actualAt: new Date(), updatedById: req.authUser.id } });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'SHIPMENT_CREATED', entity: 'Shipment', entityId: shipment.id, changes: { shipmentNo: shipment.shipmentNo, customerId: shipment.customerId }, ipAddress: req.ip } });
        return shipment;
      });
    } catch (error) { handleDatabaseError(error); }
  }

  @Patch(':id') @RequirePermission('shipments.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateShipmentDto, @Req() req: AuthRequest) {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Không có thay đổi nào');
    const before = await this.prisma.shipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy Shipment');
    if ((before.status === ShipmentStatus.COMPLETED || before.status === ShipmentStatus.CANCELLED) && dto.status && dto.status !== before.status) throw new BadRequestException('Shipment đã kết thúc');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.update({ where: { id }, data: {
          customerId: dto.customerId, cargoName: dto.cargoName?.trim(), shipper: dto.shipper,
          consignee: dto.consignee, cargoType: dto.cargoType, quantity: dto.quantity,
          weightKg: dto.weightKg, cbm: dto.cbm, incoterm: dto.incoterm, polId: dto.polId, podId: dto.podId,
          placeOfReceipt: dto.placeOfReceipt, placeOfDelivery: dto.placeOfDelivery,
          etd: toDate(dto.etd), atd: toDate(dto.atd), eta: toDate(dto.eta), ata: toDate(dto.ata),
          status: dto.status, assigneeId: dto.assigneeId, notes: dto.notes,
        } });
        if (dto.status === ShipmentStatus.COMPLETED && before.status !== ShipmentStatus.COMPLETED) {
          await tx.shipmentEvent.create({ data: { shipmentId: id, milestone: ShipmentMilestone.COMPLETED, actualAt: new Date(), updatedById: req.authUser.id } });
        }
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'SHIPMENT_UPDATED', entity: 'Shipment', entityId: id, changes: { before: { status: before.status, eta: before.eta?.toISOString(), assigneeId: before.assigneeId }, after: { status: shipment.status, eta: shipment.eta?.toISOString(), assigneeId: shipment.assigneeId } }, ipAddress: req.ip } });
        return shipment;
      });
    } catch (error) { handleDatabaseError(error); }
  }

  @Post(':id/events') @RequirePermission('shipments.manage')
  async addEvent(@Param('id') id: string, @Body() dto: ShipmentEventDto, @Req() req: AuthRequest) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id } });
    if (!shipment) throw new NotFoundException('Không tìm thấy Shipment');
    if (!dto.plannedAt && !dto.actualAt) throw new BadRequestException('Cần thời gian dự kiến hoặc thực tế');
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.shipmentEvent.create({ data: { shipmentId: id, milestone: dto.milestone, plannedAt: toDate(dto.plannedAt), actualAt: toDate(dto.actualAt), note: dto.note, updatedById: req.authUser.id } });
      let nextStatus: ShipmentStatus | undefined;
      if (dto.actualAt) {
        if (dto.milestone === ShipmentMilestone.BOOKING && shipment.status === ShipmentStatus.NEW) nextStatus = ShipmentStatus.PROCESSING;
        if (dto.milestone === ShipmentMilestone.LOADED_ON_VESSEL || dto.milestone === ShipmentMilestone.VESSEL_DEPARTED) nextStatus = ShipmentStatus.IN_TRANSIT;
        if (dto.milestone === ShipmentMilestone.COMPLETED) nextStatus = ShipmentStatus.COMPLETED;
      }
      if (nextStatus && shipment.status !== ShipmentStatus.CANCELLED) await tx.shipment.update({ where: { id }, data: { status: nextStatus } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'SHIPMENT_EVENT_ADDED', entity: 'Shipment', entityId: id, changes: { milestone: dto.milestone, plannedAt: dto.plannedAt || null, actualAt: dto.actualAt || null }, ipAddress: req.ip } });
      return event;
    });
  }
}
