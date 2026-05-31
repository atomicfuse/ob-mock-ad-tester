import { NextRequest } from 'next/server';
import { feedClicks } from '../../../../lib/mongo';
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
    const { feed_id, position, kind, item_ref, landing_url, page, timestamp } = body ?? {};
    if (
      typeof feed_id !== 'string' ||
      typeof position !== 'number' ||
      (kind !== 'article' && kind !== 'ad')
    ) {
      return corsResponse(null, { status: 204 });
    }
    const col = await feedClicks();
    await col.insertOne({
      feed_id,
      position,
      kind,
      item_ref: typeof item_ref === 'string' ? item_ref : '',
      landing_url: typeof landing_url === 'string' ? landing_url : '',
      page: typeof page === 'string' ? page : '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });
  } catch (err) {
    console.error('feed track-click error', err);
  }
  return corsResponse(null, { status: 204 });
}
