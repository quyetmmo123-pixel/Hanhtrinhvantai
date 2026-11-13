import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'TMS • Quản lý vận tải', description: 'Nền tảng quản lý vận tải và giao nhận hàng hóa' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
