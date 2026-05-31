import Link from 'next/link';
import { notFound } from 'next/navigation';
import { feeds } from '../../../../../lib/mongo';
import FeedAnalyticsView from '../../../../../components/feed-analytics-view';

export const dynamic = 'force-dynamic';

export default async function FeedAnalyticsPage({ params }: { params: { id: string } }) {
  const col = await feeds();
  const feed = await col.findOne({ feed_id: params.id });
  if (!feed) notFound();

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>
          Analytics: <code>{feed.feed_id}</code>
        </h1>
        <div className="row">
          <Link href={`/admin/feeds/${feed.feed_id}`} className="btn">
            ← Edit feed
          </Link>
          <Link href="/admin/feeds" className="btn">
            All feeds
          </Link>
        </div>
      </div>
      <FeedAnalyticsView feedId={feed.feed_id} />
    </>
  );
}
