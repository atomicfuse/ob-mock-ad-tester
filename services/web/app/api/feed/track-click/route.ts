import { NextRequest } from 'next/server';
import { feedClicks, withMongoRetry } from '../../../../lib/mongo';
import { corsResponse, preflight, isSelfOrigin } from '../../../../lib/cors';
import { sanitizeAttribution } from '../../../../lib/attribution';
import { applySessionEvent } from '../../../../lib/feed-sessions';
import { dispatchConversions, clientFromRequest } from '../../../../lib/conversions';

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
    const { feed_id, position, kind, item_ref, landing_url, placement, session_id, page, timestamp } = body ?? {};
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

    const col = await feedClicks();
    await withMongoRetry(() =>
      col.insertOne({
        feed_id,
        position,
        kind,
        item_ref: typeof item_ref === 'string' ? item_ref : '',
        landing_url: typeof landing_url === 'string' ? landing_url : '',
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
      ad_click: kind === 'ad',
      article_click: kind === 'article',
    });

    if (sid) {
      const metaName = kind === 'ad' ? 'AdClick' : 'ArticleContinuation';
      await dispatchConversions({
        name: kind === 'ad' ? 'ad_click' : 'article_click',
        // Position in the id keeps distinct-card clicks distinct while deduping
        // accidental double-fires on the same card.
        eventId: `${sid}:${metaName}:${position}`,
        occurredAt: ts,
        sourceUrl: pageStr,
        feedId: feed_id,
        sessionId: sid,
        attribution,
        client: clientFromRequest(req),
        props: { position, placement: placementStr },
      });
    }
  } catch (err) {
    console.error('feed track-click error', err);
  }
  return corsResponse(null, { status: 204 });
}
