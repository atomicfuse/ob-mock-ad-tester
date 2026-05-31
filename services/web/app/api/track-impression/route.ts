import { NextRequest } from 'next/server';
import { impressions } from '../../../lib/mongo';
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
    const text = await req.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const { ad_id, campaign, page, timestamp } = body ?? {};
    if (typeof ad_id !== 'string' || typeof campaign !== 'string') {
      return corsResponse(null, { status: 204 });
    }
    const col = await impressions();
    await col.insertOne({
      ad_id,
      campaign,
      page: typeof page === 'string' ? page : '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });
  } catch (err) {
    console.error('track-impression error', err);
  }
  return corsResponse(null, { status: 204 });
}
