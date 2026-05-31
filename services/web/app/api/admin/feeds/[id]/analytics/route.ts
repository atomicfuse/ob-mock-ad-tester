import { NextRequest, NextResponse } from 'next/server';
import {
  feeds,
  feedItems,
  feedImpressions,
  feedClicks,
  feedExits,
  ads,
} from '../../../../../../lib/mongo';
import type { FeedAnalytics, FeedItemMetrics } from '../../../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const [feedsCol, itemsCol, impCol, clickCol, exitCol, adsCol] = await Promise.all([
    feeds(),
    feedItems(),
    feedImpressions(),
    feedClicks(),
    feedExits(),
    ads(),
  ]);

  const feed = await feedsCol.findOne({ feed_id: id });
  if (!feed) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const items = await itemsCol.find({ feed_id: id }).sort({ position: 1 }).toArray();

  const adIds = items.filter((i) => i.kind === 'ad' && i.ad_id).map((i) => i.ad_id as string);
  const adDocs = adIds.length
    ? await adsCol.find({ ad_id: { $in: adIds } }).toArray()
    : [];
  const adsById = new Map(adDocs.map((a) => [a.ad_id, a]));

  const [impCounts, clickCounts, exitsByPos, exits] = await Promise.all([
    impCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id } },
        { $group: { _id: '$position', count: { $sum: 1 } } },
      ])
      .toArray(),
    clickCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id } },
        { $group: { _id: '$position', count: { $sum: 1 } } },
      ])
      .toArray(),
    exitCol
      .aggregate<{ _id: number; count: number }>([
        { $match: { feed_id: id } },
        { $group: { _id: '$exit_position', count: { $sum: 1 } } },
      ])
      .toArray(),
    exitCol.find({ feed_id: id }).toArray(),
  ]);

  const impMap = new Map(impCounts.map((d) => [d._id, d.count]));
  const clickMap = new Map(clickCounts.map((d) => [d._id, d.count]));
  const exitsAtPos = new Map(exitsByPos.map((d) => [d._id, d.count]));

  const itemMetrics: FeedItemMetrics[] = items.map((it, idx) => {
    const i = impMap.get(idx) ?? 0;
    const c = clickMap.get(idx) ?? 0;
    let label = '';
    if (it.kind === 'article') {
      label = it.override?.title || it.fetched?.title || it.url || '(article)';
    } else if (it.ad_id) {
      const ad = adsById.get(it.ad_id);
      label = ad ? `ad: ${ad.ad_id} — ${ad.title}` : `ad: ${it.ad_id}`;
    }
    return {
      position: idx,
      kind: it.kind,
      label,
      impressions: i,
      clicks: c,
      ctr: i > 0 ? c / i : 0,
      exits: exitsAtPos.get(idx) ?? 0,
    };
  });

  const entries = impMap.get(0) ?? 0;
  const totalExits = exits.length;
  const avgCardsViewed =
    exits.length > 0
      ? exits.reduce((sum, e) => sum + (e.items_viewed ?? 0), 0) / exits.length
      : 0;
  const avgTimeInFeedMs =
    exits.length > 0
      ? exits.reduce((sum, e) => sum + (e.time_in_feed_ms ?? 0), 0) / exits.length
      : 0;

  const body: FeedAnalytics = {
    feed_id: id,
    items: itemMetrics,
    totals: {
      entries,
      exits: totalExits,
      avg_cards_viewed: avgCardsViewed,
      avg_time_in_feed_ms: avgTimeInFeedMs,
    },
  };
  return NextResponse.json(body);
}
