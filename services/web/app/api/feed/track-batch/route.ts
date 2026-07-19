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
    // Chained-segment batches (feed B reached via feed A's chooser) carry the
    // feed the user arrived from plus the originating session. Anything that
    // doesn't look like a feed id / session id is silently dropped.
    const arrivedFrom =
      typeof body.arrived_from_feed === 'string' && /^[a-z0-9_-]{1,64}$/i.test(body.arrived_from_feed)
        ? (body.arrived_from_feed as string)
        : undefined;
    const originSessionId =
      typeof body.origin_session_id === 'string' &&
      body.origin_session_id.length > 0 &&
      body.origin_session_id.length <= 64
        ? (body.origin_session_id as string)
        : undefined;
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
        if (
          typeof raw.position !== 'number' ||
          (raw.kind !== 'article' && raw.kind !== 'ad' && raw.kind !== 'card' && raw.kind !== 'fact')
        )
          continue;
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
          ...(arrivedFrom ? { arrived_from_feed: arrivedFrom } : {}),
        });
        if (placement === 'card') cardViews++;
        if (raw.kind === 'ad') adViews++;
      } else if (raw.t === 'click') {
        if (
          typeof raw.position !== 'number' ||
          (raw.kind !== 'article' && raw.kind !== 'ad' && raw.kind !== 'card')
        )
          continue;
        if (raw.kind === 'card' || raw.kind === 'fact') {
          // Cards and facts aren't clickable in the widget — drop the event
          // entirely: no raw insert into feed_clicks, no rollup increment, no
          // conversion fire.
          continue;
        }
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
          ...(arrivedFrom ? { arrived_from_feed: arrivedFrom } : {}),
        });
        if (raw.kind === 'ad') {
          adClicks++;
          conversions.push({
            name: 'ad_click',
            eventId: `${session_id}:AdClick:${raw.position}`,
            occurredAt: ts,
            sourceUrl: pageStr,
            feedId: feed_id,
            sessionId: session_id,
            attribution,
            client,
            props: { position: raw.position, placement },
          });
        } else {
          // raw.kind === 'article'
          articleClicks++;
          conversions.push({
            name: 'article_click',
            eventId: `${session_id}:ArticleContinuation:${raw.position}`,
            occurredAt: ts,
            sourceUrl: pageStr,
            feedId: feed_id,
            sessionId: session_id,
            attribution,
            client,
            props: { position: raw.position, placement },
          });
        }
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
          ...(arrivedFrom ? { arrived_from_feed: arrivedFrom } : {}),
        });
        exited = true;
        if (maxTimeInFeed === undefined || timeMs > maxTimeInFeed) maxTimeInFeed = timeMs;
      } else if (raw.t === 'event') {
        if (
          raw.event !== 'session_start' &&
          raw.event !== 'swipe_depth' &&
          raw.event !== 'chooser_view' &&
          raw.event !== 'feed_continue' &&
          raw.event !== 'swipe_knew' &&
          raw.event !== 'swipe_blow' &&
          raw.event !== 'deck_complete'
        )
          continue;
        // swipe_knew/swipe_blow carry depth = position + 1 so the unique
        // {session_id, event, depth} index dedupes per position rather than
        // swallowing every swipe after the first. deck_complete carries none
        // (the dedupe to once-per-session is desired).
        const wantsDepth =
          raw.event === 'swipe_depth' || raw.event === 'swipe_knew' || raw.event === 'swipe_blow';
        const depth =
          wantsDepth && Number.isInteger(raw.depth) && raw.depth > 0 && raw.depth <= 1000
            ? (raw.depth as number)
            : undefined;
        if (wantsDepth && depth === undefined) continue;
        const chosenFeedId =
          raw.event === 'feed_continue' &&
          typeof raw.chosen_feed_id === 'string' &&
          /^[a-z0-9_-]{1,64}$/i.test(raw.chosen_feed_id)
            ? (raw.chosen_feed_id as string)
            : undefined;
        eventDocs.push({
          event: raw.event,
          feed_id,
          session_id,
          ...(depth !== undefined ? { depth } : {}),
          ...(chosenFeedId !== undefined ? { chosen_feed_id: chosenFeedId } : {}),
          attribution,
          page: pageStr,
          timestamp: ts,
          ...(arrivedFrom ? { arrived_from_feed: arrivedFrom } : {}),
        });
        if (depth !== undefined && (maxDepth === undefined || depth > maxDepth)) maxDepth = depth;
        // chooser_view / feed_continue are analytics-only — no conversion fires
        // (the CAPI dictionary stays untouched).
        if (raw.event === 'session_start' || raw.event === 'swipe_depth') {
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
      ...(arrivedFrom ? { arrived_from_feed: arrivedFrom } : {}),
      ...(originSessionId ? { origin_session_id: originSessionId } : {}),
    });

    await Promise.all(conversions.map((c) => dispatchConversions(c)));
  } catch (err) {
    console.error('feed track-batch error', err);
  }
  return corsResponse(null, { status: 204 });
}
