import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service';
import { AuditService } from './common/audit.service';
import { OriginGuard } from './common/origin.guard';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { UsersController } from './users/users.controller';
import { CustomersController } from './operations/customers.controller';
import { PortsController } from './operations/ports.controller';
import { ShipmentsController } from './operations/shipments.controller';
import { BookingsController, BillsOfLadingController } from './operations/bookings.controller';
import { ContainersController } from './operations/containers.controller';
import { SearchController } from './operations/search.controller';
import { AssigneesController } from './operations/assignees.controller';
import { DriversController, TrailersController, TrucksController } from './trucking/fleet.controller';
import { MyJobsController, TransportJobsController, TransportJobsService } from './trucking/transport-jobs.controller';
import { VesselsController, VoyagesController } from './vessels/vessels.controller';
import { TrackingController } from './tracking/tracking.controller';
import { TrackingService } from './tracking/tracking.service';
import { AisStreamProvider } from './tracking/aisstream.provider';
import { AIS_PROVIDER } from './tracking/ais-provider';
import { DocumentsController } from './documents/documents.controller';
import { FinanceController } from './finance/finance.controller';
import { AlertsController } from './alerts/alerts.controller';
import { AlertsService } from './alerts/alerts.service';
import { ReportsController } from './reports/reports.controller';
import { RecordsController } from './records/records.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  controllers: [AuthController, DashboardController, UsersController, RecordsController, CustomersController, PortsController, AssigneesController, ShipmentsController, BookingsController, BillsOfLadingController, ContainersController, SearchController, TrucksController, TrailersController, DriversController, TransportJobsController, MyJobsController, VesselsController, VoyagesController, TrackingController, DocumentsController, FinanceController, AlertsController, ReportsController],
  providers: [
    PrismaService, AuditService, AuthService, TransportJobsService, AlertsService, AisStreamProvider,
    { provide: AIS_PROVIDER, useExisting: AisStreamProvider }, TrackingService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
