'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Package, Plus, Search, X } from 'lucide-react';
import AppShell from '@/components/AppShell';
import ShipmentForm from '@/components/ShipmentForm';
import { api } from '@/lib/api';
import { Shipment, ShipmentStatus, shipmentStatusLabel, shortDate } from '@/lib/operations';
import { useCanManage } from '@/lib/useCanManage';

export default function ShipmentsPage(){
  const [items,setItems]=useState<Shipment[]>([]);const [q,setQ]=useState('');const [status,setStatus]=useState('');const [open,setOpen]=useState(false);const [error,setError]=useState('');const canManage=useCanManage();
  async function load(search='',filter=''){try{setItems(await api<Shipment[]>(`/shipments?q=${encodeURIComponent(search)}&status=${encodeURIComponent(filter)}`));}catch(e){setError(e instanceof Error?e.message:'Không tải được Shipment');}}
  useEffect(()=>{load();},[]);
  function search(e:FormEvent){e.preventDefault();load(q,status);}
  return <AppShell title="Shipment" subtitle="Quản lý lô hàng từ tạo mới đến hoàn thành."><div className="panel users-panel"><div className="users-toolbar"><div><h3>Danh sách Shipment</h3><p>{items.length} lô hàng đang hiển thị</p></div>{canManage&&<button className="primary-button" onClick={()=>setOpen(true)}><Plus size={17}/> Tạo Shipment</button>}</div>{error&&<div className="form-error">{error}</div>}<div className="table-tools filters"><form className="search-box" onSubmit={search}><Search size={18}/><input placeholder="Mã Shipment, hàng, khách hàng..." value={q} onChange={e=>setQ(e.target.value)}/></form><select value={status} onChange={e=>{setStatus(e.target.value);load(q,e.target.value);}}><option value="">Tất cả trạng thái</option>{(Object.keys(shipmentStatusLabel) as ShipmentStatus[]).map(x=><option key={x} value={x}>{shipmentStatusLabel[x]}</option>)}</select></div><div className="table-scroll"><table><thead><tr><th>SHIPMENT</th><th>KHÁCH HÀNG / HÀNG</th><th>TUYẾN</th><th>TRẠNG THÁI</th><th>ETA</th><th></th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td><strong className="code-label">{x.shipmentNo}</strong><small className="table-sub">{shortDate(x.createdAt)}</small></td><td><strong>{x.customer.companyName}</strong><small className="table-sub">{x.cargoName}</small></td><td>{x.pol?.code||'—'} → {x.pod?.code||'—'}</td><td><span className={`status status-${x.status.toLowerCase()}`}>{shipmentStatusLabel[x.status]}</span></td><td>{shortDate(x.eta)}</td><td><Link className="row-link" href={`/shipments/${x.id}`}>Chi tiết <ArrowRight size={15}/></Link></td></tr>)}</tbody></table>{items.length===0&&<div className="empty-table"><Package size={25}/><p>Chưa có Shipment phù hợp.</p></div>}</div></div>{open&&<div className="modal-backdrop" onClick={()=>setOpen(false)}><div className="modal modal-xl" role="dialog" aria-modal="true" aria-label="Tạo Shipment" onClick={e=>e.stopPropagation()}><div className="modal-heading"><div><h2>Tạo Shipment</h2><p>Nhập thông tin lô hàng và tuyến vận chuyển.</p></div><button onClick={()=>setOpen(false)} aria-label="Đóng"><X size={20}/></button></div><ShipmentForm onCancel={()=>setOpen(false)} onSaved={()=>{setOpen(false);load(q,status);}}/></div></div>}</AppShell>;
}
