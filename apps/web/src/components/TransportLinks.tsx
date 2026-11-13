'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/operations';
import { jobStatusLabel, TransportJob } from '@/lib/trucking';

export default function TransportLinks({shipmentId,containerId}:{shipmentId?:string;containerId?:string}){
  const [jobs,setJobs]=useState<TransportJob[]>([]),[error,setError]=useState('');
  useEffect(()=>{const q=shipmentId?`shipmentId=${encodeURIComponent(shipmentId)}`:`containerId=${encodeURIComponent(containerId||'')}`;api<TransportJob[]>(`/transport-jobs?${q}`).then(setJobs).catch(e=>setError(e.message));},[shipmentId,containerId]);
  return <section className="panel detail-table"><div className="panel-heading"><div><h3>Vận tải đường bộ</h3><p>Xe và tài xế phụ trách các chuyến liên quan</p></div></div>{error&&<div className="form-error">{error}</div>}<div className="record-list">{jobs.map(x=><Link key={x.id} href={`/trucking/${x.id}`}><strong>{x.jobNo} · {x.truck.plateNo}</strong><span>{x.driver.fullName} · {jobStatusLabel[x.status]} · {dateTime(x.pickupAt)}</span></Link>)}{!jobs.length&&!error&&<p className="empty-inline">Chưa có chuyến đường bộ.</p>}</div></section>;
}
