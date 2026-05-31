'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AdMetrics } from '../lib/types';

type SortKey = 'ad_id' | 'campaign' | 'impressions' | 'clicks' | 'ctr';
type SortDir = 'asc' | 'desc';

export default function AnalyticsTable() {
  const [metrics, setMetrics] = useState<AdMetrics[]>([]);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [campaign, setCampaign] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('ctr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [resetTarget, setResetTarget] = useState<AdMetrics | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (campaign) params.set('campaign', campaign);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59').toISOString());
    const res = await fetch(`/api/admin/analytics?${params.toString()}`);
    const data = await res.json();
    setMetrics(data.metrics ?? []);
    setCampaigns(data.campaigns ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, from, to]);

  async function confirmReset() {
    if (!resetTarget) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/ads/${resetTarget.ad_id}/reset`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setResetError(body.error || `HTTP ${res.status}`);
        setResetting(false);
        return;
      }
      setResetTarget(null);
      setResetting(false);
      await load();
    } catch (err: any) {
      setResetError(err?.message ?? 'Request failed');
      setResetting(false);
    }
  }

  const sorted = useMemo(() => {
    const arr = [...metrics];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [metrics, sortKey, sortDir]);

  function header(label: string, key: SortKey) {
    const active = sortKey === key;
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th
        onClick={() => {
          if (sortKey === key) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
          } else {
            setSortKey(key);
            setSortDir('desc');
          }
        }}
      >
        {label}
        {arrow}
      </th>
    );
  }

  return (
    <>
      <div className="filter-row">
        <div>
          <label>Campaign</label>
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">All</option>
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label>&nbsp;</label>
          <button
            className="btn"
            onClick={() => {
              setCampaign('');
              setFrom('');
              setTo('');
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="empty">No data yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              {header('Ad ID', 'ad_id')}
              {header('Campaign', 'campaign')}
              {header('Impressions', 'impressions')}
              {header('Clicks', 'clicks')}
              {header('CTR', 'ctr')}
              <th>Status</th>
              <th style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.ad_id}>
                <td>
                  <a href={`/admin/ads/${m.ad_id}`}>
                    <code>{m.ad_id}</code>
                  </a>
                </td>
                <td>{m.campaign}</td>
                <td>{m.impressions.toLocaleString()}</td>
                <td>{m.clicks.toLocaleString()}</td>
                <td>{(m.ctr * 100).toFixed(2)}%</td>
                <td>
                  <span className={`pill pill-${m.status}`}>{m.status}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setResetError(null);
                      setResetTarget(m);
                    }}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {resetTarget && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetting) setResetTarget(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <h2 style={{ marginTop: 0 }}>Reset analytics?</h2>
            <p>
              This will permanently delete all <strong>{resetTarget.impressions.toLocaleString()}</strong>{' '}
              impressions and <strong>{resetTarget.clicks.toLocaleString()}</strong> clicks for{' '}
              <code>{resetTarget.ad_id}</code>.
            </p>
            <p className="muted" style={{ marginTop: -8 }}>
              The ad itself is not deleted — only its tracking history. This action cannot be undone.
            </p>
            {resetError && (
              <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{resetError}</div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setResetTarget(null)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmReset}
                disabled={resetting}
              >
                {resetting ? 'Resetting…' : 'Reset analytics'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
