import { capiLog } from '../mongo';
import { metaSink, standardEventAlias } from './meta';
import type { ConversionEvent, ConversionSink } from './types';

export type { ConversionEvent, ConversionSink } from './types';

// Registered sinks — Google (gclid) / TikTok (ttclid) implement the same
// interface later and get appended here.
const SINKS: ConversionSink[] = [metaSink];

/** Run one sink call and log its outcome under `loggedEventName` (the internal
 *  event identifier, e.g. "ad_click") — so the admin CAPI activity log shows a
 *  single, verifiable row per action. When a standard-event alias applies, the
 *  caller passes `eventNameOverride` so the event reaches Meta under its
 *  standard name (e.g. "Subscribe") while the row is still logged under the
 *  internal name, letting the UI render "ad_click (Subscribe)". */
async function dispatchOne(
  sink: ConversionSink,
  e: ConversionEvent,
  loggedEventName: string,
  override?: { eventNameOverride?: string; eventIdOverride?: string },
): Promise<void> {
  let status: 'ok' | 'error' | 'skipped' = 'ok';
  let skip_reason: string | undefined;
  let http_status: number | undefined;
  let error: string | undefined;
  let fbtrace_id: string | undefined;

  const verdict = sink.accepts(e);
  if (!verdict.ok) {
    status = 'skipped';
    skip_reason = verdict.reason;
  } else {
    const res = await sink.send(e, { timeoutMs: 3000, ...override });
    if (res.ok) {
      status = 'ok';
    } else if (res.transient) {
      // Timeout / network blip — no provider verdict. Record as a benign skip so
      // it is not counted as a hard CAPI error the operator must act on.
      status = 'skipped';
      skip_reason = res.error ?? 'transient';
    } else {
      status = 'error';
      error = res.error;
    }
    http_status = res.httpStatus;
    fbtrace_id = res.traceId;
  }

  try {
    const col = await capiLog();
    await col.insertOne({
      ts: new Date(),
      sink: sink.id,
      event_name: loggedEventName,
      event_id: override?.eventIdOverride ?? e.eventId,
      session_id: e.sessionId,
      feed_id: e.feedId,
      status,
      ...(skip_reason ? { skip_reason } : {}),
      ...(http_status !== undefined ? { http_status } : {}),
      ...(error ? { error } : {}),
      ...(fbtrace_id ? { fbtrace_id } : {}),
      ...(process.env.META_TEST_EVENT_CODE ? { test: true } : {}),
    });
  } catch (logErr) {
    console.error('capi_log write error', logErr);
  }
}

/** Dispatch a qualifying event to every configured sink — exactly ONE event
 *  per action. When a standard-event dictionary entry exists (Meta only), the
 *  event is sent UNDER that standard name (e.g. ad_click → "Subscribe") using
 *  the primary event_id; otherwise it is sent under its custom name (e.g.
 *  session_start → "FeedSession"). Either way a single row is logged under the
 *  internal event name. Awaited by the tracking handlers with a short per-sink
 *  timeout — sendBeacon ignores the response, so the added latency is invisible
 *  to users, while a detached promise would be un-observable on crash. Never
 *  throws. */
export async function dispatchConversions(e: ConversionEvent): Promise<void> {
  const active = SINKS.filter((s) => s.isConfigured());
  if (active.length === 0) return; // feature off — no log spam

  await Promise.all(
    active.map((sink) => {
      if (sink.id === 'meta') {
        const alias = standardEventAlias(e);
        if (alias) {
          // Send to Meta under the standard name, but log under the internal
          // name (parens display) and keep the primary event_id — no `:std`.
          return dispatchOne(sink, e, e.name, { eventNameOverride: alias });
        }
      }
      return dispatchOne(sink, e, e.name);
    }),
  ).catch(() => {});
}

/** Client ip/ua from a tracking request — first x-forwarded-for hop is the
 *  real client on CloudGrid's proxy chain. */
export function clientFromRequest(req: Request): { ip?: string; userAgent?: string } {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;
  return { ip: ip || undefined, userAgent };
}
