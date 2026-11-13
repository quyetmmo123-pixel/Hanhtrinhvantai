'use client';
import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { api } from '@/lib/api';
import { BrandLockup } from '@/components/BrandLogo';

function ResetForm() {
  const token = useSearchParams().get('token') || ''; const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [message, setMessage] = useState(''); const [success, setSuccess] = useState(false); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (password !== confirm) { setMessage('Hai mật khẩu chưa khớp'); return; } setPending(true); try { const result = await api<{message:string}>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword: password }) }); setMessage(result.message); setSuccess(true); } catch (e) { setMessage(e instanceof Error ? e.message : 'Đặt lại mật khẩu thất bại'); } finally { setPending(false); } }
  return <div className="simple-auth"><div className="simple-auth-card"><BrandLockup className="simple-brand-lockup"/><div className="eyebrow">BẢO MẬT TÀI KHOẢN</div><h1>Đặt lại mật khẩu</h1><p>Chọn mật khẩu mới có ít nhất 12 ký tự.</p>{!token ? <div className="form-error">Liên kết thiếu mã xác nhận.</div> : !success && <form onSubmit={submit}><label>Mật khẩu mới<div className="input-wrap"><LockKeyhole size={18}/><input type="password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)}/></div></label><label>Nhập lại mật khẩu<div className="input-wrap"><LockKeyhole size={18}/><input type="password" minLength={12} required value={confirm} onChange={e => setConfirm(e.target.value)}/></div></label><button className="primary-button full" disabled={pending}>{pending ? 'Đang lưu…' : 'Đặt lại mật khẩu'}</button></form>}{message && <div className={success ? 'form-info' : 'form-error'} role="status">{message}</div>}<Link className="back-link" href="/login"><ArrowLeft size={16}/> Trở lại đăng nhập</Link></div></div>;
}
export default function ResetPasswordPage() { return <Suspense fallback={null}><ResetForm/></Suspense>; }

