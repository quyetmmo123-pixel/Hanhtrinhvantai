'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/operations';
import { jobStatusLabel, TransportJob } from '@/lib/trucking';
export default function MyJobsPage(){
  const [items,setItems]=useState<TransportJob[]>([]),[error,setError]=useState('');
  useEffect(()=>{api<TransportJob[]>('/my-jobs').then(setItems).catch(e=>setError(e instanceof Error?e.message:'Không tải được chuyến'));},[]);
  return <AppShell title="Chuyến của tôi" subtitle="Chỉ hiển thị các chuyến được giao cho tài khoản tài xế này.">{error&&<div className="form-error">{error}</div>}<section className="panel users-panel"><div className="panel-heading"><h3>Chuyến được giao</h3></div><div className="table-scroll"><table><thead><tr><th>MÃ CHUYẾN</th><th>SHIPMENT</th><th>XE</th><th>ĐIỂM LẤY → GIAO</th><th>GIỜ LẤY</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td><strong>{x.jobNo}</strong></td><td>{x.shipment.shipmentNo}</td><td>{x.truck.plateNo}</td><td>{x.pickupPlace} → {x.deliveryPlace}</td><td>{dateTime(x.pickupAt)}</td><td>{jobStatusLabel[x.status]}</td><td><Link className="row-link" href={`/my-jobs/${x.id}`}>Cập nhật</Link></td></tr>)}</tbody></table>{!items.length&&<p className="empty-inline">Chưa có chuyến được giao.</p>}</div></section></AppShell>;
}
