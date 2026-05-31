import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems, ads } from '../../../../../lib/mongo';
import { fetchOgMeta } from '../../../../../lib/og-fetch';
import { reorderFeedItems } from '../../../../../lib/feed-order';
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

  // Skip ad_ids already present in this feed's queue — no duplicates allowed.
  const existingAdItems = adIds.length
    ? await itemsCol.find({ feed_id, kind: 'ad', ad_id: { $in: adIds } }).toArray()
    : [];
  const existingAdIds = new Set(
    existingAdItems.map((it) => it.ad_id).filter((v): v is string => typeof v === 'string'),
  );
  const duplicateAds = adIds.filter((id) => existingAdIds.has(id));

  // Fetch og: for all URLs in parallel — failures save as plain article without metadata.
  const now = new Date();
  const articleDocs: FeedItem[] = await Promise.all(
    urls.map(async (url) => {
      const doc: FeedItem = {
        feed_id,
        position: 0, // will be reassigned by reorderFeedItems
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

  const adDocs: FeedItem[] = adIds
    .filter((id) => validAdIds.has(id) && !existingAdIds.has(id))
    .map((ad_id) => ({
      feed_id,
      position: 0,
      kind: 'ad',
      ad_id,
      created_at: now,
      updated_at: now,
    }));

  const all = [...articleDocs, ...adDocs];
  if (all.length > 0) {
    await itemsCol.insertMany(all);
  }

  await reorderFeedItems(feed_id);

  return NextResponse.json(
    {
      ok: true,
      added: { articles: articleDocs.length, ads: adDocs.length },
      missing_ad_ids: missingAds,
      duplicate_ad_ids: duplicateAds,
    },
    { status: 201 },
  );
}
