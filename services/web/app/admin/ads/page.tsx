import { realAds } from '../../../lib/mongo';
import RealAdsManager from '../../../components/real-ads-manager';
import type { RealAd } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function AdsListPage() {
  const realAdsCol = await realAds();
  const realList = await realAdsCol.find({}).sort({ created_at: -1 }).toArray();

  const realAdList = realList.map(({ _id, ...r }) => ({
    ...r,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
  })) as RealAd[];

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Ads</h1>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
        Define provider ad scripts once here, then choose them per feed instead of pasting scripts
        into each feed.
      </p>
      <RealAdsManager initialAds={realAdList} />
    </>
  );
}
