import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { BookingStatus, ShipmentMilestone, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { BillOfLadingDto, BookingDto, UpdateBookingDto } from './operations.dto';
import { handleDatabaseError, toDate, upper } from './operations.util';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string, @Query('shipmentId') shipmentId?: string) {
    const search = q?.trim().slice(0, 100);
    return this.prisma.booking.findMany({
      where: { shipmentId, OR: search ? [
        { bookingNo: { contains: search, mode: 'insensitive' } },
        { shippingLine: { contains: search, mode: 'insensitive' } },
        { billsOfLading: { some: { blNo: { contains: search, mode: 'insensitive' } } } },
      ] : undefined },
      include: { shipment: { select: { id: true, shipmentNo: true, customer: { select: { companyName: true } } } }, billsOfLading: true, _count: { select: { containers: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: { shipment: { include: { customer: true } }, billsOfLading: true, containers: { include: { container: true } } } });
    if (!booking) throw new NotFoundException('Không tìm thấy Booking');
    return booking;
  }

  @Post() @RequirePermission('shipments.manage')
  async create(@Body() dto: BookingDto, @Req() req: AuthRequest) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: dto.shipmentId } });
    if (!shipment) throw new BadRequestException('Shipment không tồn tại');
    if (shipment.status === ShipmentStatus.CANCELLED || shipment.status === ShipmentStatus.COMPLETED) throw new BadRequestException('Shipment đã kết thúc');
    if (dto.status === BookingStatus.CONFIRMED && !dto.confirmedAt) throw new BadRequestException('Booking đã xác nhận cần thời gian xác nhận');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({ data: { bookingNo: upper(dto.bookingNo), shipmentId: dto.shipmentId, shippingLine: dto.shippingLine.trim(), status: dto.status, confirmedAt: toDate(dto.confirmedAt), notes: dto.notes } });
        if (booking.status === BookingStatus.CONFIRMED) {
          await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, milestone: ShipmentMilestone.BOOKING, actualAt: booking.confirmedAt, updatedById: req.authUser.id, note: `Booking ${booking.bookingNo}` } });
          if (shipment.status === ShipmentStatus.NEW) await tx.shipment.update({ where: { id: shipment.id }, data: { status: ShipmentStatus.PROCESSING } });
        }
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'BOOKING_CREATED', entity: 'Booking', entityId: booking.id, changes: { bookingNo: booking.bookingNo, shipmentId: booking.shipmentId }, ipAddress: req.ip } });
        return booking;
      });
    } catch (error) { handleDatabaseError(error); }
  }

  @Patch(':id') @RequirePermission('shipments.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @Req() req: AuthRequest) {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Không có thay đổi nào');
    const before = await this.prisma.booking.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy Booking');
    if (before.status === BookingStatus.CANCELLED && dto.status && dto.status !== before.status) throw new BadRequestException('Booking đã hủy');
    if (dto.status === BookingStatus.CONFIRMED && !dto.confirmedAt && !before.confirmedAt) throw new BadRequestException('Booking đã xác nhận cần thời gian xác nhận');
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({ where: { id }, data: { shippingLine: dto.shippingLine?.trim(), status: dto.status, confirmedAt: toDate(dto.confirmedAt), notes: dto.notes } });
      if (before.status !== BookingStatus.CONFIRMED && booking.status === BookingStatus.CONFIRMED) {
        await tx.shipmentEvent.create({ data: { shipmentId: booking.shipmentId, milestone: ShipmentMilestone.BOOKING, actualAt: booking.confirmedAt || new Date(), updatedById: req.authUser.id, note: `Booking ${booking.bookingNo}` } });
        await tx.shipment.updateMany({ where: { id: booking.shipmentId, status: ShipmentStatus.NEW }, data: { status: ShipmentStatus.PROCESSING } });
      }
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'BOOKING_UPDATED', entity: 'Booking', entityId: id, changes: { before: { status: before.status, shippingLine: before.shippingLine }, after: { status: booking.status, shippingLine: booking.shippingLine } }, ipAddress: req.ip } });
      return booking;
    });
  }
}

@Controller('bills-of-lading')
export class BillsOfLadingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string) {
    const search = q?.trim().slice(0, 100);
    return this.prisma.billOfLading.findMany({ where: search ? { blNo: { contains: search, mode: 'insensitive' } } : undefined, include: { booking: { include: { shipment: { select: { id: true, shipmentNo: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Post() @RequirePermission('shipments.manage')
  async create(@Body() dto: BillOfLadingDto, @Req() req: AuthRequest) {
    if (!await this.prisma.booking.findUnique({ where: { id: dto.bookingId } })) throw new BadRequestException('Booking không tồn tại');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const bill = await tx.billOfLading.create({ data: { blNo: upper(dto.blNo), bookingId: dto.bookingId, issuedAt: toDate(dto.issuedAt), notes: dto.notes } });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'BILL_OF_LADING_CREATED', entity: 'BillOfLading', entityId: bill.id, changes: { blNo: bill.blNo, bookingId: bill.bookingId }, ipAddress: req.ip } });
        return bill;
      });
    } catch (error) { handleDatabaseError(error); }
  }
}
