'use client';

import { FormEvent, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false); const router = useRouter();
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setMessage(''); if (newPassword !== confirm) { setError('Hai mật khẩu mới chưa khớp'); return; } setPending(true); try { const response = await api<{message:string}>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); setMessage(response.message); setTimeout(() => router.replace('/login'), 2000); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể đổi mật khẩu'); } finally { setPending(false); } }
  return <AppShell title="Settings" subtitle="Quản lý bảo mật tài khoản của bạn."><div className="settings-grid"><div className="panel settings-panel"><div className="panel-heading"><div><h3>Đổi mật khẩu</h3><p>Phiên đăng nhập hiện tại sẽ kết thúc sau khi đổi mật khẩu.</p></div><LockKeyhole size={20}/></div><form onSubmit={submit} className="settings-form"><label>Mật khẩu hiện tại<input type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}/></label><label>Mật khẩu mới<input type="password" minLength={12} required autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)}/><small>Ít nhất 12 ký tự</small></label><label>Xác nhận mật khẩu mới<input type="password" minLength={12} required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label>{error && <div className="form-error">{error}</div>}{message && <div className="form-info">{message}</div>}<button className="primary-button" disabled={pending}>{pending ? 'Đang lưu…' : 'Cập nhật mật khẩu'}</button></form></div><div className="security-aside"><div className="security-icon"><ShieldCheck size={26}/></div><h3>Tài khoản được bảo vệ</h3><p>Mật khẩu được băm trước khi lưu. Bạn có thể kết thúc mọi phiên hiện tại bằng cách đổi mật khẩu.</p></div></div></AppShell>;
}
