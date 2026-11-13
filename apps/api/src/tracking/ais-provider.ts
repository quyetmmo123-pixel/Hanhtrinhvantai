/** Provider contract keeps the tracking domain independent of a vendor's wire format. */
export type AisVesselRef = { id: string; mmsi: string };
export type NormalizedAisPosition = {
  mmsi: string;
  latitude: number;
  longitude: number;
  speedKnots?: number;
  course?: number;
  heading?: number;
  navigationStatus?: string;
  destination?: string;
  eta?: Date;
  lastUpdate: Date;
};

export interface AisProvider {
  readonly name: string;
  configured(): boolean;
  connectionStatus(): 'NOT_CONFIGURED' | 'NO_VESSELS' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
  start(vessels: AisVesselRef[], onPosition: (position: NormalizedAisPosition) => void): void;
  updateVessels(vessels: AisVesselRef[]): void;
  noVessels(): void;
  stop(): void;
}

export const AIS_PROVIDER = Symbol('AIS_PROVIDER');

export function navigationStatus(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return ({ 0: 'UNDER WAY USING ENGINE', 1: 'AT ANCHOR', 2: 'NOT UNDER COMMAND', 3: 'RESTRICTED MANOEUVRABILITY', 4: 'CONSTRAINED BY DRAUGHT', 5: 'MOORED', 6: 'AGROUND', 7: 'ENGAGED IN FISHING', 8: 'UNDER WAY SAILING', 15: 'UNDEFINED' } as Record<number, string>)[value] ?? `AIS STATUS ${value}`;
}
