import { notFound } from 'next/navigation';
import Link from 'next/link';
import { feeds } from '../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

export default async function FeedPreviewPage({ params }: { params: { id: string } }) {
  const col = await feeds();
  const feed = await col.findOne({ feed_id: params.id });
  if (!feed) notFound();

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ marginBottom: 0 }}>
          Preview: <code>{feed.feed_id}</code>
        </h1>
        <div className="row" style={{ gap: 8 }}>
          <Link href={`/admin/feeds/${feed.feed_id}`} className="btn">
            ← Back to edit
          </Link>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        The feed opens immediately in this window. Use the <kbd>×</kbd> button or <kbd>Esc</kbd> to
        close. Open DevTools and toggle mobile emulation (📱) to see the mobile experience. This
        preview does <strong>not</strong> count toward analytics (same-origin guard).
      </p>

      {/* The widget will detect data-cg-feed-preview and open the overlay immediately */}
      <div data-cg-feed={feed.feed_id} data-cg-feed-preview="1" suppressHydrationWarning></div>

      <script src="/feed-widget.js" async></script>
    </>
  );
}
