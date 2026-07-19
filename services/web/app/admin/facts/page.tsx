import Link from 'next/link';
import { feeds } from '../../../lib/mongo';
import FactsTable from '../../../components/facts-table';
import type { FeedInitiative } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function FactsListPage() {
  const col = await feeds();
  const list = await col.find({ feed_type: 'facts' }).sort({ created_at: -1 }).toArray();
  const deckList = list.map(({ _id, ...deck }) => ({
    ...deck,
    created_at: new Date(deck.created_at),
    updated_at: new Date(deck.updated_at),
  })) as FeedInitiative[];

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Fact Decks</h1>
        <Link href="/admin/facts/new" className="btn btn-primary">
          + New Deck
        </Link>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Swipeable fact-card decks that mix bite-sized facts with sponsored cards. Embed once per
        publisher page.
      </p>
      <FactsTable initialDecks={deckList} />
    </>
  );
}
