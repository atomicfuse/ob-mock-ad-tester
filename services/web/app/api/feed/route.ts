import { NextRequest } from 'next/server';
import { feeds, feedItems, ads } from '../../../lib/mongo';
import { corsResponse, preflight } from '../../../lib/cors';
import type { AdMode, FeedItemResolved, FeedReadResponse } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return corsResponse(null, { status: 204 });

  try {
    const [feedsCol, itemsCol, adsCol] = await Promise.all([feeds(), feedItems(), ads()]);
    const feed = await feedsCol.findOne({ feed_id: id });
    if (!feed || feed.status !== 'active') {
      return corsResponse(null, { status: 204 });
    }

    const items = await itemsCol.find({ feed_id: id }).sort({ position: 1 }).toArray();
    if (items.length === 0) {
      return corsResponse(null, { status: 204 });
    }

    const adMode: AdMode = feed.ad_mode === 'live' ? 'live' : 'mock';
    const liveSnippet = adMode === 'live' && typeof feed.live_ad_snippet === 'string'
      ? feed.live_ad_snippet
      : '';

    // In mock mode, resolve real ad data; in live mode, ad slots stay as placeholders
    // and the widget renders the feed's snippet into each one.
    const adIds = items.filter((i) => i.kind === 'ad' && i.ad_id).map((i) => i.ad_id as string);
    const adDocs = adMode === 'mock' && adIds.length
      ? await adsCol.find({ ad_id: { $in: adIds } }).toArray()
      : [];
    const adsById = new Map(adDocs.map((a) => [a.ad_id, a]));

    const resolved: FeedItemResolved[] = [];
    for (const it of items) {
      if (it.kind === 'article') {
        const title = it.override?.title || it.fetched?.title;
        const image = it.override?.image || it.fetched?.image;
        if (!title || !image) continue; // skip articles missing required render data
        resolved.push({
          position: resolved.length,
          kind: 'article',
          title,
          image,
          description: it.fetched?.description,
          url: it.url,
        });
      } else if (it.kind === 'ad' && it.ad_id) {
        if (adMode === 'live') {
          // Slot only — widget renders the snippet client-side.
          resolved.push({
            position: resolved.length,
            kind: 'ad',
            ad_id: it.ad_id,
          });
          continue;
        }
        const ad = adsById.get(it.ad_id);
        if (!ad || ad.status !== 'active') continue; // paused/missing → drop from feed
        resolved.push({
          position: resolved.length,
          kind: 'ad',
          ad_id: ad.ad_id,
          ad_title: ad.title,
          ad_brand: ad.brand,
          ad_image: ad.image_url,
          ad_landing_page: ad.landing_page,
          ad_campaign: ad.campaign,
        });
      }
    }

    if (resolved.length === 0) {
      return corsResponse(null, { status: 204 });
    }

    const body: FeedReadResponse = {
      feed_id: feed.feed_id,
      trigger: feed.trigger,
      items: resolved,
      ad_mode: adMode,
      live_ad_snippet: liveSnippet || undefined,
    };
    return corsResponse(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('feed read error', err);
    return corsResponse(null, { status: 204 });
  }
}
