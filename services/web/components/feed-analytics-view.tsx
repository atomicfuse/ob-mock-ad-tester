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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/feeds/${feedId}/analytics`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }

  async function confirmClear() {
    setClearing(true);
    setClearError(null);
    try {
      const res = await fetch(`/api/admin/feeds/${feedId}/reset`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setClearError(body.error || `HTTP ${res.status}`);
        setClearing(false);
        return;
      }
      setShowClearConfirm(false);
      setClearing(false);
      await load();
    } catch (err: any) {
      setClearError(err?.message ?? 'Request failed');
      setClearing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId]);

  if (loading) return <div className="empty">Loading…</div>;
  if (!data) return <div className="empty">No data.</div>;

  const totalImpressions = data.items.reduce((s, m) => s + m.impressions, 0);
  const totalClicks = data.items.reduce((s, m) => s + m.clicks, 0);

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
        <div className="row">
          <button className="btn" onClick={load}>
            Refresh
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              setClearError(null);
              setShowClearConfirm(true);
            }}
          >
            Clear Data
          </button>
        </div>
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

      {showClearConfirm && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !clearing) setShowClearConfirm(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <h2 style={{ marginTop: 0 }}>Clear feed analytics?</h2>
            <p>
              This will permanently delete all{' '}
              <strong>{totalImpressions.toLocaleString()}</strong> impressions,{' '}
              <strong>{totalClicks.toLocaleString()}</strong> clicks, and{' '}
              <strong>{data.totals.exits.toLocaleString()}</strong> exit records for{' '}
              <code>{feedId}</code>.
            </p>
            <p className="muted" style={{ marginTop: -8 }}>
              The feed and its items are not deleted — only the tracking history. This action cannot be undone.
            </p>
            {clearError && (
              <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{clearError}</div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmClear}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'Clear data'}
              </button>
            </div>
          </div>
        </div>
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
