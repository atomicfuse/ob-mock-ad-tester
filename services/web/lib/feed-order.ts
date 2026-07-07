import { feedItems, feeds } from './mongo';

// Reorder a feed's items by interleaving articles with ads at the feed's
// `ad_ratio` (N articles, then 1 ad, repeat). Article and ad order within their
// own kind is preserved by the item's *current* `position` (falling back to
// `_id` as a stable tiebreaker) — not `created_at`. Every insert path in this
// codebase assigns new items the next sequential position when they're
// created, and manual drag-to-reorder (feed-items/reorder) only ever updates
// `position`, so `position` is always the source of truth for display order;
// `created_at` goes stale the moment a feed is manually reordered. Sorting by
// position here means re-interleaving (e.g. after a card import or an
// ad_ratio change) preserves whatever order was already on screen and only
// has to decide where newly-appended items land relative to it.
// Writes back `position` on every item.
export async function reorderFeedItems(feed_id: string): Promise<void> {
  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  const ratio =
    feed && typeof feed.ad_ratio === 'number' && feed.ad_ratio >= 1 ? feed.ad_ratio : 3;

  const all = await itemsCol.find({ feed_id }).sort({ position: 1, _id: 1 }).toArray();
  const articles = all.filter((it) => it.kind !== 'ad');
  const ads = all.filter((it) => it.kind === 'ad');

  const ordered: typeof all = [];
  let ai = 0;
  let di = 0;
  while (ai < articles.length || di < ads.length) {
    for (let k = 0; k < ratio && ai < articles.length; k++) {
      ordered.push(articles[ai++]);
    }
    if (di < ads.length) ordered.push(ads[di++]);
  }

  // Two-pass write to avoid colliding on any future unique index over
  // (feed_id, position): first park all rows at negative sentinels, then assign
  // their final positions.
  await Promise.all(
    ordered.map((it, idx) =>
      itemsCol.updateOne({ _id: it._id }, { $set: { position: -(idx + 1) } }),
    ),
  );
  await Promise.all(
    ordered.map((it, idx) =>
      itemsCol.updateOne({ _id: it._id }, { $set: { position: idx } }),
    ),
  );
}
