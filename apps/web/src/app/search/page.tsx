'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { ArrowRight, Search as SearchIcon } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { BillOfLading, Booking, Container, Customer, Shipment, containerStatusLabel, shipmentStatusLabel } from '@/lib/operations';
import { Driver, TransportJob, Truck, truckStatusLabel } from '@/lib/trucking';
import { Vessel, vesselStatusLabel, Voyage, voyageStatusLabel } from '@/lib/maritime';

type Results={containers:Container[];shipments:Shipment[];bookings:Booking[];billsOfLading:BillOfLading[];customers:Customer[];trucks:Truck[];drivers:Driver[];transportJobs:TransportJob[];vessels:Vessel[];voyages:Voyage[]};
type ResultItem={id:string;label:string;detail:string;href:string};
function SearchContent(){
  const params=useSearchParams(),router=useRouter(),q=params.get('q')||'';
  const [term,setTerm]=useState(q),[data,setData]=useState<Results|null>(null),[error,setError]=useState('');
  useEffect(()=>{setTerm(q);setError('');if(q.trim().length>=2)api<Results>(`/search?q=${encodeURIComponent(q)}`).then(setData).catch(e=>setError(e.message));else setData(null);},[q]);
  function submit(e:FormEvent){e.preventDefault();if(term.trim().length>=2)router.push(`/search?q=${encodeURIComponent(term.trim())}`);}
  const groups:{title:string;items:ResultItem[]}[]=[
    {title:'Container',items:data?.containers.map(x=>({id:x.id,label:x.containerNo,detail:`${containerStatusLabel[x.status]} · ${x.shipments?.[0]?.shipment.shipmentNo||'Chưa gán Shipment'}`,href:`/containers/${x.id}`}))||[]},
    {title:'Shipment',items:data?.shipments.map(x=>({id:x.id,label:x.shipmentNo,detail:`${x.customer.companyName} · ${shipmentStatusLabel[x.status]}`,href:`/shipments/${x.id}`}))||[]},
    {title:'Booking',items:data?.bookings.map(x=>({id:x.id,label:x.bookingNo,detail:`Shipment ${x.shipment.shipmentNo}`,href:`/bookings/${x.id}`}))||[]},
    {title:'Bill of Lading',items:data?.billsOfLading.map(x=>({id:x.id,label:x.blNo,detail:`Booking ${x.booking?.bookingNo} · Shipment ${x.booking?.shipment.shipmentNo}`,href:`/bookings/${x.bookingId}`}))||[]},
    {title:'Khách hàng',items:data?.customers.map(x=>({id:x.id,label:x.companyName,detail:x.code,href:`/customers/${x.id}`}))||[]},
    {title:'Xe',items:data?.trucks.map(x=>({id:x.id,label:x.plateNo,detail:`${x.type} · ${truckStatusLabel[x.status]}`,href:`/fleet/${x.id}`}))||[]},
    {title:'Tài xế',items:data?.drivers.map(x=>({id:x.id,label:x.fullName,detail:`${x.code} · GPLX ${x.licenseNo}`,href:`/drivers/${x.id}`}))||[]},
    {title:'Chuyến đường bộ',items:data?.transportJobs.map(x=>({id:x.id,label:x.jobNo,detail:`${x.truck.plateNo} · ${x.driver.fullName}`,href:`/trucking/${x.id}`}))||[]},
    {title:'Tàu',items:data?.vessels.map(x=>({id:x.id,label:x.name,detail:`IMO ${x.imo} · MMSI ${x.mmsi||'—'} · ${vesselStatusLabel[x.status]}`,href:`/vessels/${x.id}`}))||[]},
    {title:'Voyage',items:data?.voyages.map(x=>({id:x.id,label:x.voyageNo,detail:`${x.vessel.name} · IMO ${x.vessel.imo} · ${voyageStatusLabel[x.status]}`,href:`/voyages/${x.id}`}))||[]},
  ];
  const total=groups.reduce((sum,x)=>sum+x.items.length,0);
  return <AppShell title="Search" subtitle="Tra cứu Shipment, Container, tàu, IMO, MMSI và Voyage."><section className="panel search-panel"><form className="search-main" onSubmit={submit}><SearchIcon size={20}/><input autoFocus placeholder="Container, tên tàu, IMO, MMSI hoặc Voyage" value={term} onChange={e=>setTerm(e.target.value)}/><button className="primary-button">Tìm kiếm</button></form><p>Nhập ít nhất 2 ký tự. Kết quả được lấy từ dữ liệu đã lưu.</p></section>{error&&<div className="form-error">{error}</div>}{data&&<><div className="section-title"><div><h2>Kết quả cho “{q}”</h2><p>{total} hồ sơ phù hợp</p></div></div>{groups.map(group=>group.items.length>0&&<section key={group.title} className="panel search-group"><div className="panel-heading"><div><h3>{group.title}</h3><p>{group.items.length} kết quả</p></div></div><div className="record-list">{group.items.map(item=><Link key={item.id} href={item.href}><strong>{item.label}</strong><span>{item.detail}</span><ArrowRight size={15}/></Link>)}</div></section>)}{total===0&&<div className="empty-table">Không tìm thấy hồ sơ phù hợp.</div>}</>}</AppShell>;
}
export default function SearchPage(){return <Suspense fallback={null}><SearchContent/></Suspense>;}
