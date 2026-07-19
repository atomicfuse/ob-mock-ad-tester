import { notFound } from 'next/navigation';
import Link from 'next/link';
import { feeds } from '../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

export default async function FactDeckPreviewPage({ params }: { params: { id: string } }) {
  const col = await feeds();
  const deck = await col.findOne({ feed_id: params.id });
  if (!deck || deck.feed_type !== 'facts') notFound();

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ marginBottom: 0 }}>
          Preview: <code>{deck.feed_id}</code>
        </h1>
        <div className="row" style={{ gap: 8 }}>
          <Link href={`/admin/facts/${deck.feed_id}`} className="btn">
            ← Back to edit
          </Link>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        The deck opens immediately in this window. Use the <kbd>×</kbd> button or <kbd>Esc</kbd> to
        close. Open DevTools and toggle mobile emulation (📱) to see the mobile experience. This
        preview does <strong>not</strong> count toward analytics (same-origin guard).
      </p>

      {/* The widget will detect data-cg-feed-preview and open the deck immediately */}
      <div data-cg-facts={deck.feed_id} data-cg-feed-preview="1" suppressHydrationWarning></div>

      <script src="/feed-widget.js" async></script>
    </>
  );
}
