import { NextRequest } from 'next/server';
import { feedExits, withMongoRetry } from '../../../../lib/mongo';
import { corsResponse, preflight, isSelfOrigin } from '../../../../lib/cors';
import { sanitizeAttribution } from '../../../../lib/attribution';
import { applySessionEvent } from '../../../../lib/feed-sessions';

export const dynamic = 'force-dynamic';

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
    const { feed_id, exit_position, items_viewed, time_in_feed_ms, session_id, page, timestamp } = body ?? {};
    if (typeof feed_id !== 'string' || typeof exit_position !== 'number') {
      return corsResponse(null, { status: 204 });
    }
    const attribution = sanitizeAttribution(body.attribution);
    const ts = timestamp ? new Date(timestamp) : new Date();
    const pageStr = typeof page === 'string' ? page : '';
    const sid = typeof session_id === 'string' ? session_id : '';
    const timeMs = typeof time_in_feed_ms === 'number' ? time_in_feed_ms : 0;

    const col = await feedExits();
    await withMongoRetry(() =>
      col.insertOne({
        feed_id,
        exit_position,
        items_viewed: typeof items_viewed === 'number' ? items_viewed : exit_position + 1,
        time_in_feed_ms: timeMs,
        session_id: sid,
        attribution,
        page: pageStr,
        timestamp: ts,
      }),
    );

    await applySessionEvent({
      session_id: sid,
      feed_id,
      attribution,
      page: pageStr,
      timestamp: ts,
      time_in_feed_ms: timeMs,
      exited: true,
    });
  } catch (err) {
    console.error('feed track-exit error', err);
  }
  return corsResponse(null, { status: 204 });
}
