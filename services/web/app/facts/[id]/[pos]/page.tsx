import { notFound } from 'next/navigation';
import { feeds } from '../../../../lib/mongo';

export const dynamic = 'force-dynamic';

/**
 * Deep-linkable per-card deck page: /facts/<id>/<pos> (1-based absolute
 * position, ads included). Renders the exact same standalone page as
 * /facts/<id> — the widget opens the deck at the right card client-side.
 * The `data-cg-feed-pos` attribute is the explicit flag the widget uses to
 * know it may strip the trailing numeric URL segment and open at that card
 * (publisher embeds never carry it, so URLs ending in a number are never
 * misread as deck positions).
 */
export default async function PublicFactCardPage({
  params,
}: {
  params: { id: string; pos: string };
}) {
  // pos must look like a positive integer (no leading zeros, no letters).
  if (!/^[1-9][0-9]*$/.test(params.pos)) notFound();

  const col = await feeds();
  const deck = await col.findOne({ feed_id: params.id });
  if (!deck || deck.feed_type !== 'facts') notFound();

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 24px', textAlign: 'center' }}>
          {deck.name}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                borderRadius: 8,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              }}
            >
              <div
                style={{
                  height: 12,
                  background: '#e5e7eb',
                  borderRadius: 4,
                  marginBottom: 8,
                  width: `${70 + i * 8}%`,
                }}
              />
              <div
                style={{ height: 10, background: '#f3f4f6', borderRadius: 4, width: '90%' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Widget auto-opens the deck at the requested card */}
      <div
        data-cg-facts={deck.feed_id}
        data-cg-feed-preview="1"
        data-cg-feed-pos={params.pos}
        suppressHydrationWarning
      />
      <script src="/feed-widget.js" async />
    </div>
  );
}
