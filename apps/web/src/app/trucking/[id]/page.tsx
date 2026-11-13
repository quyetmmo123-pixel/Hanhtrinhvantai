'use client';
import { useParams } from 'next/navigation';
import TransportJobDetail from '@/components/TransportJobDetail';
export default function Page(){return <TransportJobDetail id={useParams<{id:string}>().id} own={false}/>;}
