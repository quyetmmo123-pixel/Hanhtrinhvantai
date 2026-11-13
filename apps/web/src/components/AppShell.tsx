'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Bell, CalendarDays, ChevronDown, CircleDollarSign, Container, FileText, LayoutDashboard, MapPinned, Menu, Package, Search, Settings, Ship, Truck, UserRound, Users, Wallet, X } from 'lucide-react';
import { api, CurrentUser } from '@/lib/api';
import { BrandLockup, BrandMark } from './BrandLogo';
import DeleteRecordButton from './DeleteRecordButton';

const nav = [
  { label: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard, enabled: true },
  { label: 'Lô hàng', href: '/shipments', icon: Package, enabled: true, operation: true },
  { label: 'Đặt chỗ', href: '/bookings', icon: CalendarDays, enabled: true, operation: true },
  { label: 'Container', href: '/containers', icon: Container, enabled: true, operation: true },
  { label: 'Tàu biển', href: '/vessels', icon: Ship, enabled: true, operation: true },
  { label: 'Chuyến tàu', href: '/voyages', icon: CalendarDays, enabled: true, operation: true },
  { label: 'Bản đồ tàu trực tiếp', href: '/live-map', icon: MapPinned, enabled: true, operation: true },
  { label: 'Điều vận đường bộ', href: '/trucking', icon: Truck, enabled: true, operation: true },
  { label: 'Đội xe', href: '/fleet', icon: Truck, enabled: true, operation: true },
  { label: 'Tài xế', href: '/drivers', icon: UserRound, enabled: true, operation: true },
  { label: 'Chuyến của tôi', href: '/my-jobs', icon: Truck, enabled: true, driver: true },
  { label: 'Khách hàng', href: '/customers', icon: Users, enabled: true, operation: true },
  { label: 'Chứng từ', href: '/documents', icon: FileText, enabled: true, operation: true },
  { label: 'Chi phí', href: '/costs', icon: Wallet, enabled: true, finance: true },
  { label: 'Doanh thu', href: '/revenue', icon: CircleDollarSign, enabled: true, finance: true },
  { label: 'Cảnh báo', href: '/alerts', icon: AlertTriangle, enabled: true, alert: true },
  { label: 'Báo cáo', href: '/reports', icon: BarChart3, enabled: true, reports: true },
  { label: 'Người dùng', href: '/users', icon: Users, enabled: true, admin: true },
  { label: 'Cài đặt', href: '/settings', icon: Settings, enabled: true },
];

export default function AppShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const recordRoute: Record<string, { kind: string; list: string }> = { customers: {kind:'customers',list:'/customers'}, shipments:{kind:'shipments',list:'/shipments'}, bookings:{kind:'bookings',list:'/bookings'}, containers:{kind:'containers',list:'/containers'}, fleet:{kind:'trucks',list:'/fleet'}, drivers:{kind:'drivers',list:'/drivers'}, trucking:{kind:'jobs',list:'/trucking'}, vessels:{kind:'vessels',list:'/vessels'}, voyages:{kind:'voyages',list:'/voyages'} };
  const [route, recordId] = pathname.split('/').filter(Boolean);
  const deleteTarget = recordId && recordRoute[route] ? { ...recordRoute[route], id: recordId } : null;

  useEffect(() => {
    api<CurrentUser>('/auth/me').then(setUser).catch(() => router.replace('/login')).finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } finally { router.replace('/login'); }
  }

  function searchSubmit(event: FormEvent) { event.preventDefault(); if (search.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(search.trim())}`); }

  if (loading) return <div className="loading-screen"><BrandMark/><p>Đang tải không gian làm việc…</p></div>;
  if (!user) return null;
  if (pathname === '/users' && !user.permissions.includes('users.manage')) return <div className="loading-screen">Bạn không có quyền truy cập trang này.</div>;
  if ((pathname.startsWith('/costs') || pathname.startsWith('/revenue')) && !user.permissions.includes('finance.view')) return <div className="loading-screen">Bạn không có quyền xem dữ liệu tài chính.</div>;
  if (pathname.startsWith('/reports') && !user.permissions.includes('reports.view')) return <div className="loading-screen">Bạn không có quyền xem báo cáo.</div>;
  if (pathname.startsWith('/alerts') && !user.permissions.includes('operations.view')) return <div className="loading-screen">Bạn không có quyền xem cảnh báo.</div>;
  if (pathname.startsWith('/documents') && !user.permissions.includes('operations.view')) return <div className="loading-screen">Bạn không có quyền xem chứng từ.</div>;
  if (pathname === '/dashboard' && !user.permissions.includes('dashboard.view')) return <div className="loading-screen">Vai trò của bạn chưa có dashboard trong giai đoạn này.</div>;
  if ((pathname.startsWith('/customers') || pathname.startsWith('/shipments') || pathname.startsWith('/bookings') || pathname.startsWith('/containers') || pathname.startsWith('/search') || pathname.startsWith('/vessels') || pathname.startsWith('/voyages') || pathname.startsWith('/live-map')) && !user.permissions.includes('operations.view')) return <div className="loading-screen">Bạn không có quyền xem dữ liệu giao nhận.</div>;
  if ((pathname.startsWith('/trucking') || pathname.startsWith('/fleet') || pathname.startsWith('/drivers')) && !user.permissions.includes('operations.view')) return <div className="loading-screen">Bạn không có quyền xem vận tải đường bộ.</div>;
  if (pathname.startsWith('/my-jobs') && !user.permissions.includes('jobs.own.view')) return <div className="loading-screen">Bạn không có quyền xem chuyến được giao.</div>;

  return <div className="app-layout">
    {menuOpen && <button aria-label="Đóng menu" className="mobile-scrim" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><BrandLockup className="sidebar-lockup"/><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"><X size={18}/></button></div>
      <div className="nav-caption">ĐIỀU HƯỚNG</div>
      <nav className="side-nav">{nav.map(({ label, href, icon: Icon, enabled, admin, operation, driver, finance, alert, reports }) => {
        if (admin && !user.permissions.includes('users.manage')) return null;
        if (operation && !user.permissions.includes('operations.view')) return null;
        if (driver && !user.permissions.includes('jobs.own.view')) return null;
        if (finance && !user.permissions.includes('finance.view')) return null;
        if (alert && !user.permissions.includes('operations.view')) return null;
        if (reports && !user.permissions.includes('reports.view')) return null;
        if (href === '/dashboard' && !user.permissions.includes('dashboard.view')) return null;
        return enabled ? <Link key={href} className={`nav-item ${pathname === href || pathname.startsWith(href + '/') ? 'active' : ''}`} href={href} onClick={() => setMenuOpen(false)}><Icon size={18}/><span>{label}</span></Link>
          : <div key={href} className="nav-item disabled" title="Sẽ triển khai ở giai đoạn tiếp theo"><Icon size={18}/><span>{label}</span><i/></div>;
      })}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><Bell size={18}/><strong>Quản lý vận tải</strong><p>Lô hàng, đội xe, tàu biển, chứng từ và tài chính.</p></div><div className="sidebar-version">Hành trình vận tải <span>v0.7</span></div></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><button className="menu-toggle" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Menu size={21}/></button><div className="breadcrumb">Hành trình vận tải <span>/</span> <strong>{title}</strong></div>{user.permissions.includes('operations.view') && <form className="global-search" onSubmit={searchSubmit}><Search size={16}/><input aria-label="Tìm kiếm toàn hệ thống" placeholder="Container, tên tàu, IMO, chuyến tàu, biển số..." value={search} onChange={e => setSearch(e.target.value)}/></form>}<div className="topbar-actions"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{user.fullName.charAt(0).toUpperCase()}</span><span className="profile-label"><strong>{user.fullName}</strong><small>{user.roles.join(', ')}</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="profile-menu"><Link href="/settings" onClick={() => setProfileOpen(false)}>Tài khoản và mật khẩu</Link><button onClick={logout}>Đăng xuất</button></div>}</div></header>
      <main className="content"><div className="page-heading"><div><div className="eyebrow">TRANSFLOW / {title.toUpperCase()}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{deleteTarget&&(user.permissions.includes('shipments.manage')||user.permissions.includes('trucking.manage'))&&<DeleteRecordButton kind={deleteTarget.kind} id={deleteTarget.id} label={subtitle||title} onDeleted={()=>router.push(deleteTarget.list)}/>}</div>{children}</main>
    </div>
  </div>;
}
