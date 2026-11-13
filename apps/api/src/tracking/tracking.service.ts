import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AisProvider, AisVesselRef, AIS_PROVIDER, NormalizedAisPosition } from './ais-provider';

@Injectable()
export class TrackingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackingService.name);
  private timer?: ReturnType<typeof setInterval>;
  private started = false;
  private currentMmsis = '';

  constructor(private readonly db: PrismaService, @Inject(AIS_PROVIDER) private readonly provider: AisProvider) {}

  onModuleInit(): void {
    void this.syncProvider();
    this.timer = setInterval(() => void this.syncProvider(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.provider.stop();
  }

  getStatus() {
    const configured = this.provider.configured();
    return {
      provider: configured ? this.provider.name : null,
      connection: this.provider.connectionStatus(),
      message: !configured ? 'AIS DATA NOT CONNECTED' : this.provider.connectionStatus() === 'NO_VESSELS' ? 'Chưa có tàu có MMSI trên Voyage đã rời cảng và đang chở container để theo dõi.' : undefined,
      lastConfigurationCheck: new Date().toISOString(),
    };
  }

  async liveVessels() {
    const voyages = await this.db.voyage.findMany({
      where: { status: 'DEPARTED', containers: { some: { status: 'LOADED' } } },
      include: {
        vessel: { include: { positions: { orderBy: { lastUpdate: 'desc' }, take: 1 } } },
        pol: true,
        pod: true,
        containers: {
          where: { status: 'LOADED' },
          include: { container: true, shipmentContainer: { include: { shipment: { select: { id: true, shipmentNo: true } } } } },
          orderBy: { loadedAt: 'asc' },
        },
      },
      orderBy: { atd: 'desc' },
      take: 200,
    });
    return {
      ...this.getStatus(),
      vessels: voyages.map((voyage) => {
        const latestPosition = voyage.vessel.positions[0];
        const position = latestPosition && latestPosition.lastUpdate >= (voyage.atd ?? voyage.etd) ? latestPosition : null;
        return {
          voyage: { id: voyage.id, voyageNo: voyage.voyageNo, status: voyage.status, eta: voyage.eta, atd: voyage.atd, pol: voyage.pol, pod: voyage.pod },
          vessel: { id: voyage.vessel.id, name: voyage.vessel.name, imo: voyage.vessel.imo, mmsi: voyage.vessel.mmsi, shippingLine: voyage.vessel.shippingLine },
          loadedContainerCount: voyage.containers.length,
          containers: voyage.containers.map((item) => ({ id: item.container.id, containerNo: item.container.containerNo, type: item.container.type, shipmentNo: item.shipmentContainer.shipment.shipmentNo })),
          position: position ? {
            latitude: Number(position.latitude), longitude: Number(position.longitude),
            speedKnots: position.speedKnots === null ? null : Number(position.speedKnots),
            course: position.course === null ? null : Number(position.course), heading: position.heading,
            navigationStatus: position.navigationStatus, destination: position.destination,
            eta: position.eta, lastUpdate: position.lastUpdate, provider: position.provider,
          } : null,
          // ETA and destination here are the recorded voyage schedule, separate from any AIS observation.
          scheduledDestination: voyage.pod.name,
          scheduledEta: voyage.eta,
        };
      }),
    };
  }

  private async syncProvider(): Promise<void> {
    if (!this.provider.configured()) { this.provider.stop(); this.started = false; this.currentMmsis = ''; return; }
    try {
      const vessels = await this.db.vessel.findMany({ where: { mmsi: { not: null }, voyages: { some: { status: 'DEPARTED', containers: { some: { status: 'LOADED' } } } } }, select: { id: true, mmsi: true }, take: 200, orderBy: { name: 'asc' } });
      const refs = vessels.filter((vessel): vessel is typeof vessel & { mmsi: string } => Boolean(vessel.mmsi)).map((vessel) => ({ id: vessel.id, mmsi: vessel.mmsi } satisfies AisVesselRef));
      const serialized = refs.map((vessel) => vessel.mmsi).join(',');
      if (!refs.length) { this.provider.noVessels(); this.started = false; this.currentMmsis = ''; return; }
      if (!this.started) {
        this.provider.start(refs, (position) => void this.persistPosition(position));
        this.started = true;
      } else if (serialized !== this.currentMmsis) this.provider.updateVessels(refs);
      this.currentMmsis = serialized;
    } catch (error) {
      this.logger.error(`Unable to refresh AIS vessel subscriptions: ${error instanceof Error ? error.message : 'database error'}`);
    }
  }

  private async persistPosition(position: NormalizedAisPosition): Promise<void> {
    try {
      const vessel = await this.db.vessel.findUnique({ where: { mmsi: position.mmsi }, select: { id: true } });
      if (!vessel) return;
      await this.db.vesselPosition.create({ data: {
        vesselId: vessel.id, latitude: position.latitude, longitude: position.longitude,
        speedKnots: position.speedKnots, course: position.course, heading: position.heading,
        navigationStatus: position.navigationStatus, destination: position.destination, eta: position.eta,
        provider: this.provider.name, lastUpdate: position.lastUpdate,
      } });
    } catch (error) {
      this.logger.error(`Unable to store received AIS position: ${error instanceof Error ? error.message : 'database error'}`);
    }
  }
}
