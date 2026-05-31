'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { FeedInitiative } from '../lib/types';

export default function FeedsTable({ initialFeeds }: { initialFeeds: FeedInitiative[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(feed: FeedInitiative) {
    setBusy(feed.feed_id);
    const next = feed.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/admin/feeds/${feed.feed_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    router.refresh();
  }

  async function del(feed: FeedInitiative) {
    if (!confirm(`Delete feed ${feed.feed_id} and all its items? Cannot be undone.`)) return;
    setBusy(feed.feed_id);
    await fetch(`/api/admin/feeds/${feed.feed_id}`, { method: 'DELETE' });
    setBusy(null);
    router.refresh();
  }

  if (initialFeeds.length === 0) {
    return (
      <div className="empty">
        <p>No feeds yet.</p>
        <Link href="/admin/feeds/new" className="btn btn-primary">
          Create your first feed
        </Link>
      </div>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Feed ID</th>
          <th>Name</th>
          <th>Trigger</th>
          <th>Ratio</th>
          <th>Status</th>
          <th style={{ width: 320 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {initialFeeds.map((feed) => (
          <tr key={feed.feed_id}>
            <td>
              <Link href={`/admin/feeds/${feed.feed_id}`}>
                <code>{feed.feed_id}</code>
              </Link>
            </td>
            <td>{feed.name}</td>
            <td>
              {feed.trigger.mode === 'scroll'
                ? `scroll @ ${feed.trigger.scroll_depth_px}px`
                : 'manual'}
            </td>
            <td>{feed.ad_ratio}:1</td>
            <td>
              <span className={`pill pill-${feed.status}`}>{feed.status}</span>
            </td>
            <td>
              <div className="row" style={{ gap: 6 }}>
                <Link href={`/admin/feeds/${feed.feed_id}`} className="btn">
                  Edit
                </Link>
                <Link
                  href={`/admin/feeds/${feed.feed_id}/preview`}
                  className="btn"
                  target="_blank"
                  rel="noopener"
                >
                  Preview
                </Link>
                <Link href={`/admin/feeds/${feed.feed_id}/analytics`} className="btn">
                  Analytics
                </Link>
                <button
                  type="button"
                  className="btn"
                  disabled={busy === feed.feed_id}
                  onClick={() => toggle(feed)}
                >
                  {feed.status === 'active' ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy === feed.feed_id}
                  onClick={() => del(feed)}
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
