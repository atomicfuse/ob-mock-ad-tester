import type { ConversionEvent, ConversionSink, SinkResult } from './types';

// Meta Conversions API sink. Sends one event per request (a batch is rejected
// wholesale if any event in it is invalid). user_data fields ip/ua/fbp/fbc are
// sent RAW — Meta requires them unhashed.

const MAX_SKEW_MS = 10 * 60 * 1000; // clamp event_time to server time beyond this

function metaEventName(e: ConversionEvent, overrideName?: string): string {
  if (overrideName) return overrideName;
  switch (e.name) {
    case 'session_start':
      return 'FeedSession';
    case 'swipe_depth':
      return `SwipeDepth${e.props?.depth ?? 0}`;
    case 'ad_click':
      return 'AdClick';
    case 'article_click':
      return 'ArticleContinuation';
  }
}

/** Parse META_CAPI_EVENTS, e.g. "session_start,swipe_depth:1,swipe_depth:4,swipe_depth:8,ad_click,article_click".
 *  swipe_depth entries carry the thresholds that go to Meta (all are recorded internally). */
function enabledEvents(): { names: Set<string>; depths: Set<number> } {
  const raw =
    process.env.META_CAPI_EVENTS ??
    'session_start,swipe_depth:1,swipe_depth:4,swipe_depth:8,ad_click,article_click';
  const names = new Set<string>();
  const depths = new Set<number>();
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [name, arg] = part.split(':');
    if (name === 'swipe_depth' && arg) {
      names.add('swipe_depth');
      const d = parseInt(arg, 10);
      if (Number.isFinite(d)) depths.add(d);
    } else {
      names.add(name);
    }
  }
  return { names, depths };
}

/** Parse META_STANDARD_EVENT_MAP, e.g.
 *  "swipe_depth:1:ViewContent,swipe_depth:4:Lead,swipe_depth:8:AddToCart,ad_click:Subscribe,article_click:InitiateCheckout".
 *  Keys are "eventName" or "eventName:depth" (for swipe_depth, which needs a
 *  distinct alias per threshold). Dual-fires the mapped standard event
 *  alongside — never replacing — the primary custom-named event. */
function standardEventMap(): Map<string, string> {
  const raw =
    process.env.META_STANDARD_EVENT_MAP ??
    'swipe_depth:1:ViewContent,swipe_depth:4:Lead,swipe_depth:8:AddToCart,ad_click:Subscribe,article_click:InitiateCheckout';
  const map = new Map<string, string>();
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const segments = part.split(':');
    if (segments.length === 2) {
      map.set(segments[0], segments[1]);
    } else if (segments.length === 3) {
      map.set(`${segments[0]}:${segments[1]}`, segments[2]);
    }
  }
  return map;
}

/** Standard-event alias for this event, if the dictionary maps one — else
 *  undefined (no dual-fire). */
export function standardEventAlias(e: ConversionEvent): string | undefined {
  const map = standardEventMap();
  if (e.name === 'swipe_depth' && typeof e.props?.depth === 'number') {
    return map.get(`swipe_depth:${e.props.depth}`);
  }
  return map.get(e.name);
}

/** Standard-event alias for a logged event name string, or null if none.
 *  String-based counterpart to standardEventAlias for the CAPI activity log,
 *  which stores only the event name (no props). Looks up the same dictionary
 *  by the raw name; depth-specific swipe_depth aliases (keyed "swipe_depth:N")
 *  can't be resolved from the bare "swipe_depth" name and yield null. */
export function standardAliasForEventName(name: string): string | null {
  return standardEventMap().get(name) ?? null;
}

export const metaSink: ConversionSink = {
  id: 'meta',

  isConfigured() {
    return Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
  },

  accepts(e: ConversionEvent) {
    const { names, depths } = enabledEvents();
    if (!names.has(e.name)) return { ok: false, reason: 'event_disabled' };
    if (e.name === 'swipe_depth' && depths.size > 0 && !depths.has(e.props?.depth ?? -1)) {
      return { ok: false, reason: 'depth_disabled' };
    }
    // client_user_agent is required for website events.
    if (!e.client.userAgent) return { ok: false, reason: 'no_ua' };
    const requireFbIds = process.env.META_REQUIRE_FB_IDS !== 'false';
    if (requireFbIds && !e.attribution?.fbc && !e.attribution?.fbp) {
      return { ok: false, reason: 'no_fb_ids' };
    }
    return { ok: true };
  },

  async send(
    e: ConversionEvent,
    opts?: { timeoutMs?: number; eventNameOverride?: string; eventIdOverride?: string },
  ): Promise<SinkResult> {
    try {
      const pixelId = process.env.META_PIXEL_ID!;
      const token = process.env.META_CAPI_TOKEN!;
      const version = process.env.META_GRAPH_VERSION || 'v25.0';

      const now = Date.now();
      const occurred = e.occurredAt.getTime();
      const eventTimeMs = Math.abs(now - occurred) > MAX_SKEW_MS ? now : occurred;

      const userData: Record<string, string> = {
        client_user_agent: e.client.userAgent!,
      };
      if (e.client.ip) userData.client_ip_address = e.client.ip;
      if (e.attribution?.fbp) userData.fbp = e.attribution.fbp;
      if (e.attribution?.fbc) userData.fbc = e.attribution.fbc;

      const customData: Record<string, string | number> = { feed_id: e.feedId };
      if (e.attribution?.sub) customData.sub = e.attribution.sub;
      if (e.attribution?.plc) customData.plc = e.attribution.plc;
      if (typeof e.props?.depth === 'number') customData.depth = e.props.depth;
      if (typeof e.props?.position === 'number') customData.position = e.props.position;
      if (e.props?.placement) customData.placement = e.props.placement;

      const body: Record<string, unknown> = {
        data: [
          {
            event_name: metaEventName(e, opts?.eventNameOverride),
            event_time: Math.floor(eventTimeMs / 1000),
            event_id: opts?.eventIdOverride ?? e.eventId,
            action_source: 'website',
            event_source_url: e.sourceUrl,
            user_data: userData,
            custom_data: customData,
          },
        ],
      };
      if (process.env.META_TEST_EVENT_CODE) {
        body.test_event_code = process.env.META_TEST_EVENT_CODE;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 3000);
      try {
        const res = await fetch(
          `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        const json: any = await res.json().catch(() => null);
        if (res.ok) {
          return { ok: true, httpStatus: res.status, traceId: json?.fbtrace_id };
        }
        return {
          ok: false,
          httpStatus: res.status,
          error: json?.error?.message ?? `HTTP ${res.status}`,
          traceId: json?.error?.fbtrace_id,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      // No HTTP response reached us (timeout/abort, network reset, DNS). These
      // are transient and self-healing — flag them so the dispatcher records a
      // benign `skipped`, not a hard `error` that alarms the admin dashboard.
      return {
        ok: false,
        transient: true,
        error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'send failed'),
      };
    }
  },
};
