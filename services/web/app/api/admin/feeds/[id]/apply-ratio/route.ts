import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems, ads } from '../../../../../../lib/mongo';
import { reorderFeedItems } from '../../../../../../lib/feed-order';
import type { FeedItem } from '../../../../../../lib/types';

export const dynamic = 'force-dynamic';

// POST { ratio } — make the feed exactly `ratio` articles : 1 ad. Adds ad cards
// (cycling active mock ads) or removes excess ad cards to hit the target, sets
// the feed's ad_ratio, then interleaves.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const feed_id = params.id;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const ratio = Number(body?.ratio);
  if (!Number.isInteger(ratio) || ratio < 1 || ratio > 20) {
    return NextResponse.json({ error: 'ratio must be an integer 1–20' }, { status: 400 });
  }

  const [feedsCol, itemsCol, adsCol] = await Promise.all([feeds(), feedItems(), ads()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'feed not found' }, { status: 404 });

  const items = await itemsCol.find({ feed_id }).sort({ position: 1 }).toArray();
  const articleCount = items.filter((i) => i.kind !== 'ad').length;
  const adItems = items.filter((i) => i.kind === 'ad');
  const needed = Math.floor(articleCount / ratio); // one ad per full group of `ratio` articles

  if (adItems.length > needed) {
    // Remove the excess ad cards (keep the first `needed` by position).
    const toRemove = adItems.slice(needed);
    if (toRemove.length) {
      await itemsCol.deleteMany({ _id: { $in: toRemove.map((a) => a._id) } });
    }
  } else if (adItems.length < needed) {
    const activeAds = await adsCol.find({ status: 'active' }).toArray();
    if (activeAds.length === 0) {
      return NextResponse.json(
        { error: 'No active mock ads to add — create one in Ads first.' },
        { status: 400 },
      );
    }
    const last = await itemsCol.find({ feed_id }).sort({ position: -1 }).limit(1).toArray();
    let pos = last.length ? last[0].position + 1 : 0;
    const now = new Date();
    const newDocs: FeedItem[] = [];
    for (let i = 0; i < needed - adItems.length; i++) {
      const ad = activeAds[i % activeAds.length];
      newDocs.push({
        feed_id,
        position: pos++,
        kind: 'ad',
        ad_id: ad.ad_id,
        created_at: now,
        updated_at: now,
      });
    }
    await itemsCol.insertMany(newDocs);
  }

  await feedsCol.updateOne({ feed_id }, { $set: { ad_ratio: ratio, updated_at: new Date() } });
  await reorderFeedItems(feed_id);

  const list = await itemsCol.find({ feed_id }).sort({ position: 1 }).toArray();
  return NextResponse.json({ ok: true, ad_ratio: ratio, items: list });
}
