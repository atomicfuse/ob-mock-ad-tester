'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { MockAd } from '../lib/types';

export default function AdsTable({ initialAds }: { initialAds: MockAd[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(ad: MockAd) {
    setBusy(ad.ad_id);
    const next = ad.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/admin/ads/${ad.ad_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    router.refresh();
  }

  async function del(ad: MockAd) {
    if (!confirm(`Delete ${ad.ad_id}? This cannot be undone.`)) return;
    setBusy(ad.ad_id);
    await fetch(`/api/admin/ads/${ad.ad_id}`, { method: 'DELETE' });
    setBusy(null);
    router.refresh();
  }

  if (initialAds.length === 0) {
    return (
      <div className="empty">
        <p>No ads yet.</p>
        <Link href="/admin/ads/new" className="btn btn-primary">
          Create your first ad
        </Link>
      </div>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Ad ID</th>
          <th>Campaign</th>
          <th>Title</th>
          <th>Brand</th>
          <th>Status</th>
          <th style={{ width: 280 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {initialAds.map((ad) => (
          <tr key={ad.ad_id}>
            <td>
              <Link href={`/admin/ads/${ad.ad_id}`}>
                <code>{ad.ad_id}</code>
              </Link>
            </td>
            <td>{ad.campaign}</td>
            <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ad.title}
            </td>
            <td>{ad.brand}</td>
            <td>
              <span className={`pill pill-${ad.status}`}>{ad.status}</span>
            </td>
            <td>
              <div className="row" style={{ gap: 6 }}>
                <Link href={`/admin/ads/${ad.ad_id}`} className="btn">
                  Edit
                </Link>
                <button
                  type="button"
                  className="btn"
                  disabled={busy === ad.ad_id}
                  onClick={() => toggle(ad)}
                >
                  {ad.status === 'active' ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy === ad.ad_id}
                  onClick={() => del(ad)}
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
