import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { feeds, feedItems, realAds } from '../../../../lib/mongo';
import FactForm from '../../../../components/fact-form';
import FactItemEditor from '../../../../components/fact-item-editor';
import EmbedCodeBlock from '../../../../components/embed-code-block';
import type { FeedInitiative, RealAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function FactDeckDetailPage({ params }: { params: { id: string } }) {
  const [feedsCol, itemsCol, realAdsCol] = await Promise.all([feeds(), feedItems(), realAds()]);
  const deckDoc = await feedsCol.findOne({ feed_id: params.id });
  if (!deckDoc || deckDoc.feed_type !== 'facts') notFound();
  const { _id: _f, ...deckRest } = deckDoc;
  const deck = deckRest as FeedInitiative;

  const [items, realAdList] = await Promise.all([
    itemsCol.find({ feed_id: params.id }).sort({ position: 1 }).toArray(),
    realAdsCol.find({}).sort({ created_at: -1 }).toArray(),
  ]);

  const itemsClean = items.map((it) => ({
    ...it,
    _id: String(it._id),
  })) as any;
  const realAdsClean = realAdList.map(({ _id, ...r }) => r) as RealAd[];

  const h = headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const embedCode = `<script src="${origin}/feed-widget.js" async></script>\n<div data-cg-facts="${deck.feed_id}"></div>`;
  const deckUrl = `${origin}/facts/${deck.feed_id}`;

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>
          Deck: <code>{deck.feed_id}</code>{' '}
          <span className={`pill pill-${deck.status}`}>{deck.status}</span>
        </h1>
        <div className="row">
          <Link
            href={`/admin/facts/${deck.feed_id}/preview`}
            className="btn btn-primary"
            target="_blank"
            rel="noopener"
          >
            ▶ Preview
          </Link>
          <Link href={`/admin/facts/${deck.feed_id}/analytics`} className="btn">
            View analytics →
          </Link>
          <Link href="/admin/facts" className="btn">
            ← Back
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2>Settings</h2>
            <FactForm mode="edit" initial={deck} realAds={realAdsClean} />
          </div>

          <div>
            <h2>Embed Code</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Paste this on any page where this deck should appear.
            </p>
            <EmbedCodeBlock code={embedCode} />
            <p className="muted" style={{ marginTop: 12, marginBottom: 4, fontSize: 13 }}>
              Share this link to open the deck in a standalone page:
            </p>
            <EmbedCodeBlock code={deckUrl} />
          </div>
        </div>

        <div>
          <h2>Fact Queue</h2>
          <FactItemEditor feedId={deck.feed_id} initialItems={itemsClean} />
        </div>
      </div>
    </>
  );
}
