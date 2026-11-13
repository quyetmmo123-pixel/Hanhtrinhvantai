import { Port } from './operations';
export type VesselStatus='AT_PORT'|'ANCHORED'|'UNDERWAY'|'IN_TRANSIT'|'ARRIVED';
export type VoyageStatus='PLANNED'|'CONFIRMED'|'DEPARTED'|'ARRIVED'|'CANCELLED';
export type VoyageContainerStatus='BOOKED'|'LOADED'|'DISCHARGED'|'CANCELLED';
export type Vessel={id:string;name:string;imo:string;mmsi?:string|null;callSign?:string|null;flag?:string|null;shippingLine:string;vesselType:string;status:VesselStatus;voyages?:Voyage[];_count?:{voyages:number};positions?:TrackingPosition[]};
export type VoyageContainerEvent={id:string;status:VoyageContainerStatus;occurredAt:string;note?:string|null;updatedBy?:{fullName:string}};
export type VoyageContainer={id:string;voyageId:string;containerId:string;container:{id:string;containerNo:string;status:string};shipmentContainer:{shipmentId:string;shipment:{shipmentNo:string;customer:{companyName:string}};booking?:{bookingNo:string}|null};status:VoyageContainerStatus;bookedAt:string;loadedAt?:string|null;dischargedAt?:string|null;events?:VoyageContainerEvent[];notes?:string|null};
export type VoyageEvent={id:string;status:VoyageStatus;occurredAt:string;note?:string|null;updatedBy?:{fullName:string}};
export type Voyage={id:string;voyageNo:string;vesselId:string;vessel:Vessel;polId:string;pol:Port;podId:string;pod:Port;etd:string;atd?:string|null;eta:string;ata?:string|null;status:VoyageStatus;notes?:string|null;containers?:VoyageContainer[];events?:VoyageEvent[];_count?:{containers:number}};
export const vesselStatusLabel:Record<VesselStatus,string>={AT_PORT:'Tại cảng',ANCHORED:'Neo đậu',UNDERWAY:'Đang chạy',IN_TRANSIT:'Đang hành trình',ARRIVED:'Đã đến'};
export const voyageStatusLabel:Record<VoyageStatus,string>={PLANNED:'Lên kế hoạch',CONFIRMED:'Đã xác nhận',DEPARTED:'Đã rời cảng',ARRIVED:'Đã đến',CANCELLED:'Đã hủy'};
export const voyageContainerStatusLabel:Record<VoyageContainerStatus,string>={BOOKED:'Đã xếp manifest',LOADED:'Đã lên tàu',DISCHARGED:'Đã dỡ tàu',CANCELLED:'Đã hủy'};
export type TrackingPosition = {
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  course: number | null;
  heading: number | null;
  navigationStatus: string | null;
  destination: string | null;
  eta: string | null;
  lastUpdate: string;
  provider: string;
};

export type LiveVessel = {
  vessel: { id: string; name: string; imo: string; mmsi: string | null; shippingLine: string };
  voyage: { id: string; voyageNo: string; status: string; eta: string; atd: string | null; pol: { code: string; name: string }; pod: { code: string; name: string } };
  loadedContainerCount: number;
  containers: { id: string; containerNo: string; type: string; shipmentNo: string }[];
  position: TrackingPosition | null;
  scheduledDestination: string;
  scheduledEta: string;
};

export type LiveVesselResponse = {
  provider: string | null;
  connection: 'NOT_CONFIGURED' | 'NO_VESSELS' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
  message?: string;
  vessels: LiveVessel[];
};
