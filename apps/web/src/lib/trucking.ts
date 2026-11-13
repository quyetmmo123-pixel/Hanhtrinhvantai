import { Container, Shipment } from './operations';

export type TruckStatus = 'AVAILABLE'|'ASSIGNED'|'PICKING_UP'|'IN_TRANSIT'|'DELIVERING'|'COMPLETED'|'MAINTENANCE';
export type Truck = { id:string; plateNo:string; type:'TRUCK'|'TRACTOR'; capacityKg:string; status:TruckStatus; gpsDeviceId?:string|null; inspectionExpires?:string|null; insuranceExpires?:string|null; notes?:string|null; trailers?:Trailer[]; maintenance?:Maintenance[]; jobs?:TransportJob[]; _count?:{jobs:number;trailers:number} };
export type Trailer = { id:string; plateNo:string; type:string; capacityKg:string; truckId?:string|null; truck?:{id:string;plateNo:string}|null; notes?:string|null };
export type Driver = { id:string; code:string; fullName:string; phone?:string|null; licenseNo:string; licenseClass:string; licenseExpires:string; assignedTruckId?:string|null; assignedTruck?:Truck|null; userId?:string|null; user?:{id?:string;email:string}|null; status:'AVAILABLE'|'ASSIGNED'|'ON_TRIP'|'OFF_DUTY'; notes?:string|null; jobs?:TransportJob[] };
export type DriverUser = { id:string; email:string; fullName:string; driverProfile?:{id:string}|null };
export type TransportJobStatus = 'ASSIGNED'|'PICKING_UP'|'IN_TRANSIT'|'DELIVERING'|'COMPLETED'|'CANCELLED';
export type TransportJobEvent = { id:string; status:TransportJobStatus; occurredAt:string; note?:string|null; updatedBy?:{fullName:string} };
export type TransportJob = { id:string; jobNo:string; shipmentId:string; shipment:Shipment; containerId?:string|null; container?:Container|null; truckId:string; truck:Truck; driverId:string; driver:Driver; pickupPlace:string; deliveryPlace:string; pickupAt:string; deliveryAt:string; actualPickupAt?:string|null; actualDeliveryAt?:string|null; status:TransportJobStatus; loadedKm?:string|null; emptyKm?:string|null; notes?:string|null; events?:TransportJobEvent[] };
export type Maintenance = { id:string; startsAt:string; endsAt:string; description:string; completedAt?:string|null };
export const truckStatusLabel:Record<TruckStatus,string> = { AVAILABLE:'Sẵn sàng', ASSIGNED:'Đã điều xe', PICKING_UP:'Đang lấy hàng', IN_TRANSIT:'Đang chạy', DELIVERING:'Đang giao', COMPLETED:'Hoàn thành', MAINTENANCE:'Bảo dưỡng' };
export const jobStatusLabel:Record<TransportJobStatus,string> = { ASSIGNED:'Đã điều xe', PICKING_UP:'Đang lấy hàng', IN_TRANSIT:'Đang vận chuyển', DELIVERING:'Đang giao', COMPLETED:'Hoàn thành', CANCELLED:'Đã hủy' };
export const dateLocal = (value?:string|null) => value ? new Date(value).toISOString().slice(0,10) : '';
export const dateTimeLocal = (value?:string|null) => value ? new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
