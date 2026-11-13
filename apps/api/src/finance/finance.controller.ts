import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { InvoiceStatus, Prisma, RevenueCategory } from '@prisma/client';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { CreateCostDto, CreateInvoiceDto, CreatePaymentDto, CreateRevenueDto, UpdateCostDto, UpdateRevenueDto } from './finance.dto';

const invoiceInclude = {
  shipment: { select: { id: true, shipmentNo: true, customer: { select: { code: true, companyName: true } } } },
  lines: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { paidAt: 'asc' as const } },
  revenue: { select: { id: true } },
};

@Controller()
export class FinanceController {
  constructor(private readonly db: PrismaService) {}

  @Get('costs') @RequirePermission('finance.view')
  costs(@Query('shipmentId') shipmentId?: string) {
    return this.db.cost.findMany({ where: shipmentId ? { shipmentId } : undefined, include: { shipment: { select: { id: true, shipmentNo: true, customer: { select: { companyName: true } } } }, createdBy: { select: { fullName: true } } }, orderBy: { occurredAt: 'desc' }, take: 200 });
  }

  @Post('costs') @RequirePermission('finance.manage')
  async createCost(@Body() dto: CreateCostDto, @Req() req: AuthRequest) {
    await this.requireShipment(dto.shipmentId);
    return this.db.$transaction(async (tx) => {
      const item = await tx.cost.create({ data: { ...dto, amount: new Prisma.Decimal(dto.amount), currency: (dto.currency || 'VND').toUpperCase(), occurredAt: new Date(dto.occurredAt), createdById: req.authUser.id }, include: { shipment: { select: { id: true, shipmentNo: true } }, createdBy: { select: { fullName: true } } } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'COST_CREATED', entity: 'Cost', entityId: item.id, changes: { shipmentId: item.shipmentId, category: item.category, amount: item.amount.toString(), currency: item.currency }, ipAddress: req.ip } });
      return item;
    });
  }

  @Patch('costs/:id') @RequirePermission('finance.manage')
  async updateCost(@Param('id') id: string, @Body() dto: UpdateCostDto, @Req() req: AuthRequest) {
    if (!Object.keys(dto).length) throw new BadRequestException('Không có thay đổi');
    const before = await this.db.cost.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy chi phí');
    if (dto.shipmentId) await this.requireShipment(dto.shipmentId);
    return this.db.$transaction(async (tx) => {
    const item = await tx.cost.update({ where: { id }, data: {
      shipmentId: dto.shipmentId, category: dto.category, description: dto.description?.trim(),
      amount: dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount), currency: dto.currency?.toUpperCase(),
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined, notes: dto.notes,
    }, include: { shipment: { select: { id: true, shipmentNo: true } }, createdBy: { select: { fullName: true } } } });
    await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'COST_UPDATED', entity: 'Cost', entityId: id, changes: { before: { shipmentId: before.shipmentId, category: before.category, amount: before.amount.toString(), currency: before.currency }, after: { shipmentId: item.shipmentId, category: item.category, amount: item.amount.toString(), currency: item.currency } }, ipAddress: req.ip } });
    return item;
    });
  }

  @Get('revenues') @RequirePermission('finance.view')
  revenues(@Query('shipmentId') shipmentId?: string) {
    return this.db.revenue.findMany({ where: shipmentId ? { shipmentId } : undefined, include: { shipment: { select: { id: true, shipmentNo: true, customer: { select: { companyName: true } } } }, createdBy: { select: { fullName: true } } }, orderBy: { occurredAt: 'desc' }, take: 200 });
  }

  @Post('revenues') @RequirePermission('finance.manage')
  async createRevenue(@Body() dto: CreateRevenueDto, @Req() req: AuthRequest) {
    if (dto.category === RevenueCategory.INVOICE) throw new BadRequestException('Doanh thu hóa đơn được ghi nhận khi phát hành hóa đơn.');
    await this.requireShipment(dto.shipmentId);
    return this.db.$transaction(async (tx) => {
      const item = await tx.revenue.create({ data: { ...dto, amount: new Prisma.Decimal(dto.amount), currency: (dto.currency || 'VND').toUpperCase(), occurredAt: new Date(dto.occurredAt), createdById: req.authUser.id }, include: { shipment: { select: { id: true, shipmentNo: true } }, createdBy: { select: { fullName: true } } } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'REVENUE_CREATED', entity: 'Revenue', entityId: item.id, changes: { shipmentId: item.shipmentId, category: item.category, amount: item.amount.toString(), currency: item.currency }, ipAddress: req.ip } });
      return item;
    });
  }

  @Patch('revenues/:id') @RequirePermission('finance.manage')
  async updateRevenue(@Param('id') id: string, @Body() dto: UpdateRevenueDto, @Req() req: AuthRequest) {
    if (!Object.keys(dto).length) throw new BadRequestException('Không có thay đổi');
    const before = await this.db.revenue.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy doanh thu');
    if (before.invoiceId) throw new ConflictException('Doanh thu hóa đơn phải được điều chỉnh từ nghiệp vụ hóa đơn.');
    if (dto.category === RevenueCategory.INVOICE) throw new BadRequestException('Không thể tự tạo doanh thu hóa đơn.');
    if (dto.shipmentId) await this.requireShipment(dto.shipmentId);
    return this.db.$transaction(async (tx) => {
    const item = await tx.revenue.update({ where: { id }, data: {
      shipmentId: dto.shipmentId, category: dto.category, description: dto.description?.trim(),
      amount: dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount), currency: dto.currency?.toUpperCase(),
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined, notes: dto.notes,
    }, include: { shipment: { select: { id: true, shipmentNo: true } }, createdBy: { select: { fullName: true } } } });
    await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'REVENUE_UPDATED', entity: 'Revenue', entityId: id, changes: { before: { shipmentId: before.shipmentId, category: before.category, amount: before.amount.toString(), currency: before.currency }, after: { shipmentId: item.shipmentId, category: item.category, amount: item.amount.toString(), currency: item.currency } }, ipAddress: req.ip } });
    return item;
    });
  }

  @Get('finance/summary') @RequirePermission('finance.view')
  async summary() {
    const [revenues, costs, invoices, revenueByShipment, costByShipment] = await Promise.all([
      this.db.revenue.groupBy({ by: ['currency'], _sum: { amount: true } }),
      this.db.cost.groupBy({ by: ['currency'], _sum: { amount: true } }),
      this.db.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.revenue.groupBy({ by: ['shipmentId', 'currency'], _sum: { amount: true } }),
      this.db.cost.groupBy({ by: ['shipmentId', 'currency'], _sum: { amount: true } }),
    ]);
    const totals = new Map<string, { revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const currency of new Set([...revenues.map((x) => x.currency), ...costs.map((x) => x.currency)])) totals.set(currency, { revenue: revenues.find((x) => x.currency === currency)?._sum.amount || new Prisma.Decimal(0), cost: costs.find((x) => x.currency === currency)?._sum.amount || new Prisma.Decimal(0) });
    const byShipment = new Map<string, { shipmentId: string; currency: string; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const entry of [...revenueByShipment.map((x) => ({ ...x, type: 'revenue' as const })), ...costByShipment.map((x) => ({ ...x, type: 'cost' as const }))]) {
      const key = `${entry.shipmentId}:${entry.currency}`;
      const row = byShipment.get(key) || { shipmentId: entry.shipmentId, currency: entry.currency, revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) };
      row[entry.type] = entry._sum.amount || new Prisma.Decimal(0);
      byShipment.set(key, row);
    }
    const shipmentIds = [...new Set([...byShipment.values()].map((x) => x.shipmentId))];
    const shipments = shipmentIds.length ? await this.db.shipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, shipmentNo: true, customer: { select: { id: true, companyName: true } } } }) : [];
    const shipmentMap = new Map(shipments.map((x) => [x.id, x]));
    return {
      currencies: [...totals.entries()].map(([currency, value]) => ({ currency, revenue: value.revenue.toNumber(), cost: value.cost.toNumber(), profit: value.revenue.minus(value.cost).toNumber() })),
      shipmentProfits: [...byShipment.values()].flatMap((row) => { const shipment = shipmentMap.get(row.shipmentId); return shipment ? [{ shipmentId: shipment.id, shipmentNo: shipment.shipmentNo, customer: shipment.customer, currency: row.currency, revenue: row.revenue.toNumber(), cost: row.cost.toNumber(), profit: row.revenue.minus(row.cost).toNumber() }] : []; }).sort((a, b) => b.profit - a.profit),
      invoices: Object.fromEntries(['DRAFT', 'ISSUED', 'PAID'].map((status) => [status, invoices.find((x) => x.status === status)?._count._all || 0])),
    };
  }

  @Get('invoices') @RequirePermission('finance.view')
  invoices(@Query('shipmentId') shipmentId?: string) {
    return this.db.invoice.findMany({ where: shipmentId ? { shipmentId } : undefined, include: invoiceInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Get('invoices/:id') @RequirePermission('finance.view')
  async invoice(@Param('id') id: string) {
    const invoice = await this.db.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    return invoice;
  }

  @Post('invoices') @RequirePermission('finance.manage')
  async createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: AuthRequest) {
    await this.requireShipment(dto.shipmentId);
    const currency = (dto.currency || 'VND').toUpperCase();
    const lines = dto.lines.map((line) => {
      const quantity = new Prisma.Decimal(line.quantity);
      const unitPrice = new Prisma.Decimal(line.unitPrice);
      return { description: line.description.trim(), quantity, unitPrice, amount: quantity.mul(unitPrice).toDecimalPlaces(2) };
    });
    const totalAmount = lines.reduce((total, line) => total.plus(line.amount), new Prisma.Decimal(0));
    if (totalAmount.lte(0) || totalAmount.gte(new Prisma.Decimal('1000000000000'))) throw new BadRequestException('Tổng hóa đơn vượt giới hạn hợp lệ');
    return this.db.$transaction(async (tx) => {
      const item = await tx.invoice.create({ data: { invoiceNo: dto.invoiceNo.trim().toUpperCase(), shipmentId: dto.shipmentId, currency, totalAmount, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, notes: dto.notes, createdById: req.authUser.id, lines: { create: lines } }, include: invoiceInclude });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'INVOICE_CREATED', entity: 'Invoice', entityId: item.id, changes: { invoiceNo: item.invoiceNo, shipmentId: item.shipmentId, totalAmount: item.totalAmount.toString(), currency }, ipAddress: req.ip } });
      return item;
    });
  }

  @Post('invoices/:id/issue') @RequirePermission('finance.manage')
  async issueInvoice(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { lines: true } });
      if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
      if (invoice.status !== InvoiceStatus.DRAFT || invoice.lines.length === 0) throw new ConflictException('Chỉ phát hành hóa đơn nháp có dòng hàng');
      const issuedAt = new Date();
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.ISSUED, issuedAt } });
      const revenue = await tx.revenue.create({ data: { invoiceId: id, shipmentId: invoice.shipmentId, category: RevenueCategory.INVOICE, description: `Hóa đơn ${invoice.invoiceNo}`, amount: invoice.totalAmount, currency: invoice.currency, occurredAt: issuedAt, createdById: req.authUser.id } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'INVOICE_ISSUED', entity: 'Invoice', entityId: id, changes: { status: 'ISSUED', revenueId: revenue.id, amount: invoice.totalAmount.toString(), currency: invoice.currency }, ipAddress: req.ip } });
      return tx.invoice.findUniqueOrThrow({ where: { id: updated.id }, include: invoiceInclude });
    });
  }

  @Post('invoices/:id/payments') @RequirePermission('finance.manage')
  async addPayment(@Param('id') id: string, @Body() dto: CreatePaymentDto, @Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { payments: true } });
      if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
      if (invoice.status !== InvoiceStatus.ISSUED) throw new ConflictException('Chỉ ghi nhận thanh toán cho hóa đơn đã phát hành và chưa tất toán');
      const paid = invoice.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
      const amount = new Prisma.Decimal(dto.amount);
      if (paid.plus(amount).gt(invoice.totalAmount)) throw new BadRequestException('Số tiền thanh toán vượt số dư hóa đơn');
      await tx.payment.create({ data: { invoiceId: id, amount, currency: invoice.currency, paidAt: new Date(dto.paidAt), reference: dto.reference, notes: dto.notes, recordedById: req.authUser.id } });
      const nextStatus = paid.plus(amount).eq(invoice.totalAmount) ? InvoiceStatus.PAID : InvoiceStatus.ISSUED;
      await tx.invoice.update({ where: { id }, data: { status: nextStatus } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'INVOICE_PAYMENT_RECORDED', entity: 'Invoice', entityId: id, changes: { amount: amount.toString(), currency: invoice.currency, status: nextStatus }, ipAddress: req.ip } });
      return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
    });
  }

  private async requireShipment(id: string) {
    const shipment = await this.db.shipment.findUnique({ where: { id }, select: { id: true } });
    if (!shipment) throw new NotFoundException('Không tìm thấy Shipment');
    return shipment;
  }

}
