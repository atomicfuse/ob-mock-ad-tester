import Link from 'next/link';
import { ads, realAds } from '../../../lib/mongo';
import AdsTable from '../../../components/ads-table';
import RealAdsManager from '../../../components/real-ads-manager';
import type { MockAd, RealAd } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function AdsListPage() {
  const [adsCol, realAdsCol] = await Promise.all([ads(), realAds()]);
  const [list, realList] = await Promise.all([
    adsCol.find({}).sort({ created_at: -1 }).toArray(),
    realAdsCol.find({}).sort({ created_at: -1 }).toArray(),
  ]);

  const adList = list.map(({ _id, ...ad }) => ({
    ...ad,
    created_at: new Date(ad.created_at),
    updated_at: new Date(ad.updated_at),
  })) as MockAd[];

  const realAdList = realList.map(({ _id, ...r }) => ({
    ...r,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
  })) as RealAd[];

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Mock Ads</h1>
        <Link href="/admin/ads/new" className="btn btn-primary">
          + New Ad
        </Link>
      </div>
      <AdsTable initialAds={adList} />

      <div style={{ marginTop: 40 }}>
        <h1 style={{ marginBottom: 8 }}>Real Ads</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Define provider ad scripts once here, then choose them per feed instead of pasting scripts
          into each feed.
        </p>
        <RealAdsManager initialAds={realAdList} />
      </div>
    </>
  );
}
