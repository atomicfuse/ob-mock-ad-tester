import { NextRequest, NextResponse } from 'next/server';
import { feedSessions, capiLog, withMongoRetry } from '../../../../../../lib/mongo';
import { standardAliasForEventName } from '../../../../../../lib/conversions/meta';

export const dynamic = 'force-dynamic';

// Aggregates ONLY feed_sessions — the per-session rollup — so grouping by any
// attribution key is a single-collection query, no event scans.
const GROUP_KEYS: Record<string, string> = {
  sub: 'attribution.sub',
  cmp: 'attribution.cmp',
  ast: 'attribution.ast',
  ad: 'attribution.ad',
  plc: 'attribution.plc',
  utm_campaign: 'attribution.utm_campaign',
  utm_source: 'attribution.utm_source',
};

// Per-pod cache: fresh 30s, served stale (≤15 min) when the shared DB blips.
const CACHE_TTL_MS = 30_000;
const STALE_MAX_MS = 15 * 60_000;
const sourceCache = new Map<string, { at: number; body: any }>();

/** Cutoff for a `range` query param. `all` (or unset/invalid) → null (no date
 *  filter). `Nd` → now minus N days. Date.now() is fine here: normal request
 *  handler, not a deterministic workflow step. */
function rangeCutoff(range: string): Date | null {
  if (!range || range === 'all') return null;
  const m = /^(\d+)d$/.exec(range);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Date.now() - n * 86_400_000);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const groupParam = req.nextUrl.searchParams.get('group') ?? 'sub';
  const path = GROUP_KEYS[groupParam];
  if (!path) {
    return NextResponse.json({ error: `group must be one of ${Object.keys(GROUP_KEYS).join(', ')}` }, { status: 400 });
  }
  const range = req.nextUrl.searchParams.get('range') ?? 'all';

  // Cache key includes range so different windows never serve each other's body.
  const cacheKey = `${id}:${groupParam}:${range}`;
  const cached = sourceCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }
  try {
    const body = await computeBySource(id, groupParam, path, rangeCutoff(range));
    sourceCache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (err) {
    console.error('feed attribution analytics error', err);
    if (cached && Date.now() - cached.at < STALE_MAX_MS) {
      return NextResponse.json({ ...cached.body, stale: true });
    }
    return NextResponse.json({ error: 'database temporarily unavailable' }, { status: 503 });
  }
}

async function computeBySource(id: string, groupParam: string, path: string, cutoff: Date | null) {
  const depthCond = (t: number) => ({
    $sum: { $cond: [{ $gte: [{ $ifNull: ['$max_swipe_depth', 0] }, t] }, 1, 0] },
  });

  // feed_sessions store their start time in `started_at`; capi_log rows in `ts`.
  const sessionDateMatch: Record<string, unknown> = cutoff ? { started_at: { $gte: cutoff } } : {};
  const capiDateMatch: Record<string, unknown> = cutoff ? { ts: { $gte: cutoff } } : {};

  const [col, logCol] = await Promise.all([feedSessions(), capiLog()]);
  const [rowsRaw, capiErrors24h, capiRecent] = await withMongoRetry(() => Promise.all([
    col
      .aggregate<{
        _id: string;
        sessions: number;
        cards: number;
        ad_views: number;
        ad_clicks: number;
        article_clicks: number;
        ad_click_sessions: number;
        d2: number;
        d4: number;
        d6: number;
        d8: number;
        d10: number;
        time_ms: number;
      }>([
        { $match: { feed_id: id, ...sessionDateMatch } },
        {
          $group: {
            _id: { $ifNull: [`$${path}`, '(none)'] },
            sessions: { $sum: 1 },
            cards: { $sum: { $ifNull: ['$cards_viewed', 0] } },
            ad_views: { $sum: { $ifNull: ['$ad_views', 0] } },
            ad_clicks: { $sum: { $ifNull: ['$ad_clicks', 0] } },
            article_clicks: { $sum: { $ifNull: ['$article_clicks', 0] } },
            ad_click_sessions: {
              $sum: { $cond: [{ $gte: [{ $ifNull: ['$ad_clicks', 0] }, 1] }, 1, 0] },
            },
            d2: depthCond(2),
            d4: depthCond(4),
            d6: depthCond(6),
            d8: depthCond(8),
            d10: depthCond(10),
            time_ms: {
              $sum: {
                $ifNull: ['$time_in_feed_ms', { $subtract: ['$last_event_at', '$started_at'] }],
              },
            },
          },
        },
        { $sort: { sessions: -1 } },
        { $limit: 200 },
      ])
      .toArray(),
    // Error count over the selected range; falls back to the last 24h when no
    // range is selected (the field name keeps its historical `_24h` suffix for
    // the frontend contract, but it honours the active range window).
    logCol.countDocuments({
      feed_id: id,
      status: 'error',
      ts: { $gte: cutoff ?? new Date(Date.now() - 24 * 3600 * 1000) },
    }),
    // Recent CAPI activity for this feed — lets the operator confirm events are
    // reaching Meta (or see why they were skipped) without DB access.
    logCol.find({ feed_id: id, ...capiDateMatch }).sort({ ts: -1 }).limit(15).toArray(),
  ]));

  const rows = rowsRaw.map((r) => ({
    key: r._id,
    sessions: r.sessions,
    avg_cards: r.sessions > 0 ? r.cards / r.sessions : 0,
    avg_ad_views: r.sessions > 0 ? r.ad_views / r.sessions : 0,
    ad_clicks: r.ad_clicks,
    ad_clicks_per_session: r.sessions > 0 ? r.ad_clicks / r.sessions : 0,
    ad_click_session_rate: r.sessions > 0 ? r.ad_click_sessions / r.sessions : 0,
    continuation_rate: r.sessions > 0 ? r.article_clicks / r.sessions : 0,
    depth: {
      d2: r.sessions > 0 ? r.d2 / r.sessions : 0,
      d4: r.sessions > 0 ? r.d4 / r.sessions : 0,
      d6: r.sessions > 0 ? r.d6 / r.sessions : 0,
      d8: r.sessions > 0 ? r.d8 / r.sessions : 0,
      d10: r.sessions > 0 ? r.d10 / r.sessions : 0,
    },
    avg_time_ms: r.sessions > 0 ? r.time_ms / r.sessions : 0,
  }));

  return {
    feed_id: id,
    group: groupParam,
    rows,
    capi_errors_24h: capiErrors24h,
    capi_recent: capiRecent.map((r) => ({
      ts: r.ts,
      sink: r.sink,
      event_name: r.event_name,
      // Standard-event alias for this event name, or null if none — lets the UI
      // render "event_name (std_alias)", e.g. "ad_click (Subscribe)". Each action
      // logs one row under its internal name; unmapped events yield null.
      std_alias: standardAliasForEventName(r.event_name),
      status: r.status,
      skip_reason: r.skip_reason,
      http_status: r.http_status,
      error: r.error,
    })),
  };
}
