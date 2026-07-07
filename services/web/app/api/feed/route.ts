import { NextRequest } from 'next/server';
import { feeds, feedItems, ads, realAds } from '../../../lib/mongo';
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

    // Resolve live ad scripts: prefer real_ad_id reference, fall back to inline fields
    let liveHeadScript = '';
    let liveSnippet = '';
    let liveAdsPerSnippet = 1;
    if (adMode === 'live') {
      if (feed.real_ad_id) {
        const realAdsCol = await realAds();
        const realAd = await realAdsCol.findOne({ real_ad_id: feed.real_ad_id });
        if (realAd) {
          liveHeadScript = realAd.head_script;
          liveSnippet = realAd.snippet;
          liveAdsPerSnippet = realAd.ads_per_snippet >= 1 ? realAd.ads_per_snippet : 1;
        }
      } else {
        liveHeadScript = typeof feed.live_ad_head_script === 'string' ? feed.live_ad_head_script : '';
        liveSnippet = typeof feed.live_ad_snippet === 'string' ? feed.live_ad_snippet : '';
        liveAdsPerSnippet =
          typeof feed.live_ads_per_snippet === 'number' && feed.live_ads_per_snippet >= 1
            ? Math.floor(feed.live_ads_per_snippet)
            : 1;
      }
    }

    // In mock mode, resolve real ad data; in live mode, ad slots stay as placeholders
    // and the widget renders the feed's snippet into each one.
    const adIds = items.filter((i) => i.kind === 'ad' && i.ad_id).map((i) => i.ad_id as string);
    const adDocs = adMode === 'mock' && adIds.length
      ? await adsCol.find({ ad_id: { $in: adIds } }).toArray()
      : [];
    const adsById = new Map(adDocs.map((a) => [a.ad_id, a]));

    // Resolve real-ad banners attached under individual articles.
    const bannerAdIds = items
      .filter((i) => i.kind === 'article' && i.attached_real_ad_id)
      .map((i) => i.attached_real_ad_id as string);
    let bannerById = new Map<string, { snippet: string; head_script: string }>();
    if (bannerAdIds.length) {
      const realAdsCol = await realAds();
      const bannerDocs = await realAdsCol
        .find({ real_ad_id: { $in: bannerAdIds } })
        .toArray();
      bannerById = new Map(
        bannerDocs.map((d) => [
          d.real_ad_id,
          { snippet: d.snippet || '', head_script: d.head_script || '' },
        ]),
      );
    }

    const resolved: FeedItemResolved[] = [];
    for (const it of items) {
      if (it.kind === 'article') {
        const title = it.override?.title || it.fetched?.title;
        const image = it.override?.image || it.fetched?.image;
        if (!title || !image) continue; // skip articles missing required render data
        const article: FeedItemResolved = {
          position: resolved.length,
          kind: 'article',
          title,
          image,
          description: it.fetched?.description,
          url: it.url,
        };
        const banner = it.attached_real_ad_id ? bannerById.get(it.attached_real_ad_id) : undefined;
        if (banner && banner.snippet) {
          article.banner_snippet = banner.snippet;
          article.banner_head_script = banner.head_script;
          article.banner_ad_id = it.attached_real_ad_id;
        }
        resolved.push(article);
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
      live_ad_head_script: liveHeadScript || undefined,
      live_ad_snippet: liveSnippet || undefined,
      live_ads_per_snippet: adMode === 'live' ? liveAdsPerSnippet : undefined,
      default_subid: feed.default_subid || undefined,
    };
    return corsResponse(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('feed read error', err);
    return corsResponse(null, { status: 204 });
  }
}
