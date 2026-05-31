import Link from 'next/link';
import { feeds } from '../../../lib/mongo';
import FeedsTable from '../../../components/feeds-table';
import type { FeedInitiative } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function FeedsListPage() {
  const col = await feeds();
  const list = await col.find({}).sort({ created_at: -1 }).toArray();
  const feedList = list.map(({ _id, ...feed }) => ({
    ...feed,
    created_at: new Date(feed.created_at),
    updated_at: new Date(feed.updated_at),
  })) as FeedInitiative[];

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Feed Initiatives</h1>
        <Link href="/admin/feeds/new" className="btn btn-primary">
          + New Feed
        </Link>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Full-screen vertical feeds that mix article teasers with sponsored slots. Embed once per
        publisher page.
      </p>
      <FeedsTable initialFeeds={feedList} />
    </>
  );
}
