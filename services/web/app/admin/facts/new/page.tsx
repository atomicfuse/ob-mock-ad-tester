import { realAds } from '../../../../lib/mongo';
import FactForm from '../../../../components/fact-form';
import type { RealAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function NewFactDeckPage() {
  const realAdsCol = await realAds();
  const realAdList = await realAdsCol.find({}).sort({ created_at: -1 }).toArray();
  const realAdsClean = realAdList.map(({ _id, ...r }) => r) as RealAd[];

  return (
    <>
      <h1>Create Fact Deck</h1>
      <FactForm mode="create" realAds={realAdsClean} />
    </>
  );
}
