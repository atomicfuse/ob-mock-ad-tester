import { NextRequest } from 'next/server';
import { ads } from '../../../lib/mongo';
import { corsResponse, preflight } from '../../../lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return corsResponse(null, { status: 204 });
  }

  try {
    const collection = await ads();
    const ad = await collection.findOne({ ad_id: id });
    if (!ad || ad.status !== 'active') {
      return corsResponse(null, { status: 204 });
    }
    return corsResponse(
      {
        ad_id: ad.ad_id,
        campaign: ad.campaign,
        title: ad.title,
        brand: ad.brand,
        image_url: ad.image_url,
        landing_page: ad.landing_page,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (err) {
    console.error('mock-ad error', err);
    return corsResponse(null, { status: 204 });
  }
}
