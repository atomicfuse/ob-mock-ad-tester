import { realAds } from '../../../../lib/mongo';
import FeedForm from '../../../../components/feed-form';
import type { RealAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function NewFeedPage() {
  const realAdsCol = await realAds();
  const realAdList = await realAdsCol.find({}).sort({ created_at: -1 }).toArray();
  const realAdsClean = realAdList.map(({ _id, ...r }) => r) as RealAd[];

  return (
    <>
      <h1>Create Feed</h1>
      <FeedForm mode="create" realAds={realAdsClean} />
    </>
  );
}
