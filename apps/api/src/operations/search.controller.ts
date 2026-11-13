import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequirePermission } from '../auth/auth.decorators';

@Controller('search')
@RequirePermission('operations.view')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@Query('q') q?: string) {
    const term = q?.trim().slice(0, 100);
    if (!term || term.length < 2) throw new BadRequestException('Nhập ít nhất 2 ký tự');
    const [containers, shipments, bookings, billsOfLading, customers, trucks, drivers, transportJobs, vessels, voyages] = await Promise.all([
      this.prisma.container.findMany({ where: { containerNo: { contains: term, mode: 'insensitive' } }, include: { shipments: { where: { releasedAt: null }, include: { shipment: { select: { id: true, shipmentNo: true, customer: { select: { companyName: true } } } }, booking: { select: { bookingNo: true } } } } }, take: 10 }),
      this.prisma.shipment.findMany({ where: { shipmentNo: { contains: term, mode: 'insensitive' } }, include: { customer: { select: { companyName: true } } }, take: 10 }),
      this.prisma.booking.findMany({ where: { bookingNo: { contains: term, mode: 'insensitive' } }, include: { shipment: { select: { id: true, shipmentNo: true } }, billsOfLading: true }, take: 10 }),
      this.prisma.billOfLading.findMany({ where: { blNo: { contains: term, mode: 'insensitive' } }, include: { booking: { include: { shipment: { select: { id: true, shipmentNo: true } } } } }, take: 10 }),
      this.prisma.customer.findMany({ where: { OR: [{ code: { contains: term, mode: 'insensitive' } }, { companyName: { contains: term, mode: 'insensitive' } }] }, take: 10 }),
      this.prisma.truck.findMany({ where: { plateNo: { contains: term, mode: 'insensitive' } }, take: 10 }),
      this.prisma.driver.findMany({ where: { OR: [{ code: { contains: term, mode: 'insensitive' } }, { fullName: { contains: term, mode: 'insensitive' } }, { licenseNo: { contains: term, mode: 'insensitive' } }] }, take: 10 }),
      this.prisma.transportJob.findMany({ where: { jobNo: { contains: term, mode: 'insensitive' } }, include: { truck: { select: { plateNo: true } }, driver: { select: { fullName: true } } }, take: 10 }),
      this.prisma.vessel.findMany({ where: { OR: [{ name: { contains: term, mode: 'insensitive' } }, { imo: { contains: term } }, { mmsi: { contains: term, mode: 'insensitive' } }] }, take: 10 }),
      this.prisma.voyage.findMany({ where: { voyageNo: { contains: term, mode: 'insensitive' } }, include: { vessel: { select: { id: true, name: true, imo: true } } }, take: 10 }),
    ]);
    return { containers, shipments, bookings, billsOfLading, customers, trucks, drivers, transportJobs, vessels, voyages };
  }
}
