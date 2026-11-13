import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CostCategory, RevenueCategory, ShipmentMilestone, ShipmentStatus, TransportJobStatus } from '@prisma/client';
import { RequirePermission } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year';

@Controller('reports')
@RequirePermission('reports.view')
export class ReportsController {
  constructor(private readonly db: PrismaService) {}

  @Get('overview')
  async overview(@Query('period') periodInput = 'month', @Query('from') fromInput?: string, @Query('to') toInput?: string) {
    const allowed: Period[] = ['day', 'week', 'month', 'quarter', 'year'];
    if (!allowed.includes(periodInput as Period)) throw new BadRequestException('Kỳ báo cáo không hợp lệ');
    const period = periodInput as Period;
    const now = new Date();
    let from: Date;
    let to = now;
    if (fromInput || toInput) {
      from = fromInput ? new Date(fromInput) : new Date(now.getFullYear(), now.getMonth(), 1);
      to = toInput ? new Date(toInput) : now;
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > 366 * 86_400_000) throw new BadRequestException('Khoảng thời gian không hợp lệ (tối đa 366 ngày)');
    } else {
      from = new Date(now);
      if (period === 'day') from.setHours(0, 0, 0, 0);
      if (period === 'week') { from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); }
      if (period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
      if (period === 'quarter') from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
    }
    const range = { gte: from, lte: to };
    const [shipmentsCreated, completedEvents, delayedShipments, jobs, revenues, costs, customerRevenue, customerCost] = await Promise.all([
      this.db.shipment.count({ where: { createdAt: range } }),
      this.db.shipmentEvent.findMany({ where: { milestone: ShipmentMilestone.COMPLETED, actualAt: range }, select: { shipmentId: true, actualAt: true, plannedAt: true, shipment: { select: { createdAt: true } } }, take: 10_000 }),
      this.db.shipment.count({ where: { status: ShipmentStatus.DELAYED } }),
      this.db.transportJob.findMany({ where: { OR: [{ actualDeliveryAt: range }, { status: { in: [TransportJobStatus.ASSIGNED, TransportJobStatus.PICKING_UP, TransportJobStatus.IN_TRANSIT, TransportJobStatus.DELIVERING] }, deliveryAt: { lt: to } }] }, select: { id: true, status: true, deliveryAt: true, actualDeliveryAt: true, loadedKm: true, emptyKm: true, truckId: true, driverId: true, shipment: { select: { shipmentNo: true, customer: { select: { id: true, companyName: true } } } }, truck: { select: { plateNo: true } }, driver: { select: { fullName: true } } }, take: 10_000 }),
      this.db.revenue.findMany({ where: { occurredAt: range }, select: { shipmentId: true, category: true, amount: true, currency: true, occurredAt: true, shipment: { select: { shipmentNo: true, customerId: true, customer: { select: { id: true, companyName: true } } } } }, take: 10_000 }),
      this.db.cost.findMany({ where: { occurredAt: range }, select: { shipmentId: true, category: true, amount: true, currency: true, occurredAt: true, shipment: { select: { shipmentNo: true, customerId: true, customer: { select: { id: true, companyName: true } } } } }, take: 10_000 }),
      this.db.revenue.groupBy({ by: ['shipmentId', 'currency'], where: { occurredAt: range }, _sum: { amount: true } }),
      this.db.cost.groupBy({ by: ['shipmentId', 'currency'], where: { occurredAt: range }, _sum: { amount: true } }),
    ]);

    const completedShipmentIds = new Set(completedEvents.map((event) => event.shipmentId));
    const measuredOnTime = completedEvents.filter((event) => event.plannedAt);
    const onTime = measuredOnTime.filter((event) => event.actualAt! <= event.plannedAt!).length;
    const completedJobs = jobs.filter((job) => job.actualDeliveryAt && job.actualDeliveryAt >= from && job.actualDeliveryAt <= to);
    const lateJobs = completedJobs.filter((job) => job.actualDeliveryAt! > job.deliveryAt).length;
    const loadedKm = completedJobs.reduce((total, job) => total + Number(job.loadedKm || 0), 0);
    const emptyKm = completedJobs.reduce((total, job) => total + Number(job.emptyKm || 0), 0);
    const fleetMetrics = (field: 'truckId' | 'driverId', label: (job: typeof jobs[number]) => string) => {
      const groups = new Map<string, { id: string; name: string; completedTrips: number; onTimeTrips: number; delayedTrips: number; loadedKm: number; emptyKm: number }>();
      for (const job of completedJobs) {
        const id = job[field];
        const group = groups.get(id) || { id, name: label(job), completedTrips: 0, onTimeTrips: 0, delayedTrips: 0, loadedKm: 0, emptyKm: 0 };
        group.completedTrips += 1;
        if (job.actualDeliveryAt! <= job.deliveryAt) group.onTimeTrips += 1; else group.delayedTrips += 1;
        group.loadedKm += Number(job.loadedKm || 0); group.emptyKm += Number(job.emptyKm || 0);
        groups.set(id, group);
      }
      return [...groups.values()].map((group) => ({ ...group, onTimeRate: group.completedTrips ? group.onTimeTrips / group.completedTrips : null })).sort((a, b) => b.completedTrips - a.completedTrips).slice(0, 30);
    };
    const truckPerformance = fleetMetrics('truckId', (job) => job.truck.plateNo);
    const driverPerformance = fleetMetrics('driverId', (job) => job.driver.fullName);
    const transportCostCategories = new Set<CostCategory>([CostCategory.ROAD_FREIGHT, CostCategory.FUEL, CostCategory.TOLL, CostCategory.DRIVER]);
    const transportCategoryCosts = costs.filter((row) => transportCostCategories.has(row.category));
    const roadRevenues = revenues.filter((row) => row.category === RevenueCategory.ROAD_FREIGHT);
    const kmByCurrency = [...new Set([...transportCategoryCosts.map((x) => x.currency), ...roadRevenues.map((x) => x.currency)])].map((currency) => {
      const roadRevenue = roadRevenues.filter((x) => x.currency === currency).reduce((sum, x) => sum + Number(x.amount), 0);
      const roadCost = transportCategoryCosts.filter((x) => x.currency === currency).reduce((sum, x) => sum + Number(x.amount), 0);
      const km = loadedKm + emptyKm;
      return { currency, loadedKm, emptyKm, revenuePerKm: km ? roadRevenue / km : 0, costPerKm: km ? roadCost / km : 0 };
    });

    const profitMap = new Map<string, { shipmentId: string; shipmentNo: string; customerId: string; customer: { id: string; companyName: string }; currency: string; revenue: number; cost: number }>();
    const profitShipmentIds = [...new Set([...customerRevenue, ...customerCost].map((x) => x.shipmentId))];
    const profitShipments = await this.db.shipment.findMany({ where: { id: { in: profitShipmentIds } }, select: { id: true, shipmentNo: true, customer: { select: { id: true, companyName: true } } } });
    const shipmentById = new Map(profitShipments.map((shipment) => [shipment.id, shipment]));
    for (const row of [...customerRevenue.map((x) => ({ ...x, direction: 'revenue' as const })), ...customerCost.map((x) => ({ ...x, direction: 'cost' as const }))]) {
      const shipment = shipmentById.get(row.shipmentId);
      if (!shipment) continue;
      const key = `${shipment.customer.id}:${row.currency}`;
      const result = profitMap.get(key) || { shipmentId: row.shipmentId, shipmentNo: shipment.shipmentNo, customerId: shipment.customer.id, customer: shipment.customer, currency: row.currency, revenue: 0, cost: 0 };
      result[row.direction] += Number(row._sum.amount || 0);
      profitMap.set(key, result);
    }
    const customerProfits = [...profitMap.values()].reduce((byCustomer, row) => {
      const key = `${row.customer.id}:${row.currency}`;
      const current = byCustomer.get(key) || { customer: row.customer, currency: row.currency, revenue: 0, cost: 0 };
      current.revenue += row.revenue; current.cost += row.cost; byCustomer.set(key, current); return byCustomer;
    }, new Map<string, { customer: { id: string; companyName: string }; currency: string; revenue: number; cost: number }>()).values();

    const buckets = new Map<string, { label: string; currency: string; revenue: number; cost: number }>();
    const bucketLabel = (date: Date) => {
      const label = period === 'day' ? `${date.toISOString().slice(0, 13)}:00Z` : period === 'year' || period === 'quarter' ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 10);
      return label;
    };
    for (const row of revenues) { const label = bucketLabel(row.occurredAt); const key = `${row.currency}|${label}`; const bucket = buckets.get(key) || { label, currency: row.currency, revenue: 0, cost: 0 }; bucket.revenue += Number(row.amount); buckets.set(key, bucket); }
    for (const row of costs) { const label = bucketLabel(row.occurredAt); const key = `${row.currency}|${label}`; const bucket = buckets.get(key) || { label, currency: row.currency, revenue: 0, cost: 0 }; bucket.cost += Number(row.amount); buckets.set(key, bucket); }

    return {
      period, from, to,
      kpis: { shipmentsCreated, shipmentsCompleted: completedShipmentIds.size, delayedShipments, onTimeDeliveryRate: measuredOnTime.length ? onTime / measuredOnTime.length : null, averageShipmentDays: completedEvents.length ? completedEvents.reduce((sum, event) => sum + (event.actualAt!.getTime() - event.shipment.createdAt.getTime()) / 86_400_000, 0) / completedEvents.length : null, transportJobsCompleted: completedJobs.length, delayedTransportJobs: lateJobs, loadedKm, emptyKm, totalKm: loadedKm + emptyKm },
      financials: [...new Set([...revenues.map((x) => x.currency), ...costs.map((x) => x.currency)])].map((currency) => { const revenue = revenues.filter((x) => x.currency === currency).reduce((sum, x) => sum + Number(x.amount), 0); const cost = costs.filter((x) => x.currency === currency).reduce((sum, x) => sum + Number(x.amount), 0); return { currency, revenue, cost, profit: revenue - cost }; }),
      truckingPerKm: kmByCurrency,
      truckPerformance,
      driverPerformance,
      customerProfits: [...customerProfits].map((row) => ({ ...row, profit: row.revenue - row.cost })).sort((a, b) => a.currency.localeCompare(b.currency) || b.profit - a.profit).slice(0, 30),
      financialTrend: [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label)),
      truncationLimit: 10_000,
    };
  }
}
