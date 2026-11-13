import { Injectable, Logger } from '@nestjs/common';
import WebSocket, { RawData } from 'ws';
import { AisProvider, AisVesselRef, NormalizedAisPosition, navigationStatus } from './ais-provider';

type AisStreamEnvelope = {
  MessageType?: string;
  MetaData?: { MMSI?: number | string; mmsi?: number | string; Latitude?: number; Longitude?: number };
  Message?: Record<string, Record<string, unknown>>;
};

@Injectable()
export class AisStreamProvider implements AisProvider {
  readonly name = 'AISSTREAM';
  private readonly logger = new Logger(AisStreamProvider.name);
  private socket?: WebSocket;
  private onPosition?: (position: NormalizedAisPosition) => void;
  private vessels: AisVesselRef[] = [];
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private stopped = true;
  private state: 'NOT_CONFIGURED' | 'NO_VESSELS' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR' = 'NOT_CONFIGURED';
  private readonly staticData = new Map<string, { destination?: string; eta?: Date }>();

  configured(): boolean {
    return process.env.AIS_PROVIDER?.trim().toLowerCase() === 'aisstream'
      && Boolean(process.env.AIS_API_KEY?.trim())
      && this.boundingBoxes() !== undefined;
  }

  connectionStatus() { return this.configured() ? this.state : 'NOT_CONFIGURED'; }

  noVessels(): void {
    this.stop();
    this.state = this.configured() ? 'NO_VESSELS' : 'NOT_CONFIGURED';
  }

  start(vessels: AisVesselRef[], onPosition: (position: NormalizedAisPosition) => void): void {
    this.onPosition = onPosition;
    this.vessels = vessels;
    this.stopped = false;
    this.state = 'CONNECTING';
    this.connect();
  }

  updateVessels(vessels: AisVesselRef[]): void {
    this.vessels = vessels;
    if (!this.configured()) return;
    if (!vessels.length) { this.stopSocket(); return; }
    if (this.socket?.readyState === WebSocket.OPEN) this.sendSubscription();
    else if (!this.socket && !this.stopped) this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.state = this.configured() ? 'ERROR' : 'NOT_CONFIGURED';
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.stopSocket();
    this.onPosition = undefined;
  }

  private connect(): void {
    if (this.stopped || !this.configured() || this.socket || !this.vessels.length) return;
    try {
      this.socket = new WebSocket('wss://stream.aisstream.io/v0/stream', { perMessageDeflate: true });
      const socket = this.socket;
      socket.on('open', () => {
        if (socket !== this.socket) return;
        this.reconnectAttempt = 0;
        this.sendSubscription();
      });
      socket.on('message', (data: RawData) => {
        if (socket !== this.socket) return;
        if (Buffer.isBuffer(data)) this.consume(data.toString('utf8'));
        else if (Array.isArray(data)) this.consume(Buffer.concat(data).toString('utf8'));
        else this.consume(new TextDecoder().decode(data));
      });
      socket.on('error', () => this.logger.warn('AIS provider connection error; retry scheduled.'));
      socket.on('close', () => {
        if (socket !== this.socket) return;
        this.socket = undefined;
        if (!this.stopped) this.scheduleReconnect();
      });
    } catch {
      this.socket = undefined;
      this.scheduleReconnect();
    }
  }

  private sendSubscription(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const key = process.env.AIS_API_KEY?.trim();
    const boxes = this.boundingBoxes();
    if (!key || !boxes) return;
    const mmsis = [...new Set(this.vessels.map((vessel) => vessel.mmsi.trim()).filter((mmsi) => /^\d{9}$/.test(mmsi)))].slice(0, 200);
    if (!mmsis.length) { this.stopSocket(); return; }
    this.socket.send(JSON.stringify({ APIKey: key, BoundingBoxes: boxes, FiltersShipMMSI: mmsis, FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
  }

  private consume(raw: string): void {
    let envelope: AisStreamEnvelope;
    try { envelope = JSON.parse(raw) as AisStreamEnvelope; } catch { return; }
    if (envelope.MessageType === 'SubscriptionConfirmation') { this.state = 'CONNECTED'; return; }
    if (envelope.MessageType === 'ShipStaticData') {
      const message = envelope.Message?.ShipStaticData;
      const mmsi = String(message?.UserID ?? envelope.MetaData?.MMSI ?? envelope.MetaData?.mmsi ?? '');
      if (!message || !/^\d{9}$/.test(mmsi)) return;
      const destination = typeof message.Destination === 'string' ? message.Destination.trim() : undefined;
      const eta = this.normalizeEta(message.Eta ?? message.ETA);
      const current = this.staticData.get(mmsi) ?? {};
      this.staticData.set(mmsi, { destination: destination || current.destination, eta: eta ?? current.eta });
      return;
    }
    if (envelope.MessageType !== 'PositionReport') return;
    const report = envelope.Message?.PositionReport;
    const metadata = envelope.MetaData;
    if (!report || !metadata) return;
    const mmsi = String(report.UserID ?? metadata.MMSI ?? metadata.mmsi ?? '');
    const latitude = Number(report.Latitude ?? metadata.Latitude);
    const longitude = Number(report.Longitude ?? metadata.Longitude);
    if (!/^\d{9}$/.test(mmsi) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || report.Valid === false) return;
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    this.onPosition?.({
      mmsi, latitude, longitude,
      speedKnots: number(report.Sog), course: number(report.Cog), heading: number(report.TrueHeading),
      navigationStatus: navigationStatus(report.NavigationalStatus),
      ...this.staticData.get(mmsi),
      lastUpdate: new Date(),
    });
  }

  private normalizeEta(value: unknown): Date | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    if (!value || typeof value !== 'object') return undefined;
    const parts = value as Record<string, unknown>;
    const month = Number(parts.Month ?? parts.month), day = Number(parts.Day ?? parts.day);
    const hour = Number(parts.Hour ?? parts.hour ?? 0), minute = Number(parts.Minute ?? parts.minute ?? 0);
    if (![month, day, hour, minute].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
    const suppliedYear = Number(parts.Year ?? parts.year);
    const now = new Date();
    const year = Number.isInteger(suppliedYear) && suppliedYear > 0 ? suppliedYear : now.getUTCFullYear();
    let eta = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (eta.getUTCMonth() !== month - 1 || eta.getUTCDate() !== day) return undefined;
    if ((!Number.isInteger(suppliedYear) || suppliedYear <= 0) && eta.getTime() < now.getTime() - 30 * 24 * 60 * 60 * 1000) eta = new Date(Date.UTC(year + 1, month - 1, day, hour, minute));
    return eta;
  }

  private boundingBoxes(): number[][][][] | undefined {
    const value = process.env.AIS_BBOXES?.trim();
    if (!value) return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed) || !parsed.length || parsed.some((box) => !Array.isArray(box) || box.length !== 2 || box.some((corner) => !Array.isArray(corner) || corner.length !== 2 || corner.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate))))) return undefined;
      return parsed as number[][][][];
    } catch { return undefined; }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(this.reconnectAttempt++, 5)));
    this.state = 'RECONNECTING';
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(); }, delay);
  }

  private stopSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
}
