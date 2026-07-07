import type { Attribution } from '../types';

export type ConversionEventName = 'session_start' | 'swipe_depth' | 'ad_click' | 'article_click';

export interface ConversionEvent {
  name: ConversionEventName;
  /** Deterministic dedup key, e.g. "<session_id>:FeedSession" — a future
   *  browser pixel firing the same convention dedups within Meta's 48h window. */
  eventId: string;
  occurredAt: Date;
  sourceUrl: string; // article page URL (event_source_url)
  feedId: string;
  sessionId: string;
  attribution: Attribution | null;
  client: { ip?: string; userAgent?: string };
  props?: { depth?: number; position?: number; placement?: string };
}

export interface SinkResult {
  ok: boolean;
  skipped?: string; // reason when the sink declined the event
  httpStatus?: number;
  error?: string;
  traceId?: string;
}

export interface ConversionSink {
  readonly id: 'meta' | 'google' | 'tiktok';
  /** Env present — unconfigured sinks are ignored entirely (no log spam). */
  isConfigured(): boolean;
  /** Whether this event qualifies for this sink (event subset, match keys). */
  accepts(e: ConversionEvent): { ok: true } | { ok: false; reason: string };
  /** Never throws; must respect opts.timeoutMs. eventNameOverride/eventIdOverride
   *  let the dispatcher fire the SAME underlying event under a second, aliased
   *  name (e.g. a Meta standard event) without touching the primary event. */
  send(
    e: ConversionEvent,
    opts?: { timeoutMs?: number; eventNameOverride?: string; eventIdOverride?: string },
  ): Promise<SinkResult>;
}
