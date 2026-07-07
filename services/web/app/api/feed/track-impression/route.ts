import { NextRequest } from 'next/server';
import { feedImpressions, withMongoRetry } from '../../../../lib/mongo';
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
    const { feed_id, position, kind, item_ref, placement, session_id, page, timestamp } = body ?? {};
    if (
      typeof feed_id !== 'string' ||
      typeof position !== 'number' ||
      (kind !== 'article' && kind !== 'ad')
    ) {
      return corsResponse(null, { status: 204 });
    }
    const attribution = sanitizeAttribution(body.attribution);
    const ts = timestamp ? new Date(timestamp) : new Date();
    const pageStr = typeof page === 'string' ? page : '';
    const sid = typeof session_id === 'string' ? session_id : '';
    const placementStr = placement === 'banner' ? 'banner' : 'card';

    const col = await feedImpressions();
    await withMongoRetry(() =>
      col.insertOne({
        feed_id,
        position,
        kind,
        item_ref: typeof item_ref === 'string' ? item_ref : '',
        placement: placementStr,
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
      card_view: placementStr === 'card',
      ad_view: kind === 'ad',
    });
  } catch (err) {
    console.error('feed track-impression error', err);
  }
  return corsResponse(null, { status: 204 });
}
