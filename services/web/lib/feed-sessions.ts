import { feedSessions, withMongoRetry } from './mongo';
import type { Attribution } from './types';

export interface SessionEventInput {
  session_id: string;
  feed_id: string;
  attribution: Attribution | null;
  page?: string;
  timestamp: Date;
  /** For batched groups: the latest event time in the batch. $max
   *  last_event_at uses this; $min started_at uses `timestamp`. */
  timestamp_end?: Date;
  // increments — booleans from the single-event endpoints, counts from the
  // batch endpoint (true → 1)
  card_view?: boolean | number;
  ad_view?: boolean | number;
  ad_click?: boolean | number;
  article_click?: boolean | number;
  // maxima
  swipe_depth?: number;
  time_in_feed_ms?: number;
  exited?: boolean;
}

/** Upsert the per-session rollup doc for one tracking event (or one batched
 *  group of events). Uses $setOnInsert/$min/$max/$inc so events may arrive in
 *  any order (beacons are not ordered). started_at lives in $min — a path may
 *  not appear in both $setOnInsert and $min. Transient connection errors are
 *  retried (withMongoRetry); the E11000 upsert race two concurrent
 *  first-events can produce on the unique session_id index is retried once.
 *  Never throws — session rollup must not break event ingestion. */
export async function applySessionEvent(ev: SessionEventInput): Promise<void> {
  if (!ev.session_id) return; // old cached widgets — no session concept
  try {
    const col = await feedSessions();
    const setOnInsert: Record<string, unknown> = {
      session_id: ev.session_id,
      feed_id: ev.feed_id,
      attribution: ev.attribution,
    };
    if (ev.page) setOnInsert.first_page = ev.page;

    const max: Record<string, unknown> = { last_event_at: ev.timestamp_end ?? ev.timestamp };
    if (typeof ev.swipe_depth === 'number') max.max_swipe_depth = ev.swipe_depth;
    if (typeof ev.time_in_feed_ms === 'number') max.time_in_feed_ms = ev.time_in_feed_ms;

    const inc: Record<string, number> = {
      cards_viewed: Number(ev.card_view) || 0,
      ad_views: Number(ev.ad_view) || 0,
      ad_clicks: Number(ev.ad_click) || 0,
      article_clicks: Number(ev.article_click) || 0,
    };
    // Ensure max_swipe_depth exists even before any swipe event.
    if (!('max_swipe_depth' in max)) inc.max_swipe_depth = 0;

    const update: Record<string, unknown> = {
      $setOnInsert: setOnInsert,
      $min: { started_at: ev.timestamp },
      $max: max,
      $inc: inc,
    };
    if (ev.exited) update.$set = { exited: true };

    const doUpdate = () =>
      col.updateOne({ session_id: ev.session_id }, update as any, { upsert: true });
    try {
      await withMongoRetry(doUpdate);
    } catch (err: any) {
      if (err?.code === 11000) {
        // Upsert race on a brand-new session — the doc now exists; retry once.
        await withMongoRetry(doUpdate);
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('feed session rollup error', err);
  }
}
