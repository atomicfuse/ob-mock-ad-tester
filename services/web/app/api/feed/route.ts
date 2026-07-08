import { NextRequest } from 'next/server';
import { feeds, feedItems, realAds } from '../../../lib/mongo';
import { corsResponse, preflight } from '../../../lib/cors';
import type { AdMode, FeedItemResolved, FeedReadResponse } from '../../../lib/types';
import { slugify, dedupeSlugs } from '../../../lib/listicle';
import { rewriteSnippetForDemo } from '../../../lib/demo-ads';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return corsResponse(null, { status: 204 });

  try {
    const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
    const feed = await feedsCol.findOne({ feed_id: id });
    if (!feed || feed.status !== 'active') {
      return corsResponse(null, { status: 204 });
    }

    const items = await itemsCol.find({ feed_id: id }).sort({ position: 1 }).toArray();
    if (items.length === 0) {
      return corsResponse(null, { status: 204 });
    }

    // Legacy coercion: anything not exactly 'live' (incl. legacy 'mock' and
    // undefined) resolves as demo. Ads are always live-like now.
    const adMode: AdMode = feed.ad_mode === 'live' ? 'live' : 'demo';
    // Demo behaves exactly like live everywhere (slots, snippets, tracking) —
    // the only difference is the feedid/auth rewrite applied at resolution time.
    const isDemo = adMode === 'demo';

    // Resolve live ad scripts: prefer real_ad_id reference, fall back to inline fields
    let liveHeadScript = '';
    let liveSnippet = '';
    let liveAdsPerSnippet = 1;
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
    if (isDemo) {
      liveHeadScript = rewriteSnippetForDemo(liveHeadScript);
      liveSnippet = rewriteSnippetForDemo(liveSnippet);
    }

    // Resolve real-ad banners attached under individual articles or cards.
    const bannerAdIds = items
      .filter((i) => (i.kind === 'article' || i.kind === 'card') && i.attached_real_ad_id)
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
          isDemo
            ? {
                snippet: rewriteSnippetForDemo(d.snippet || ''),
                head_script: rewriteSnippetForDemo(d.head_script || ''),
              }
            : { snippet: d.snippet || '', head_script: d.head_script || '' },
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
      } else if (it.kind === 'card' && it.card) {
        if (!it.card.heading || !it.card.image) continue; // skip cards missing required render data
        const cardItem: FeedItemResolved = {
          position: resolved.length,
          kind: 'card',
          title: it.card.heading,
          image: it.card.image,
          description: it.card.text || undefined,
        };
        const banner = it.attached_real_ad_id ? bannerById.get(it.attached_real_ad_id) : undefined;
        if (banner && banner.snippet) {
          cardItem.banner_snippet = banner.snippet;
          cardItem.banner_head_script = banner.head_script;
          cardItem.banner_ad_id = it.attached_real_ad_id;
        }
        resolved.push(cardItem);
      } else if (it.kind === 'ad') {
        // Back-compat guard: a legacy feed with no real ad configured resolves
        // to an empty snippet. Skip ad slots entirely so cached widgets serve a
        // clean feed instead of rendering broken empty ad cards.
        if (!liveSnippet) continue;
        // Bare slot only — widget renders the snippet client-side.
        resolved.push({
          position: resolved.length,
          kind: 'ad',
        });
      }
    }

    if (resolved.length === 0) {
      return corsResponse(null, { status: 204 });
    }

    // Assign URL-safe slugs (articles + cards only; ads carry no slug) and
    // dedupe collisions in position order.
    const contentItems = resolved.filter((item) => item.kind !== 'ad');
    const baseSlugs = contentItems.map((item) => slugify(item.title || '', `item-${item.position}`));
    const dedupedSlugs = dedupeSlugs(baseSlugs);
    contentItems.forEach((item, i) => {
      item.slug = dedupedSlugs[i];
    });

    const body: FeedReadResponse = {
      feed_id: feed.feed_id,
      trigger: feed.trigger,
      items: resolved,
      // Demo is reported to the widget as 'live': the (already rewritten)
      // snippet renders through the widget's existing live path, so cached
      // widget JS on publisher pages never needs to know about demo mode.
      ad_mode: 'live',
      live_ad_head_script: liveHeadScript || undefined,
      live_ad_snippet: liveSnippet || undefined,
      live_ads_per_snippet: liveAdsPerSnippet,
      default_subid: feed.default_subid || undefined,
      live_ad_dedupe: !!feed.live_ad_dedupe,
    };
    return corsResponse(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('feed read error', err);
    return corsResponse(null, { status: 204 });
  }
}
