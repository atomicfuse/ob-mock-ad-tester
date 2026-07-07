import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems, ads } from '../../../../../lib/mongo';
import { fetchOgMeta } from '../../../../../lib/og-fetch';
import type { FeedItem } from '../../../../../lib/types';

export const dynamic = 'force-dynamic';

interface BulkBody {
  feed_id?: string;
  urls?: unknown;
  ad_ids?: unknown;
}

export async function POST(req: NextRequest) {
  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const feed_id = body.feed_id;
  if (typeof feed_id !== 'string' || !feed_id) {
    return NextResponse.json({ error: 'feed_id required' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
    : [];
  const adIds = Array.isArray(body.ad_ids)
    ? body.ad_ids.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : [];

  if (urls.length === 0 && adIds.length === 0) {
    return NextResponse.json({ error: 'urls or ad_ids must be a non-empty array' }, { status: 400 });
  }

  const [feedsCol, itemsCol, adsCol] = await Promise.all([feeds(), feedItems(), ads()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'feed not found' }, { status: 404 });

  // Validate ad_ids exist
  const validAds = adIds.length
    ? await adsCol.find({ ad_id: { $in: adIds } }).toArray()
    : [];
  const validAdIds = new Set(validAds.map((a) => a.ad_id));
  const missingAds = adIds.filter((id) => !validAdIds.has(id));

  // Fetch og: for all URLs in parallel — failures save as plain article without metadata.
  const now = new Date();
  const articleDocs: FeedItem[] = await Promise.all(
    urls.map(async (url) => {
      const doc: FeedItem = {
        feed_id,
        position: 0, // reassigned below (appended after the last item)
        kind: 'article',
        url,
        created_at: now,
        updated_at: now,
      };
      try {
        const meta = await fetchOgMeta(url);
        doc.fetched = { ...meta, fetched_at: now };
      } catch {
        // leave fetched undefined — operator can refresh later
      }
      return doc;
    }),
  );

  // Keep every requested ad (including repeats) — the same mock ad may appear
  // multiple times in a feed.
  const adDocs: FeedItem[] = adIds
    .filter((id) => validAdIds.has(id))
    .map((ad_id) => ({
      feed_id,
      position: 0, // reassigned below (appended after the last item)
      kind: 'ad',
      ad_id,
      created_at: now,
      updated_at: now,
    }));

  const all = [...articleDocs, ...adDocs];
  if (all.length > 0) {
    // Append after the current last item so any manual ordering is preserved.
    // (Use the "Auto-arrange" action to re-interleave by ad_ratio on demand.)
    const last = await itemsCol.find({ feed_id }).sort({ position: -1 }).limit(1).toArray();
    let pos = last.length ? last[0].position + 1 : 0;
    for (const doc of all) doc.position = pos++;
    await itemsCol.insertMany(all);
  }

  return NextResponse.json(
    {
      ok: true,
      added: { articles: articleDocs.length, ads: adDocs.length },
      missing_ad_ids: missingAds,
    },
    { status: 201 },
  );
}
