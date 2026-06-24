import { notFound } from 'next/navigation';
import { feeds } from '../../../lib/mongo';

export const dynamic = 'force-dynamic';

export default async function PublicFeedPage({ params }: { params: { id: string } }) {
  const col = await feeds();
  const feed = await col.findOne({ feed_id: params.id });
  if (!feed) notFound();

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 24px', textAlign: 'center' }}>
          {feed.name}
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

      {/* Widget auto-opens the feed overlay */}
      <div data-cg-feed={feed.feed_id} data-cg-feed-preview="1" suppressHydrationWarning />
      <script src="/feed-widget.js" async />
    </div>
  );
}
