'use client';

import { useState } from 'react';
import FeedAnalyticsView from './feed-analytics-view';

interface FeedOption {
  feed_id: string;
  name: string;
}

export default function AnalyticsFeedPicker({ feeds }: { feeds: FeedOption[] }) {
  const [feedId, setFeedId] = useState(feeds[0]?.feed_id ?? '');

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <label className="muted" style={{ fontSize: 13 }}>Feed</label>
        <select
          value={feedId}
          onChange={(e) => setFeedId(e.target.value)}
          style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          {feeds.map((f) => (
            <option key={f.feed_id} value={f.feed_id}>{f.name}</option>
          ))}
        </select>
      </div>
      {feedId && <FeedAnalyticsView key={feedId} feedId={feedId} />}
    </>
  );
}
