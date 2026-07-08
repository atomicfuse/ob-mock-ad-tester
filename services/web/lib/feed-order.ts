import { feedItems, feeds } from './mongo';
import type { FeedItem } from './types';

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

// Bring a feed's bare ad slots in line with its content count at the feed's
// `ad_ratio`: one ad slot per full group of `ratio` content items
// (target = floor(contentCount / ratio)). Adds bare `kind:'ad'` docs (NO
// `ad_id` — live/demo slots render from the feed's snippet, not per-ad data)
// or removes the excess (highest position first), then re-interleaves.
//
// Idempotent: with the same ratio and unchanged content, target equals the
// existing slot count and `reorderFeedItems` is deterministic, so calling this
// on every feed save is a safe no-op when nothing changed.
export async function applyAdRatio(feed_id: string, ratio?: number): Promise<void> {
  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });

  let resolved =
    typeof ratio === 'number' && ratio >= 1
      ? ratio
      : feed && typeof feed.ad_ratio === 'number' && feed.ad_ratio >= 1
        ? feed.ad_ratio
        : 3;
  resolved = Math.floor(resolved);

  const items = await itemsCol.find({ feed_id }).sort({ position: 1, _id: 1 }).toArray();
  const contentCount = items.filter((it) => it.kind !== 'ad').length;
  const adSlots = items.filter((it) => it.kind === 'ad');
  const target = Math.floor(contentCount / resolved);

  if (adSlots.length > target) {
    // Remove the excess slots, highest position first.
    const toRemove = adSlots.slice(target);
    if (toRemove.length) {
      await itemsCol.deleteMany({ _id: { $in: toRemove.map((a) => a._id) } });
    }
  } else if (adSlots.length < target) {
    const last = await itemsCol.find({ feed_id }).sort({ position: -1 }).limit(1).toArray();
    let pos = last.length ? last[0].position + 1 : 0;
    const now = new Date();
    const newDocs: FeedItem[] = [];
    for (let i = 0; i < target - adSlots.length; i++) {
      newDocs.push({
        feed_id,
        kind: 'ad',
        position: pos++,
        created_at: now,
        updated_at: now,
      });
    }
    await itemsCol.insertMany(newDocs);
  }

  await reorderFeedItems(feed_id);
}

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
