import { NextRequest } from 'next/server';
import { feedEvents, withMongoRetry } from '../../../../lib/mongo';
import { corsResponse, preflight, isSelfOrigin } from '../../../../lib/cors';
import { sanitizeAttribution } from '../../../../lib/attribution';
import { applySessionEvent } from '../../../../lib/feed-sessions';
import { dispatchConversions, clientFromRequest } from '../../../../lib/conversions';
import type { FeedEventName } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

const EVENT_NAMES: FeedEventName[] = ['session_start', 'swipe_depth'];

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: NextRequest) {
  if (isSelfOrigin(req)) return corsResponse(null, { status: 204 });
  try {
    const text = await req.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}
    const { feed_id, session_id, event, depth, page, timestamp } = body ?? {};
    if (
      typeof feed_id !== 'string' ||
      typeof session_id !== 'string' ||
      !session_id ||
      !EVENT_NAMES.includes(event)
    ) {
      return corsResponse(null, { status: 204 });
    }
    const depthNum =
      event === 'swipe_depth' && Number.isInteger(depth) && depth > 0 && depth <= 1000
        ? (depth as number)
        : undefined;
    if (event === 'swipe_depth' && depthNum === undefined) {
      return corsResponse(null, { status: 204 });
    }

    const attribution = sanitizeAttribution(body.attribution);
    const ts = timestamp ? new Date(timestamp) : new Date();
    const pageStr = typeof page === 'string' ? page : '';

    const col = await feedEvents();
    try {
      await withMongoRetry(() =>
        col.insertOne({
          event,
          feed_id,
          session_id,
          ...(depthNum !== undefined ? { depth: depthNum } : {}),
          attribution,
          page: pageStr,
          timestamp: ts,
        }),
      );
    } catch (err: any) {
      // Duplicate beacon (bfcache restore / retry) — unique index absorbs it.
      if (err?.code !== 11000) throw err;
      return corsResponse(null, { status: 204 });
    }

    await applySessionEvent({
      session_id,
      feed_id,
      attribution,
      page: pageStr,
      timestamp: ts,
      ...(depthNum !== undefined ? { swipe_depth: depthNum } : {}),
    });

    await dispatchConversions({
      name: event,
      eventId:
        event === 'session_start'
          ? `${session_id}:FeedSession`
          : `${session_id}:SwipeDepth${depthNum}`,
      occurredAt: ts,
      sourceUrl: pageStr,
      feedId: feed_id,
      sessionId: session_id,
      attribution,
      client: clientFromRequest(req),
      ...(depthNum !== undefined ? { props: { depth: depthNum } } : {}),
    });
  } catch (err) {
    console.error('feed track-event error', err);
  }
  return corsResponse(null, { status: 204 });
}
