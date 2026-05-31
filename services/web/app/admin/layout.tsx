import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="admin-nav">
        <span className="brand">Mock Ad Tester</span>
        <Link href="/admin/ads">Ads</Link>
        <Link href="/admin/feeds">Feeds</Link>
        <Link href="/admin/analytics">Analytics</Link>
      </nav>
      <main className="admin-shell">{children}</main>
    </>
  );
}
