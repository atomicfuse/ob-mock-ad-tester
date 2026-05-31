'use client';

import { useEffect, useState } from 'react';
import type { FeedAnalytics } from '../lib/types';

function formatMs(ms: number) {
  if (!ms) return '0s';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export default function FeedAnalyticsView({ feedId }: { feedId: string }) {
  const [data, setData] = useState<FeedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/feeds/${feedId}/analytics`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId]);

  if (loading) return <div className="empty">Loading…</div>;
  if (!data) return <div className="empty">No data.</div>;

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Entries" value={data.totals.entries.toLocaleString()} />
        <KpiCard label="Exits" value={data.totals.exits.toLocaleString()} />
        <KpiCard
          label="Avg cards viewed"
          value={data.totals.avg_cards_viewed.toFixed(1)}
        />
        <KpiCard
          label="Avg time in feed"
          value={formatMs(data.totals.avg_time_in_feed_ms)}
        />
      </div>

      <div className="row between" style={{ marginBottom: 8 }}>
        <h2>Per-item performance</h2>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      {data.items.length === 0 ? (
        <div className="empty">No items in this feed yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th style={{ width: 90 }}>Kind</th>
              <th>Item</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>Exits here</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.position}>
                <td>{m.position}</td>
                <td>
                  <span
                    className="pill"
                    style={{
                      background: m.kind === 'ad' ? '#fef3c7' : '#dbeafe',
                      color: m.kind === 'ad' ? '#92400e' : '#1e40af',
                    }}
                  >
                    {m.kind}
                  </span>
                </td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.label}
                </td>
                <td>{m.impressions.toLocaleString()}</td>
                <td>{m.clicks.toLocaleString()}</td>
                <td>{(m.ctr * 100).toFixed(2)}%</td>
                <td>{m.exits.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
