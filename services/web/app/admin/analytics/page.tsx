import { feeds } from '../../../lib/mongo';
import AnalyticsFeedPicker from '../../../components/analytics-feed-picker';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const col = await feeds();
  const list = await col.find({}).sort({ created_at: -1 }).toArray();
  const feedOptions = list.map((f) => ({ feed_id: f.feed_id, name: f.name }));

  return (
    <>
      <h1>Analytics</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Impressions, clicks, CTR, and funnel depth per feed initiative.
      </p>
      {feedOptions.length === 0 ? (
        <div className="empty">No feeds yet. Create a feed to see analytics.</div>
      ) : (
        <AnalyticsFeedPicker feeds={feedOptions} />
      )}
    </>
  );
}
