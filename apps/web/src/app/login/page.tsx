'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole, Mail, PackageCheck, ShieldCheck, Ship, Truck } from 'lucide-react';
import { api, CurrentUser } from '@/lib/api';
import { BrandLockup } from '@/components/BrandLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setPending(true);
    try { await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); const user = await api<CurrentUser>('/auth/me'); router.replace(user.permissions.includes('dashboard.view') ? '/dashboard' : '/settings'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Đăng nhập thất bại'); }
    finally { setPending(false); }
  }
  return <div className="auth-layout"><div className="auth-showcase"><BrandLockup className="showcase-brand"/><div className="showcase-main"><div className="showcase-tag">HỆ THỐNG QUẢN LÝ VẬN TẢI</div><h1>Mọi hành trình.<br/><em>Một nơi quản lý.</em></h1><p>Nền tảng điều hành vận tải và giao nhận hàng hóa, được thiết kế để mỗi quyết định đều có dữ liệu hỗ trợ.</p><div className="showcase-lines"><div><PackageCheck size={21}/><span>Lô hàng & Container</span></div><div><Truck size={21}/><span>Điều hành vận tải</span></div><div><Ship size={21}/><span>Theo dõi tàu biển</span></div></div></div><div className="showcase-footer">© 2026 Hành trình vận tải</div></div><div className="auth-panel"><div className="auth-card"><div className="auth-icon"><LockKeyhole size={23}/></div><div className="eyebrow">CHÀO MỪNG TRỞ LẠI</div><h2>Đăng nhập</h2><p className="auth-intro">Truy cập không gian làm việc của bạn.</p><form onSubmit={submit}><label>Email công việc<div className="input-wrap"><Mail size={18}/><input type="email" required autoComplete="username" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)}/></div></label><label>Mật khẩu<div className="input-wrap"><LockKeyhole size={18}/><input type="password" required autoComplete="current-password" placeholder="Nhập mật khẩu" value={password} onChange={e => setPassword(e.target.value)}/></div></label><div className="form-links"><Link href="/forgot-password">Quên mật khẩu?</Link></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button full" disabled={pending}>{pending ? 'Đang đăng nhập…' : 'Đăng nhập'}<ArrowRight size={18}/></button></form><div className="auth-note"><ShieldCheck size={17}/> Phiên đăng nhập được bảo vệ</div></div></div></div>;
}

