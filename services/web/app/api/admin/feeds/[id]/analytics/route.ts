import { NextRequest, NextResponse } from 'next/server';
import {
  feeds,
  feedItems,
  feedImpressions,
  feedClicks,
  feedExits,
  withMongoRetry,
} from '../../../../../../lib/mongo';
import type { FeedAnalytics, FeedDailyStats, FeedItemDailyStats, FeedItemMetrics } from '../../../../../../lib/types';

export const dynamic = 'force-dynamic';

// Per-pod response cache: fresh for 60s, and — critically — served STALE (up
// to 15 min) when the shared database blips, instead of 500ing the page.
// Admin analytics tolerate slightly old numbers far better than "No data".
const CACHE_TTL_MS = 60_000;
const STALE_MAX_MS = 15 * 60_000;
const analyticsCache = new Map<string, { at: number; body: FeedAnalytics }>();

/** Cutoff for a `range` query param. `all` (or unset/invalid) → null (no date
 *  filter). `Nd` → now minus N days. Date.now() is fine here: this is a normal
 *  request handler, not a deterministic workflow step. */
function rangeCutoff(range: string): Date | null {
  if (!range || range === 'all') return null;
  const m = /^(\d+)d$/.exec(range);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Date.now() - n * 86_400_000);
}

/** Inclusive date window applied to every aggregate. Either bound optional. */
interface DateBounds {
  gte?: Date;
  lte?: Date;
}

/** Parse a `YYYY-MM-DD` calendar date (UTC). `endOfDay` selects 23:59:59.999Z
 *  vs 00:00:00.000Z. Malformed or impossible dates (e.g. 2026-02-30) → null. */
function parseDayUTC(s: string | null, endOfDay: boolean): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  // NaN check catches unparseable strings; the round-trip check catches
  // calendar-invalid dates that some engines silently roll over.
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

/** Resolve the effective date window. Explicit `from`/`to` (YYYY-MM-DD,
 *  inclusive, UTC) override `range` when at least one is valid; each invalid
 *  param is ignored individually. With neither present/valid, falls back to
 *  the `range` cutoff ({} = no date filter). from=to=same day → that full day. */
function resolveBounds(range: string, from: string | null, to: string | null): DateBounds {
  const gte = parseDayUTC(from, false);
  const lte = parseDayUTC(to, true);
  if (gte || lte) {
    const b: DateBounds = {};
    if (gte) b.gte = gte;
    if (lte) b.lte = lte;
    return b;
  }
  const cutoff = rangeCutoff(range);
  return cutoff ? { gte: cutoff } : {};
}

/** `{ field: { $gte?, $lte? } }` for spreading into $match, or {} if unbounded. */
function boundsMatch(field: string, b: DateBounds): Record<string, unknown> {
  const cond: Record<string, Date> = {};
  if (b.gte) cond.$gte = b.gte;
  if (b.lte) cond.$lte = b.lte;
  return Object.keys(cond).length > 0 ? { [field]: cond } : {};
}

/** Origin filter for the feed-chaining partition. Event docs are stamped with
 *  `arrived_from_feed` at ingest ONLY when the session was minted by crossing
 *  from another feed, so `$exists` splits the data exactly: docs without the
 *  field (including everything that predates chaining) are direct traffic.
 *  Invariant: for any window, direct + chained = all for every count metric. */
type Origin = 'all' | 'direct' | 'chained';

function parseOrigin(s: string | null): Origin {
  return s === 'direct' || s === 'chained' ? s : 'all';
}

function originFilter(origin: Origin): Record<string, unknown> {
  if (origin === 'direct') return { arrived_from_feed: { $exists: false } };
  if (origin === 'chained') return { arrived_from_feed: { $exists: true } };
  return {};
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const range = req.nextUrl.searchParams.get('range') ?? 'all';
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const origin = parseOrigin(req.nextUrl.searchParams.get('origin'));
  // Cache key includes range AND explicit from/to AND origin so different
  // windows/slices never serve each other's cached body.
  const cacheKey = `${id}:${range}:${from ?? ''}:${to ?? ''}:${origin}`;
  const cached = analyticsCache.get(cacheKey);
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }
  try {
    const body = await computeAnalytics(id, resolveBounds(range, from, to), origin);
    if (!body) return NextResponse.json({ error: 'not found' }, { status: 404 });
    analyticsCache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (err) {
    console.error('feed analytics error', err);
    if (cached && Date.now() - cached.at < STALE_MAX_MS) {
      return NextResponse.json({ ...cached.body, stale: true });
    }
    return NextResponse.json({ error: 'database temporarily unavailable' }, { status: 503 });
  }
}

async function computeAnalytics(
  id: string,
  bounds: DateBounds,
  origin: Origin,
): Promise<FeedAnalytics | null> {
  const [feedsCol, itemsCol, impCol, clickCol, exitCol] = await Promise.all([
    feeds(),
    feedItems(),
    feedImpressions(),
    feedClicks(),
    feedExits(),
  ]);

  const feed = await withMongoRetry(() => feedsCol.findOne({ feed_id: id }));
  if (!feed) return null;

  // Server-side date filter applied to EVERY aggregate below. All three event
  // collections (impressions/clicks/exits) store their event time in
  // `timestamp`. When no window is selected this is empty (no date filter).
  const dateMatch: Record<string, unknown> = boundsMatch('timestamp', bounds);
  // Origin filter applied to the SAME queries as dateMatch — missing even one
  // spot would break the direct+chained=all partition. `all` → {} (no filter).
  const originMatch: Record<string, unknown> = originFilter(origin);

  const items = await withMongoRetry(() =>
    itemsCol.find({ feed_id: id }).sort({ position: 1 }).toArray(),
  );

  // Queries run in small sequential groups (≤4 concurrent) instead of one
  // 19-wide parallel blast: fewer simultaneous connections on the shared
  // cluster, and a transient failure retries only its own small group.
  const [impCounts, clickCounts, adClicksByPos, exitsByPos, exits] = await withMongoRetry(() => Promise.all([
    impCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id, placement: { $ne: 'banner' }, ...dateMatch, ...originMatch } },
        { $group: { _id: '$position', count: { $sum: 1 } } },
      ])
      .toArray(),
    // CONTENT clicks per position (kind 'article' — cards aren't clickable).
    // Ad clicks of every placement are tallied separately below so they never
    // inflate the content rows or CTR. Legacy docs without `kind` count as
    // content ($ne matches missing fields).
    clickCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id, kind: { $ne: 'ad' }, ...dateMatch, ...originMatch } },
        { $group: { _id: '$position', count: { $sum: 1 } } },
      ])
      .toArray(),
    // ALL ad clicks per position: full-card ad slots (placement 'card') PLUS
    // under-card real-ad banners (placement 'banner' — a banner click carries
    // the CARD's position, so it attributes to the row above it). Surfaces in
    // the per-item table as `adClicks`, separate from content `clicks`.
    clickCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id, kind: 'ad', ...dateMatch, ...originMatch } },
        { $group: { _id: '$position', count: { $sum: 1 } } },
      ])
      .toArray(),
    exitCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id, ...dateMatch, ...originMatch } },
        { $group: { _id: '$exit_position', count: { $sum: 1 } } },
      ])
      .toArray(),
    exitCol.find({ feed_id: id, ...dateMatch, ...originMatch }).toArray(),
  ]));

  const [dailyImps, dailyClicks, dailyExitsAgg] = await withMongoRetry(() => Promise.all([
    impCol
      .aggregate<{ _id: string; impressions: number; entries: number }>([
        { $match: { feed_id: id, placement: { $ne: 'banner' }, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            impressions: { $sum: 1 },
            entries: { $sum: { $cond: [{ $eq: ['$position', 0] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    clickCol
      .aggregate<{ _id: string; clicks: number }>([
        { $match: { feed_id: id, placement: { $ne: 'banner' }, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            clicks: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    exitCol
      .aggregate<{ _id: string; exits: number }>([
        { $match: { feed_id: id, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            exits: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]));

  const [impsByPosDayArr, clicksByPosDayArr, exitsByPosDayArr] = await withMongoRetry(() =>
    Promise.all([
    impCol
      .aggregate<{ _id: { position: number; date: string }; count: number }>([
        { $match: { feed_id: id, placement: { $ne: 'banner' }, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: {
              position: '$position',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    // Per-position daily CONTENT clicks — same kind split as `clickCounts`
    // above so the drill-down rows match the per-item `clicks` totals.
    clickCol
      .aggregate<{ _id: { position: number; date: string }; count: number }>([
        { $match: { feed_id: id, kind: { $ne: 'ad' }, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: {
              position: '$position',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    exitCol
      .aggregate<{ _id: { position: number; date: string }; count: number }>([
        { $match: { feed_id: id, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: {
              position: '$exit_position',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]));

  const [bannerClicks, adImpressions, sessionAgg, adClicksAll] = await withMongoRetry(() =>
    Promise.all([
    // Clicks on real-ad slots rendered under articles — counted separately so
    // they never inflate the article rows.
    clickCol.countDocuments({ feed_id: id, placement: 'banner', ...dateMatch, ...originMatch }),
    // All ad impressions across the feed — full-card ads AND under-article
    // banners — for the average-per-visitor metric.
    impCol.countDocuments({ feed_id: id, kind: 'ad', ...dateMatch, ...originMatch }),
    // Per-session rollup from session_id-tagged impressions: view counts and
    // first/last event timestamps (session duration).
    impCol
      .aggregate<{ _id: string; first: Date; last: Date; cardViews: number; adViews: number }>([
        { $match: { feed_id: id, session_id: { $exists: true, $ne: '' }, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: '$session_id',
            first: { $min: '$timestamp' },
            last: { $max: '$timestamp' },
            cardViews: { $sum: { $cond: [{ $ne: ['$placement', 'banner'] }, 1, 0] } },
            adViews: { $sum: { $cond: [{ $eq: ['$kind', 'ad'] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    // All ad clicks — full-card ads AND under-article banners.
    clickCol.countDocuments({ feed_id: id, kind: 'ad', ...dateMatch, ...originMatch }),
  ]));

  const [sessionsByDayArr, adViewsByDayArr, adClicksByDayArr] = await withMongoRetry(() =>
    Promise.all([
    // Distinct sessions per day.
    impCol
      .aggregate<{ _id: string; sessions: number }>([
        { $match: { feed_id: id, session_id: { $exists: true, $ne: '' }, ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              s: '$session_id',
            },
          },
        },
        { $group: { _id: '$_id.date', sessions: { $sum: 1 } } },
      ])
      .toArray(),
    // Ad views per day (cards + banners).
    impCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { feed_id: id, kind: 'ad', ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    // Ad clicks per day (cards + banners).
    clickCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { feed_id: id, kind: 'ad', ...dateMatch, ...originMatch } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]));

  const [adImpsByPlacement, adClicksByPlacement] = await withMongoRetry(() =>
    Promise.all([
    // Internal placement comparison: full-card ad slots vs under-article
    // banners. Pre-placement events default to 'card'.
    impCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { feed_id: id, kind: 'ad', ...dateMatch, ...originMatch } },
        { $group: { _id: { $ifNull: ['$placement', 'card'] }, count: { $sum: 1 } } },
      ])
      .toArray(),
    clickCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { feed_id: id, kind: 'ad', ...dateMatch, ...originMatch } },
        { $group: { _id: { $ifNull: ['$placement', 'card'] }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ]));

  const impMap = new Map(impCounts.map((d) => [d._id, d.count]));
  const clickMap = new Map(clickCounts.map((d) => [d._id, d.count]));
  const adClickMap = new Map(adClicksByPos.map((d) => [d._id, d.count]));
  const exitsAtPos = new Map(exitsByPos.map((d) => [d._id, d.count]));

  // Build pos -> date -> count maps for per-item daily breakdown
  const impsByPosDay = new Map<number, Map<string, number>>();
  for (const doc of impsByPosDayArr) {
    const { position, date } = doc._id;
    if (!impsByPosDay.has(position)) impsByPosDay.set(position, new Map());
    impsByPosDay.get(position)!.set(date, doc.count);
  }
  const clicksByPosDay = new Map<number, Map<string, number>>();
  for (const doc of clicksByPosDayArr) {
    const { position, date } = doc._id;
    if (!clicksByPosDay.has(position)) clicksByPosDay.set(position, new Map());
    clicksByPosDay.get(position)!.set(date, doc.count);
  }
  const exitsByPosDay = new Map<number, Map<string, number>>();
  for (const doc of exitsByPosDayArr) {
    const { position, date } = doc._id;
    if (!exitsByPosDay.has(position)) exitsByPosDay.set(position, new Map());
    exitsByPosDay.get(position)!.set(date, doc.count);
  }

  const itemMetrics: FeedItemMetrics[] = items.map((it, idx) => {
    const i = impMap.get(idx) ?? 0;
    const c = clickMap.get(idx) ?? 0;
    let label = '';
    if (it.kind === 'article') {
      label = it.override?.title || it.fetched?.title || it.url || '(article)';
    } else if (it.kind === 'card') {
      label = it.card?.heading ?? '(card)';
    } else if (it.kind === 'ad') {
      label = `Ad ${idx}`;
    }
    const itemDates = new Set([
      ...(impsByPosDay.get(idx)?.keys() ?? []),
      ...(clicksByPosDay.get(idx)?.keys() ?? []),
      ...(exitsByPosDay.get(idx)?.keys() ?? []),
    ]);
    const daily: FeedItemDailyStats[] = [...itemDates]
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        date,
        impressions: impsByPosDay.get(idx)?.get(date) ?? 0,
        clicks: clicksByPosDay.get(idx)?.get(date) ?? 0,
        exits: exitsByPosDay.get(idx)?.get(date) ?? 0,
      }));
    return {
      position: idx,
      kind: it.kind,
      label,
      impressions: i,
      // Content clicks only (CTR denominator/numerator excludes ads entirely).
      clicks: c,
      // ALL ad clicks at this position: full-card ad slots + under-card banners.
      adClicks: adClickMap.get(idx) ?? 0,
      ctr: i > 0 ? c / i : 0,
      exits: exitsAtPos.get(idx) ?? 0,
      daily,
    };
  });

  const clicksByDate = new Map(dailyClicks.map((d) => [d._id, d.clicks]));
  const exitsByDate = new Map(dailyExitsAgg.map((d) => [d._id, d.exits]));
  const sessionsByDate = new Map(sessionsByDayArr.map((d) => [d._id, d.sessions]));
  const adViewsByDate = new Map(adViewsByDayArr.map((d) => [d._id, d.count]));
  const adClicksByDate = new Map(adClicksByDayArr.map((d) => [d._id, d.count]));
  const allDates = new Set([
    ...dailyImps.map((d) => d._id),
    ...dailyClicks.map((d) => d._id),
    ...dailyExitsAgg.map((d) => d._id),
    ...adViewsByDayArr.map((d) => d._id),
  ]);
  const daily: FeedDailyStats[] = [...allDates]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const imp = dailyImps.find((d) => d._id === date);
      return {
        date,
        entries: imp?.entries ?? 0,
        impressions: imp?.impressions ?? 0,
        clicks: clicksByDate.get(date) ?? 0,
        exits: exitsByDate.get(date) ?? 0,
        sessions: sessionsByDate.get(date) ?? 0,
        ad_views: adViewsByDate.get(date) ?? 0,
        ad_clicks: adClicksByDate.get(date) ?? 0,
      };
    });

  const entries = impMap.get(0) ?? 0;
  const totalExits = exits.length;
  const avgCardsViewed =
    exits.length > 0
      ? exits.reduce((sum, e) => sum + (e.items_viewed ?? 0), 0) / exits.length
      : 0;
  const avgTimeInFeedMs =
    exits.length > 0
      ? exits.reduce((sum, e) => sum + (e.time_in_feed_ms ?? 0), 0) / exits.length
      : 0;

  // A "session" = one feed open. Every open fires exactly one position-0
  // impression, so `entries` counts sessions across ALL eras — session_id only
  // exists on newer events, so it can't be the denominator. Tagged events are
  // still used for what only they can provide: per-session duration.
  let totalCardImpressions = 0;
  for (const d of impCounts) totalCardImpressions += d.count;
  let totalSessionMs = 0;
  for (const s of sessionAgg) {
    totalSessionMs += Math.max(0, new Date(s.last).getTime() - new Date(s.first).getTime());
  }

  const placementStats = (placement: 'card' | 'banner') => {
    const imp = adImpsByPlacement.find((d) => d._id === placement)?.count ?? 0;
    const clk = adClicksByPlacement.find((d) => d._id === placement)?.count ?? 0;
    return { impressions: imp, clicks: clk, ctr: imp > 0 ? clk / imp : 0 };
  };

  const body: FeedAnalytics = {
    feed_id: id,
    items: itemMetrics,
    daily,
    ad_placements: {
      card: placementStats('card'),
      banner: placementStats('banner'),
    },
    totals: {
      entries,
      exits: totalExits,
      avg_cards_viewed: avgCardsViewed,
      avg_time_in_feed_ms: avgTimeInFeedMs,
      banner_clicks: bannerClicks,
      avg_ad_impressions_per_visitor: entries > 0 ? adImpressions / entries : 0,
      sessions: entries,
      avg_card_views_per_session: entries > 0 ? totalCardImpressions / entries : 0,
      avg_ad_views_per_session: entries > 0 ? adImpressions / entries : 0,
      ad_clicks_per_session: entries > 0 ? adClicksAll / entries : 0,
      avg_session_ms: sessionAgg.length > 0 ? totalSessionMs / sessionAgg.length : 0,
    },
  };
  return body;
}
