'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { BrandLockup } from '@/components/BrandLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setPending(true); try { const result = await api<{message:string}>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }); setMessage(result.message); } catch (e) { setMessage(e instanceof Error ? e.message : 'Không thể gửi yêu cầu'); } finally { setPending(false); } }
  return <div className="simple-auth"><div className="simple-auth-card"><BrandLockup className="simple-brand-lockup"/><div className="eyebrow">KHÔI PHỤC TÀI KHOẢN</div><h1>Quên mật khẩu?</h1><p>Nhập email của bạn. Nếu tài khoản tồn tại, hệ thống sẽ gửi liên kết đặt lại mật khẩu.</p><form onSubmit={submit}><label>Email<div className="input-wrap"><Mail size={18}/><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com"/></div></label>{message && <div className="form-info" role="status">{message}</div>}<button className="primary-button full" disabled={pending}>{pending ? 'Đang gửi…' : 'Gửi liên kết'}</button></form><Link className="back-link" href="/login"><ArrowLeft size={16}/> Trở lại đăng nhập</Link></div></div>;
}

