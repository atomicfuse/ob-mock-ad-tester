import { feeds, realAds } from '../../../../lib/mongo';
import FeedForm from '../../../../components/feed-form';
import type { RealAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function NewFeedPage() {
  const [feedsCol, realAdsCol] = await Promise.all([feeds(), realAds()]);
  const [feedList, realAdList] = await Promise.all([
    feedsCol.find({ status: 'active' }).project({ feed_id: 1, name: 1 }).toArray(),
    realAdsCol.find({}).sort({ created_at: -1 }).toArray(),
  ]);
  const realAdsClean = realAdList.map(({ _id, ...r }) => r) as RealAd[];
  const allFeeds = feedList.map(({ _id, ...f }) => f) as { feed_id: string; name: string }[];

  return (
    <>
      <h1>Create Feed</h1>
      <FeedForm mode="create" realAds={realAdsClean} allFeeds={allFeeds} />
    </>
  );
}
