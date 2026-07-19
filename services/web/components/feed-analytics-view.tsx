'use client';

import { Fragment, useEffect, useState } from 'react';
import type { FeedAnalytics } from '../lib/types';

interface SourceRow {
  key: string;
  sessions: number;
  avg_cards: number;
  avg_ad_views: number;
  ad_clicks: number;
  ad_clicks_per_session: number;
  ad_click_session_rate: number;
  continuation_rate: number;
  depth: { d2: number; d4: number; d6: number; d8: number; d10: number };
  avg_time_ms: number;
}

interface CapiLogRow {
  ts: string;
  sink: string;
  event_name: string;
  /** Standard Meta event alias for this custom event. The activity log only
   *  returns the five dictionary events (with depth-suffixed names like
   *  swipe_depth:4), so this should always resolve — kept nullable and
   *  rendered defensively in case older log rows lack it. */
  std_alias?: string | null;
  status: 'ok' | 'error' | 'skipped';
  skip_reason?: string;
  http_status?: number;
  error?: string;
}

interface SourceData {
  group: string;
  rows: SourceRow[];
  capi_errors_24h: number;
  capi_recent: CapiLogRow[];
}

// Page-level date range. Preset values match the `range` query param contract
// on the analytics + attribution endpoints; every section re-fetches when this
// changes. 'custom' is UI-only — it means the from/to date inputs drive the
// query instead of a preset.
const RANGE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom…' },
];

// Page-level session-origin filter. Values match the `origin` query param on
// the analytics + attribution endpoints: 'direct' = sessions that started on
// this feed, 'chained' = sessions that arrived from another feed via the
// chooser card. 'all' (default) sends no param. direct + chained partition all.
const ORIGIN_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'direct', label: 'This funnel' },
  { value: 'chained', label: 'Different feeds' },
];

const GROUP_OPTIONS = [
  { value: 'sub', label: 'Sub ID' },
  { value: 'cmp', label: 'Campaign' },
  { value: 'ast', label: 'Adset' },
  { value: 'ad', label: 'Ad' },
  { value: 'plc', label: 'Placement' },
  { value: 'utm_campaign', label: 'UTM campaign' },
  { value: 'utm_source', label: 'UTM source' },
];

function formatMs(ms: number) {
  if (!ms) return '0s';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

// USD formatter for cost metrics. Sub-dollar values (e.g. session cost) get
// more precision so they don't round away to $0.00.
function fmtMoney(n: number) {
  const digits = n > 0 && n < 0.1 ? 4 : 2;
  return (
    '$' +
    n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
}

export default function FeedAnalyticsView({ feedId }: { feedId: string }) {
  const [data, setData] = useState<FeedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sourceGroup, setSourceGroup] = useState('sub');
  const [sourceData, setSourceData] = useState<SourceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Page-level range that governs EVERY section (funnel, KPIs, by-source, CAPI,
  // per-item). Changing it re-fetches both endpoints. Presets go out as
  // `?range=`; custom from/to dates go out as `?from=`/`?to=` (YYYY-MM-DD,
  // inclusive, UTC) and take the preset's place entirely.
  const [range, setRange] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Page-level origin filter (see ORIGIN_OPTIONS). Like the date range, it
  // rides along on both fetches and applies to every section.
  const [origin, setOrigin] = useState('all');
  // Subtle in-place indicator for re-fetches once the page is already rendered,
  // so switching ranges doesn't blank the whole view.
  const [refetching, setRefetching] = useState(false);
  // Manually-entered Meta campaign spend, persisted per feed in localStorage.
  // Drives the cost-per-outcome cards; it's not part of the analytics fetch.
  const [spend, setSpend] = useState('');

  // Appends the date window + origin filter to a query string. Custom from/to
  // dates win over the preset (the backend also gives them precedence, but
  // it's cleaner to send only one form). Either bound may be sent alone.
  // "Custom…" selected with both inputs still empty falls back to all-time.
  // Origin is only sent when narrowed — 'all' is the backend default.
  function applyDateParams(params: URLSearchParams) {
    if (fromDate || toDate) {
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
    } else {
      params.set('range', range === 'custom' ? 'all' : range);
    }
    if (origin !== 'all') params.set('origin', origin);
  }

  async function load(fresh = false) {
    // First load blanks to the full "Loading…" state; later re-fetches (range
    // change, refresh, post-clear) update in place.
    const subtle = data !== null;
    if (subtle) setRefetching(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (fresh) params.set('fresh', '1');
      applyDateParams(params);
      const res = await fetch(`/api/admin/feeds/${feedId}/analytics?${params.toString()}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setLoadError(res.status === 503 ? 'The database is busy right now.' : `HTTP ${res.status}`);
      }
    } catch {
      setLoadError('Network error.');
    }
    if (subtle) setRefetching(false);
    else setLoading(false);
  }

  async function loadBySource(group: string) {
    const params = new URLSearchParams();
    params.set('group', group);
    applyDateParams(params);
    const res = await fetch(
      `/api/admin/feeds/${feedId}/attribution?${params.toString()}`,
    );
    if (res.ok) setSourceData(await res.json());
  }

  useEffect(() => {
    loadBySource(sourceGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, sourceGroup, range, fromDate, toDate, origin]);

  async function confirmClear() {
    setClearing(true);
    setClearError(null);
    try {
      const res = await fetch(`/api/admin/feeds/${feedId}/reset`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setClearError(body.error || `HTTP ${res.status}`);
        setClearing(false);
        return;
      }
      setShowClearConfirm(false);
      setClearing(false);
      setSelectedDate('');
      setExpanded(new Set());
      await load();
    } catch (err: any) {
      setClearError(err?.message ?? 'Request failed');
      setClearing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, range, fromDate, toDate, origin]);

  // Restore the saved spend for this feed on mount / feed change.
  useEffect(() => {
    try {
      setSpend(localStorage.getItem(`feed-spend:${feedId}`) ?? '');
    } catch {
      /* localStorage unavailable — leave spend empty */
    }
  }, [feedId]);

  function updateSpend(v: string) {
    setSpend(v);
    try {
      localStorage.setItem(`feed-spend:${feedId}`, v);
    } catch {
      /* ignore persistence failures */
    }
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (!data) {
    // Distinguish "the fetch failed" from "this feed has no analytics" — a DB
    // hiccup used to render as a misleading "No data."
    if (loadError) {
      return (
        <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <span>Couldn&apos;t load analytics — {loadError}</span>
          <button className="btn btn-primary" onClick={() => load(true)}>Retry</button>
        </div>
      );
    }
    return <div className="empty">No data.</div>;
  }

  const allDates = data.daily.map((d) => d.date);

  function toggleExpanded(pos: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }

  // Impressions/clicks/exits for an item, scoped to the selected day (or all-time).
  function metricsForItem(m: FeedAnalytics['items'][number]) {
    if (!selectedDate) return { impressions: m.impressions, clicks: m.clicks, exits: m.exits };
    const day = m.daily.find((d) => d.date === selectedDate);
    return {
      impressions: day?.impressions ?? 0,
      clicks: day?.clicks ?? 0,
      exits: day?.exits ?? 0,
    };
  }

  // Ad clicks at this position: full-card slot clicks for AD rows, under-card
  // banner clicks for content rows. These are NOT included in `clicks` (which
  // is content clicks only). Per-day rows don't carry adClicks today, so when
  // a day is selected we read it defensively and fall back to 0 rather than
  // showing an all-time number against one day's other metrics.
  function adClicksForItem(m: FeedAnalytics['items'][number]) {
    if (!selectedDate) return m.adClicks ?? 0;
    const day = m.daily.find((d) => d.date === selectedDate) as
      | { adClicks?: number }
      | undefined;
    return day?.adClicks ?? 0;
  }

  // Impressions the NEXT card down the funnel received (0 for the last card),
  // scoped to the selected day.
  function nextImpressions(idx: number) {
    const next = idx + 1 < data!.items.length ? data!.items[idx + 1] : null;
    if (!next) return 0;
    if (!selectedDate) return next.impressions;
    return next.daily.find((d) => d.date === selectedDate)?.impressions ?? 0;
  }

  // Real churn at a card: reached it, didn't click through, wasn't a tracked
  // exit, and never advanced to the next card.
  function churnFor(idx: number) {
    const { impressions, clicks, exits } = metricsForItem(data!.items[idx]);
    return Math.max(0, impressions - clicks - exits - nextImpressions(idx));
  }

  // Per-card-kind impressions (day-aware via metricsForItem). Content/info
  // cards = articles + listicle cards; full-card ads are the ad-slot items.
  // Banners aren't feed items and are counted via ad_placements below.
  let artImp = 0; // article-card impressions
  let cardImp = 0; // listicle card impressions
  let adCardImp = 0; // full-card ad-slot impressions
  for (const m of data.items) {
    const { impressions } = metricsForItem(m);
    if (m.kind === 'ad') adCardImp += impressions;
    else if (m.kind === 'card') cardImp += impressions;
    else artImp += impressions;
  }
  const contentImp = artImp + cardImp; // info/article cards
  const totalCardImp = contentImp + adCardImp; // all non-banner card views

  // A session = one feed open = one entry, in every era. Day-filtered values
  // divide that day's counts by that day's entries.
  const selectedDay = selectedDate ? data.daily.find((d) => d.date === selectedDate) : null;
  const sessionCount = selectedDate ? (selectedDay?.entries ?? 0) : (data.totals.sessions ?? 0);
  const adViewsPerSession = selectedDate
    ? (selectedDay && selectedDay.entries > 0 ? selectedDay.ad_views / selectedDay.entries : 0)
    : (data.totals.avg_ad_views_per_session ?? 0);
  const adClicksPerSession = selectedDate
    ? (selectedDay && selectedDay.entries > 0 ? selectedDay.ad_clicks / selectedDay.entries : 0)
    : (data.totals.ad_clicks_per_session ?? 0);
  // Content vs ad vs total card views per session — derived from day-aware item
  // impressions so the three always add up (content + full-card ads = total).
  const perSession = (n: number) => (sessionCount > 0 ? n / sessionCount : 0);
  const infoCardViewsPerSession = perSession(contentImp);
  const fullCardAdViewsPerSession = perSession(adCardImp);
  const totalCardViewsPerSession = perSession(totalCardImp);

  const totalImpressions = data.items.reduce((s, m) => s + m.impressions, 0);
  const totalClicks = data.items.reduce((s, m) => s + m.clicks, 0);

  // Combined ad totals across both placements (full-card ads + under-article
  // banners) — powers the Ad placements total row and the cost metrics below.
  const adCard = data.ad_placements?.card ?? { impressions: 0, clicks: 0, ctr: 0 };
  const adBanner = data.ad_placements?.banner ?? { impressions: 0, clicks: 0, ctr: 0 };
  const totalAdImpressions = adCard.impressions + adBanner.impressions;
  const totalAdClicks = adCard.clicks + adBanner.clicks;
  const totalAdCtr = totalAdImpressions > 0 ? totalAdClicks / totalAdImpressions : 0;

  // Cost metrics driven by the manually-entered Meta campaign spend. Each is
  // "—" until a spend is entered (and the relevant denominator is non-zero).
  const spendNum = Math.max(0, parseFloat(spend) || 0);
  const sessionCost = sessionCount > 0 ? spendNum / sessionCount : 0;
  const adClickCost = totalAdClicks > 0 ? spendNum / totalAdClicks : 0;
  const adCpm = totalAdImpressions > 0 ? (spendNum / totalAdImpressions) * 1000 : 0;

  return (
    <>
      {(data.stale || loadError) && (
        <div
          style={{
            background: '#fef3c7',
            color: '#92400e',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {data.stale
            ? 'Showing cached numbers — the database is busy; data may be a few minutes old.'
            : `Refresh failed (${loadError}) — showing the last loaded numbers.`}
        </div>
      )}
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 13 }}>Date range</span>
        <select
          value={range}
          onChange={(e) => {
            setRange(e.target.value);
            // Picking a preset abandons any custom window; the two modes are
            // mutually exclusive on the wire.
            if (e.target.value !== 'custom') {
              setFromDate('');
              setToDate('');
            }
            // A previously-picked day may fall outside the new range.
            setSelectedDate('');
          }}
          style={{ fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          {RANGE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {/* Touching either date flips the select to "Custom…". For a single
            day, set From = To (or leave To empty to mean "from that day on"). */}
        <span className="muted" style={{ fontSize: 13 }}>From</span>
        <input
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => {
            setFromDate(e.target.value);
            setRange('custom');
            setSelectedDate('');
          }}
          style={{ fontSize: 13, padding: '2px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <span className="muted" style={{ fontSize: 13 }}>To</span>
        <input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => {
            setToDate(e.target.value);
            setRange('custom');
            setSelectedDate('');
          }}
          style={{ fontSize: 13, padding: '2px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        {fromDate && fromDate === toDate && (
          <span className="muted" style={{ fontSize: 12 }}>single day</span>
        )}
        {(range !== 'all' || fromDate || toDate) && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: '2px 8px' }}
            onClick={() => {
              setRange('all');
              setFromDate('');
              setToDate('');
              setSelectedDate('');
            }}
          >
            Clear
          </button>
        )}
        {/* Session-origin filter — page-level like the date range. */}
        <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>Origin</span>
        <div
          role="group"
          aria-label="Session origin"
          style={{
            display: 'inline-flex',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {ORIGIN_OPTIONS.map((o, i) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setOrigin(o.value);
                // A previously-picked day may have no data under the new
                // origin filter — same reset the date controls do.
                setSelectedDate('');
              }}
              style={{
                fontSize: 13,
                padding: '3px 10px',
                border: 'none',
                borderLeft: i > 0 ? '1px solid #d1d5db' : 'none',
                background: origin === o.value ? '#e5e7eb' : '#fff',
                fontWeight: origin === o.value ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>applies to every section below</span>
        {refetching && <span className="muted" style={{ fontSize: 12 }}>Updating…</span>}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: -10, marginBottom: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        This funnel = sessions that started here · Different feeds = arrived via the chooser card
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Sessions"
          value={sessionCount.toLocaleString()}
          sub={selectedDate || 'feed opens'}
        />
        <KpiCard
          label="Ad / session CTR"
          value={adClicksPerSession.toFixed(3)}
          sub={
            selectedDate
              ? `${(selectedDay?.ad_clicks ?? 0).toLocaleString()} ad clicks / ${sessionCount.toLocaleString()} sessions`
              : `${totalAdClicks.toLocaleString()} ad clicks / ${sessionCount.toLocaleString()} sessions`
          }
        />
        <KpiCard
          label="Info card views / session"
          value={infoCardViewsPerSession.toFixed(1)}
          sub="article cards"
        />
        <KpiCard
          label="Full-card ad views / session"
          value={fullCardAdViewsPerSession.toFixed(1)}
          sub="full-card ad slots"
        />
        <KpiCard
          label="Total card views / session"
          value={totalCardViewsPerSession.toFixed(1)}
          sub="ad cards + article cards"
        />
        <KpiCard
          label="Ad views / session"
          value={adViewsPerSession.toFixed(1)}
          sub="full-card ads + banners"
        />
        {!selectedDate && (
          <KpiCard
            label="Time in feed / session"
            value={formatMs(data.totals.avg_session_ms ?? 0)}
            sub="measured on new traffic"
          />
        )}
        <SpendCard value={spend} onChange={updateSpend} />
        <KpiCard
          label="Session cost"
          value={spendNum > 0 && sessionCount > 0 ? fmtMoney(sessionCost) : '—'}
          sub={`spend / ${sessionCount.toLocaleString()} sessions`}
        />
        <KpiCard
          label="Ad click cost"
          value={spendNum > 0 && totalAdClicks > 0 ? fmtMoney(adClickCost) : '—'}
          sub={`spend / ${totalAdClicks.toLocaleString()} ad clicks`}
        />
        <KpiCard
          label="Cost / 1k ad impressions"
          value={spendNum > 0 && totalAdImpressions > 0 ? fmtMoney(adCpm) : '—'}
          sub={`${totalAdImpressions.toLocaleString()} ad impressions`}
        />
      </div>

      {data.ad_placements &&
        (data.ad_placements.card.impressions > 0 || data.ad_placements.banner.impressions > 0) && (
        <>
          <h2 style={{ marginTop: 8, marginBottom: 8 }}>Ad placements</h2>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Placement</th>
                <th>Ad impressions</th>
                <th>Ad clicks</th>
                <th>CTR</th>
              </tr>
            </thead>
            <tbody>
              {([
                ['Full-card ads', data.ad_placements.card],
                ['Under-article banners', data.ad_placements.banner],
              ] as const).map(([label, p]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{p.impressions.toLocaleString()}</td>
                  <td>{p.clicks.toLocaleString()}</td>
                  <td>{(p.ctr * 100).toFixed(2)}%</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #e5e7eb' }}>
                <td>Total</td>
                <td>{totalAdImpressions.toLocaleString()}</td>
                <td>{totalAdClicks.toLocaleString()}</td>
                <td>{(totalAdCtr * 100).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className="row between" style={{ marginBottom: 8, marginTop: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>By source</h2>
          <select
            value={sourceGroup}
            onChange={(e) => setSourceGroup(e.target.value)}
            style={{ fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        {sourceData && sourceData.capi_errors_24h > 0 && (
          <span style={{ color: '#b91c1c', fontSize: 12 }}>
            ⚠ {sourceData.capi_errors_24h} CAPI error{sourceData.capi_errors_24h === 1 ? '' : 's'} in 24h
          </span>
        )}
      </div>
      {!sourceData || sourceData.rows.length === 0 ? (
        <div className="empty" style={{ marginBottom: 24, padding: 20, fontSize: 13 }}>
          No attributed sessions yet. Sessions appear here once visits arrive with tracking
          params (<code>sub</code>, <code>cmp</code>, UTMs…) — organic traffic shows as “(none)”.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>{GROUP_OPTIONS.find((g) => g.value === sourceGroup)?.label ?? 'Source'}</th>
                <th>Sessions</th>
                <th>Cards/sess</th>
                <th>Ad views/sess</th>
                <th>Ad clicks/sess</th>
                <th title="% of sessions with at least one ad click">Ad-click sess</th>
                <th title="Article clicks per session">Contin./sess</th>
                <th>≥2</th>
                <th>≥4</th>
                <th>≥6</th>
                <th>≥8</th>
                <th>≥10</th>
                <th>Avg time</th>
              </tr>
            </thead>
            <tbody>
              {sourceData.rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.key}</td>
                  <td>{r.sessions.toLocaleString()}</td>
                  <td>{r.avg_cards.toFixed(1)}</td>
                  <td>{r.avg_ad_views.toFixed(1)}</td>
                  <td>{r.ad_clicks_per_session.toFixed(3)}</td>
                  <td>{(r.ad_click_session_rate * 100).toFixed(1)}%</td>
                  <td>{r.continuation_rate.toFixed(2)}</td>
                  <td>{(r.depth.d2 * 100).toFixed(0)}%</td>
                  <td>{(r.depth.d4 * 100).toFixed(0)}%</td>
                  <td>{(r.depth.d6 * 100).toFixed(0)}%</td>
                  <td>{(r.depth.d8 * 100).toFixed(0)}%</td>
                  <td>{(r.depth.d10 * 100).toFixed(0)}%</td>
                  <td>{formatMs(r.avg_time_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sourceData && sourceData.capi_recent && sourceData.capi_recent.length > 0 && (
        <details style={{ marginBottom: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6b7280' }}>
            Meta CAPI activity — last {sourceData.capi_recent.length} events
          </summary>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {sourceData.capi_recent.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {new Date(r.ts).toLocaleString()}
                  </td>
                  <td>
                    {r.event_name}
                    {r.std_alias && (
                      <span className="muted" style={{ fontSize: 12 }}> ({r.std_alias})</span>
                    )}
                  </td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        background: r.status === 'ok' ? '#d1fae5' : r.status === 'error' ? '#fee2e2' : '#f3f4f6',
                        color: r.status === 'ok' ? '#065f46' : r.status === 'error' ? '#991b1b' : '#374151',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.status === 'skipped' ? r.skip_reason : r.status === 'error' ? `${r.http_status ?? ''} ${r.error ?? ''}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Per-item performance</h2>
          {allDates.length > 0 && (
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
            >
              <option value="">All time</option>
              {allDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
        </div>
        <div className="row">
          <button className="btn" onClick={() => { load(true); loadBySource(sourceGroup); }}>Refresh</button>
          <button
            className="btn btn-danger"
            onClick={() => { setClearError(null); setShowClearConfirm(true); }}
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
              <th>Ad clicks</th>
              <th>CTR</th>
              <th>Exits here</th>
              <th>Churn</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {data.items.map((m, idx) => {
              const { impressions, clicks, exits } = metricsForItem(m);
              // `clicks` is content clicks only (articles; 0 for AD/card
              // rows). `adClicks` is every ad click at this position: slot
              // clicks for AD rows, under-card banner clicks for content
              // rows. They get separate columns; CTR stays content-based.
              const adClicks = adClicksForItem(m);
              const ctr = impressions > 0 ? clicks / impressions : 0;
              const churn = churnFor(idx);
              const isOpen = expanded.has(m.position);
              return (
                <Fragment key={m.position}>
                  <tr onClick={() => toggleExpanded(m.position)} style={{ cursor: 'pointer' }}>
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
                    <td>{impressions.toLocaleString()}</td>
                    <td>{clicks.toLocaleString()}</td>
                    {/* Amber to match the AD pill — these are ad clicks. */}
                    <td style={{ color: adClicks > 0 ? '#92400e' : undefined }}>
                      {adClicks.toLocaleString()}
                    </td>
                    <td>{(ctr * 100).toFixed(2)}%</td>
                    <td>{exits.toLocaleString()}</td>
                    <td style={{ color: churn > 0 ? '#b91c1c' : undefined }}>
                      {churn.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center', color: '#6b7280', fontSize: 11 }}>
                      {isOpen ? '▲' : '▼'}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} style={{ padding: '0 0 8px 32px', background: '#f9fafb' }}>
                        {m.daily.length === 0 ? (
                          <div className="muted" style={{ padding: '8px 0', fontSize: 13 }}>No daily data yet.</div>
                        ) : (
                          <table style={{ marginTop: 8, marginBottom: 4 }}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Impressions</th>
                                <th>Clicks</th>
                                <th>CTR</th>
                                <th>Exits</th>
                                <th>Churn</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.daily.map((d) => {
                                const nextItem = idx + 1 < data.items.length ? data.items[idx + 1] : null;
                                const nextDayImp = nextItem
                                  ? (nextItem.daily.find((x) => x.date === d.date)?.impressions ?? 0)
                                  : 0;
                                // Per-day rows only carry content clicks —
                                // the backend doesn't send per-day ad clicks,
                                // so the drill-down stays content-only.
                                const dChurn = Math.max(0, d.impressions - d.clicks - d.exits - nextDayImp);
                                return (
                                  <tr
                                    key={d.date}
                                    style={selectedDate === d.date ? { background: '#eff6ff' } : undefined}
                                  >
                                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.date}</td>
                                    <td>{d.impressions.toLocaleString()}</td>
                                    <td>{d.clicks.toLocaleString()}</td>
                                    <td>
                                      {d.impressions > 0
                                        ? ((d.clicks / d.impressions) * 100).toFixed(2)
                                        : '0.00'}%
                                    </td>
                                    <td>{d.exits.toLocaleString()}</td>
                                    <td style={{ color: dChurn > 0 ? '#b91c1c' : undefined }}>
                                      {dChurn.toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// A KPI-styled card that takes the Meta campaign spend as free input. Styled to
// match KpiCard so it reads as one of the top boxes; the cost cards derive from
// whatever is typed here.
function SpendCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        Meta campaign spend
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 2, marginTop: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 700 }}>$</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          style={{
            fontSize: 24,
            fontWeight: 700,
            border: 'none',
            borderBottom: '1px solid #d1d5db',
            width: '100%',
            padding: 0,
            outline: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>enter total to see costs</div>
    </div>
  );
}
