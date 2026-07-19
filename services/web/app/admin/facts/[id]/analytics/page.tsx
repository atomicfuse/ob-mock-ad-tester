import Link from 'next/link';
import { notFound } from 'next/navigation';
import { feeds } from '../../../../../lib/mongo';
import FeedAnalyticsView from '../../../../../components/feed-analytics-view';

export const dynamic = 'force-dynamic';

export default async function FactDeckAnalyticsPage({ params }: { params: { id: string } }) {
  const col = await feeds();
  const deck = await col.findOne({ feed_id: params.id });
  if (!deck || deck.feed_type !== 'facts') notFound();

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>
          Analytics: <code>{deck.feed_id}</code>
        </h1>
        <div className="row">
          <Link href={`/admin/facts/${deck.feed_id}`} className="btn">
            ← Edit deck
          </Link>
          <Link href="/admin/facts" className="btn">
            All decks
          </Link>
        </div>
      </div>
      {/* Decks share the feed analytics pipeline — same component, same routes. */}
      <FeedAnalyticsView feedId={deck.feed_id} />
    </>
  );
}
