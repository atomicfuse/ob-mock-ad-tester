import { feedItems, feeds } from './mongo';

// Reorder a feed's items by interleaving articles with ads at the feed's
// `ad_ratio` (N articles, then 1 ad, repeat). Article and ad order within their
// own kind is preserved by created_at. Writes back `position` on every item.
export async function reorderFeedItems(feed_id: string): Promise<void> {
  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  const ratio =
    feed && typeof feed.ad_ratio === 'number' && feed.ad_ratio >= 1 ? feed.ad_ratio : 3;

  const all = await itemsCol.find({ feed_id }).sort({ created_at: 1, _id: 1 }).toArray();
  const articles = all.filter((it) => it.kind === 'article');
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
