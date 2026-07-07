import { NextRequest } from 'next/server';
import {
  feedImpressions,
  feedClicks,
  feedExits,
  feedEvents,
  withMongoRetry,
} from '../../../../lib/mongo';
import { corsResponse, preflight, isSelfOrigin } from '../../../../lib/cors';
import { sanitizeAttribution } from '../../../../lib/attribution';
import { applySessionEvent } from '../../../../lib/feed-sessions';
import { dispatchConversions, clientFromRequest } from '../../../../lib/conversions';
import type { ConversionEvent } from '../../../../lib/conversions';
import type { FeedClick, FeedEvent, FeedExit, FeedImpression } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

// Batched ingest: the widget queues events client-side and flushes a handful
// of times per session instead of one HTTP request per event. One request →
// bulk inserts per collection + a single combined session-rollup upsert.
// The single-event endpoints stay for older cached widgets.

const MAX_EVENTS = 50;

export async function OPTIONS() {
  return preflight();
}

/** Swallow duplicate-key errors from unordered bulk inserts (duplicate
 *  beacons) — everything else rethrows. */
function isDuplicateOnly(err: any): boolean {
  if (err?.code === 11000) return true;
  const writeErrors = err?.writeErrors;
  return Array.isArray(writeErrors) && writeErrors.length > 0
    ? writeErrors.every((w: any) => (w?.code ?? w?.err?.code) === 11000)
    : false;
}

export async function POST(req: NextRequest) {
  if (isSelfOrigin(req)) return corsResponse(null, { status: 204 });
  try {
    const text = await req.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}
    const { feed_id, session_id, page, events } = body ?? {};
    if (
      typeof feed_id !== 'string' ||
      !feed_id ||
      typeof session_id !== 'string' ||
      !session_id ||
      !Array.isArray(events) ||
      events.length === 0
    ) {
      return corsResponse(null, { status: 204 });
    }

    const attribution = sanitizeAttribution(body.attribution);
    const pageStr = typeof page === 'string' ? page : '';
    const now = new Date();

    const impDocs: FeedImpression[] = [];
    const clickDocs: FeedClick[] = [];
    const exitDocs: FeedExit[] = [];
    const eventDocs: FeedEvent[] = [];
    const conversions: ConversionEvent[] = [];

    let minTs = now;
    let maxTs = new Date(0);
    let cardViews = 0;
    let adViews = 0;
    let adClicks = 0;
    let articleClicks = 0;
    let maxDepth: number | undefined;
    let maxTimeInFeed: number | undefined;
    let exited = false;

    const client = clientFromRequest(req);

    for (const raw of events.slice(0, MAX_EVENTS)) {
      if (!raw || typeof raw !== 'object') continue;
      const ts = raw.ts ? new Date(raw.ts) : now;
      if (isNaN(ts.getTime())) continue;
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;

      if (raw.t === 'imp') {
        if (typeof raw.position !== 'number' || (raw.kind !== 'article' && raw.kind !== 'ad')) continue;
        const placement = raw.placement === 'banner' ? 'banner' : 'card';
        impDocs.push({
          feed_id,
          position: raw.position,
          kind: raw.kind,
          item_ref: typeof raw.item_ref === 'string' ? raw.item_ref : '',
          placement,
          session_id,
          attribution,
          page: pageStr,
          timestamp: ts,
        });
        if (placement === 'card') cardViews++;
        if (raw.kind === 'ad') adViews++;
      } else if (raw.t === 'click') {
        if (typeof raw.position !== 'number' || (raw.kind !== 'article' && raw.kind !== 'ad')) continue;
        const placement = raw.placement === 'banner' ? 'banner' : 'card';
        clickDocs.push({
          feed_id,
          position: raw.position,
          kind: raw.kind,
          item_ref: typeof raw.item_ref === 'string' ? raw.item_ref : '',
          landing_url: typeof raw.landing_url === 'string' ? raw.landing_url : '',
          placement,
          session_id,
          attribution,
          page: pageStr,
          timestamp: ts,
        });
        if (raw.kind === 'ad') adClicks++;
        else articleClicks++;
        const metaName = raw.kind === 'ad' ? 'AdClick' : 'ArticleContinuation';
        conversions.push({
          name: raw.kind === 'ad' ? 'ad_click' : 'article_click',
          eventId: `${session_id}:${metaName}:${raw.position}`,
          occurredAt: ts,
          sourceUrl: pageStr,
          feedId: feed_id,
          sessionId: session_id,
          attribution,
          client,
          props: { position: raw.position, placement },
        });
      } else if (raw.t === 'exit') {
        if (typeof raw.exit_position !== 'number') continue;
        const timeMs = typeof raw.time_in_feed_ms === 'number' ? raw.time_in_feed_ms : 0;
        exitDocs.push({
          feed_id,
          exit_position: raw.exit_position,
          items_viewed:
            typeof raw.items_viewed === 'number' ? raw.items_viewed : raw.exit_position + 1,
          time_in_feed_ms: timeMs,
          session_id,
          attribution,
          page: pageStr,
          timestamp: ts,
        });
        exited = true;
        if (maxTimeInFeed === undefined || timeMs > maxTimeInFeed) maxTimeInFeed = timeMs;
      } else if (raw.t === 'event') {
        if (raw.event !== 'session_start' && raw.event !== 'swipe_depth') continue;
        const depth =
          raw.event === 'swipe_depth' && Number.isInteger(raw.depth) && raw.depth > 0 && raw.depth <= 1000
            ? (raw.depth as number)
            : undefined;
        if (raw.event === 'swipe_depth' && depth === undefined) continue;
        eventDocs.push({
          event: raw.event,
          feed_id,
          session_id,
          ...(depth !== undefined ? { depth } : {}),
          attribution,
          page: pageStr,
          timestamp: ts,
        });
        if (depth !== undefined && (maxDepth === undefined || depth > maxDepth)) maxDepth = depth;
        conversions.push({
          name: raw.event,
          eventId:
            raw.event === 'session_start'
              ? `${session_id}:FeedSession`
              : `${session_id}:SwipeDepth${depth}`,
          occurredAt: ts,
          sourceUrl: pageStr,
          feedId: feed_id,
          sessionId: session_id,
          attribution,
          client,
          ...(depth !== undefined ? { props: { depth } } : {}),
        });
      }
    }

    if (!impDocs.length && !clickDocs.length && !exitDocs.length && !eventDocs.length) {
      return corsResponse(null, { status: 204 });
    }

    const [impCol, clickCol, exitCol, eventCol] = await Promise.all([
      feedImpressions(),
      feedClicks(),
      feedExits(),
      feedEvents(),
    ]);

    await Promise.all([
      impDocs.length
        ? withMongoRetry(() => impCol.insertMany(impDocs, { ordered: false }))
        : Promise.resolve(),
      clickDocs.length
        ? withMongoRetry(() => clickCol.insertMany(clickDocs, { ordered: false }))
        : Promise.resolve(),
      exitDocs.length
        ? withMongoRetry(() => exitCol.insertMany(exitDocs, { ordered: false }))
        : Promise.resolve(),
      eventDocs.length
        ? withMongoRetry(() => eventCol.insertMany(eventDocs, { ordered: false })).catch((err) => {
            if (!isDuplicateOnly(err)) throw err; // duplicate beacons are expected
          })
        : Promise.resolve(),
    ]);

    await applySessionEvent({
      session_id,
      feed_id,
      attribution,
      page: pageStr,
      timestamp: minTs,
      timestamp_end: maxTs > minTs ? maxTs : minTs,
      card_view: cardViews,
      ad_view: adViews,
      ad_click: adClicks,
      article_click: articleClicks,
      ...(maxDepth !== undefined ? { swipe_depth: maxDepth } : {}),
      ...(maxTimeInFeed !== undefined ? { time_in_feed_ms: maxTimeInFeed } : {}),
      ...(exited ? { exited: true } : {}),
    });

    await Promise.all(conversions.map((c) => dispatchConversions(c)));
  } catch (err) {
    console.error('feed track-batch error', err);
  }
  return corsResponse(null, { status: 204 });
}
