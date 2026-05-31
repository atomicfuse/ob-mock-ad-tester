import { NextRequest } from 'next/server';
import { feedExits } from '../../../../lib/mongo';
import { corsResponse, preflight, isSelfOrigin } from '../../../../lib/cors';

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
    const { feed_id, exit_position, items_viewed, time_in_feed_ms, page, timestamp } = body ?? {};
    if (typeof feed_id !== 'string' || typeof exit_position !== 'number') {
      return corsResponse(null, { status: 204 });
    }
    const col = await feedExits();
    await col.insertOne({
      feed_id,
      exit_position,
      items_viewed: typeof items_viewed === 'number' ? items_viewed : exit_position + 1,
      time_in_feed_ms: typeof time_in_feed_ms === 'number' ? time_in_feed_ms : 0,
      page: typeof page === 'string' ? page : '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });
  } catch (err) {
    console.error('feed track-exit error', err);
  }
  return corsResponse(null, { status: 204 });
}
