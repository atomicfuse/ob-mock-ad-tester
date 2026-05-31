import { NextRequest } from 'next/server';
import { clicks } from '../../../lib/mongo';
import { corsResponse, preflight, isSelfOrigin } from '../../../lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: NextRequest) {
  if (isSelfOrigin(req)) {
    return corsResponse(null, { status: 204 });
  }
  try {
    let body: any = null;
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else {
      const text = await req.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    const { ad_id, campaign, landing_page, page, timestamp } = body ?? {};
    if (typeof ad_id !== 'string' || typeof campaign !== 'string') {
      return corsResponse(null, { status: 204 });
    }
    const col = await clicks();
    await col.insertOne({
      ad_id,
      campaign,
      landing_page: typeof landing_page === 'string' ? landing_page : '',
      page: typeof page === 'string' ? page : '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });
  } catch (err) {
    console.error('track-click error', err);
  }
  return corsResponse(null, { status: 204 });
}
