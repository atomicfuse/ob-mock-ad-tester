import Link from 'next/link';
import { ads } from '../../../lib/mongo';
import AdsTable from '../../../components/ads-table';
import type { MockAd } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function AdsListPage() {
  const col = await ads();
  const list = await col.find({}).sort({ created_at: -1 }).toArray();
  // Strip Mongo _id for serialization
  const adList = list.map(({ _id, ...ad }) => ({
    ...ad,
    created_at: new Date(ad.created_at),
    updated_at: new Date(ad.updated_at),
  })) as MockAd[];

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Mock Ads</h1>
        <Link href="/admin/ads/new" className="btn btn-primary">
          + New Ad
        </Link>
      </div>
      <AdsTable initialAds={adList} />
    </>
  );
}
