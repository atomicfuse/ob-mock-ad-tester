import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { feeds, feedItems, ads } from '../../../../lib/mongo';
import FeedForm from '../../../../components/feed-form';
import FeedItemEditor from '../../../../components/feed-item-editor';
import EmbedCodeBlock from '../../../../components/embed-code-block';
import type { FeedInitiative, FeedItem, MockAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function FeedDetailPage({ params }: { params: { id: string } }) {
  const [feedsCol, itemsCol, adsCol] = await Promise.all([feeds(), feedItems(), ads()]);
  const feedDoc = await feedsCol.findOne({ feed_id: params.id });
  if (!feedDoc) notFound();
  const { _id: _f, ...feedRest } = feedDoc;
  const feed = feedRest as FeedInitiative;

  const items = await itemsCol.find({ feed_id: params.id }).sort({ position: 1 }).toArray();
  const adList = await adsCol.find({ status: 'active' }).sort({ created_at: -1 }).toArray();

  const itemsClean = items.map((it) => ({
    ...it,
    _id: String(it._id),
  })) as any;
  const adsClean = adList.map(({ _id, ...a }) => a) as MockAd[];

  const h = headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const embedCode = `<script src="${origin}/feed-widget.js" async></script>\n<div data-cg-feed="${feed.feed_id}"></div>`;

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>
          Feed: <code>{feed.feed_id}</code>{' '}
          <span className={`pill pill-${feed.status}`}>{feed.status}</span>
        </h1>
        <div className="row">
          <Link
            href={`/admin/feeds/${feed.feed_id}/preview`}
            className="btn btn-primary"
            target="_blank"
            rel="noopener"
          >
            ▶ Preview
          </Link>
          <Link href={`/admin/feeds/${feed.feed_id}/analytics`} className="btn">
            View analytics →
          </Link>
          <Link href="/admin/feeds" className="btn">
            ← Back
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2>Settings</h2>
            <FeedForm mode="edit" initial={feed} />
          </div>

          <div>
            <h2>Embed Code</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Paste this on any page where this feed should appear.
            </p>
            <EmbedCodeBlock code={embedCode} />
          </div>
        </div>

        <div>
          <h2>Item Queue</h2>
          <FeedItemEditor
            feedId={feed.feed_id}
            adRatio={feed.ad_ratio}
            initialAdMode={feed.ad_mode ?? 'mock'}
            initialLiveAdHeadScript={feed.live_ad_head_script ?? ''}
            initialLiveAdSnippet={feed.live_ad_snippet ?? ''}
            initialLiveAdsPerSnippet={feed.live_ads_per_snippet ?? 1}
            initialItems={itemsClean}
            ads={adsClean}
          />
        </div>
      </div>
    </>
  );
}
