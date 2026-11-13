import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthRequest } from '../auth/auth.types';
import { RequirePermission } from '../auth/auth.decorators';
import { CustomerDto, UpdateCustomerDto } from './operations.dto';
import { handleDatabaseError, upper } from './operations.util';

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('q') q?: string) {
    const search = q?.trim().slice(0, 100);
    return this.prisma.customer.findMany({
      where: search ? { OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { taxId: { contains: search, mode: 'insensitive' } },
      ] } : undefined,
      include: { _count: { select: { shipments: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id') @RequirePermission('operations.view')
  async detail(@Param('id') id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id }, include: { shipments: { select: { id: true, shipmentNo: true, cargoName: true, status: true, eta: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return customer;
  }

  @Post() @RequirePermission('shipments.manage')
  async create(@Body() dto: CustomerDto, @Req() req: AuthRequest) {
    const code = upper(dto.code);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({ data: { ...dto, code, companyName: dto.companyName.trim() } });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CUSTOMER_CREATED', entity: 'Customer', entityId: customer.id, changes: { code, companyName: customer.companyName }, ipAddress: req.ip } });
        return customer;
      });
    } catch (error) { handleDatabaseError(error); }
  }

  @Patch(':id') @RequirePermission('shipments.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: AuthRequest) {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Không có thay đổi nào');
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy khách hàng');
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({ where: { id }, data: { ...dto, companyName: dto.companyName?.trim() } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'CUSTOMER_UPDATED', entity: 'Customer', entityId: id, changes: { before: { companyName: before.companyName, contactName: before.contactName, phone: before.phone, email: before.email, taxId: before.taxId }, after: { companyName: customer.companyName, contactName: customer.contactName, phone: customer.phone, email: customer.email, taxId: customer.taxId } }, ipAddress: req.ip } });
      return customer;
    });
  }
}
