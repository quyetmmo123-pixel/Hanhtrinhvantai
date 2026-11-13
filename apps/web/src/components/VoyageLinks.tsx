'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/operations';
import { voyageStatusLabel, Voyage } from '@/lib/maritime';
export default function VoyageLinks({shipmentId,containerId}:{shipmentId?:string;containerId?:string}){
  const [items,setItems]=useState<Voyage[]>([]),[error,setError]=useState('');
  useEffect(()=>{const key=containerId?'containerId':'shipmentId',value=containerId||shipmentId||'';api<Voyage[]>(`/voyages?${key}=${encodeURIComponent(value)}`).then(setItems).catch(e=>setError(e.message));},[shipmentId,containerId]);
  return <section className="panel detail-table"><div className="panel-heading"><div><h3>Vessel / Voyage</h3><p>Tàu và lịch trình gắn với container của hồ sơ</p></div></div>{error&&<div className="form-error">{error}</div>}<div className="record-list">{items.map(v=><Link key={v.id} href={`/voyages/${v.id}`}><strong>{v.vessel.name} · {v.voyageNo}</strong><span>IMO {v.vessel.imo} · {v.pol.code} → {v.pod.code} · ETA {dateTime(v.eta)} · {voyageStatusLabel[v.status]}</span></Link>)}{!items.length&&!error&&<p className="empty-inline">Chưa có Voyage liên kết.</p>}</div></section>;
}
