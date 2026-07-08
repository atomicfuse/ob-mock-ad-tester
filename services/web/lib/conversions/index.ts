import { capiLog } from '../mongo';
import { metaSink, standardEventAlias } from './meta';
import type { ConversionEvent, ConversionSink } from './types';

export type { ConversionEvent, ConversionSink } from './types';

// Registered sinks — Google (gclid) / TikTok (ttclid) implement the same
// interface later and get appended here.
const SINKS: ConversionSink[] = [metaSink];

/** Run one sink call (primary or standard-event alias) and log its own
 *  outcome under `loggedEventName` — so the admin CAPI activity log shows
 *  the custom event and its alias as two distinct, independently-verifiable
 *  rows (e.g. "ad_click: ok" and "Subscribe: ok"). */
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

/** Dispatch a qualifying event to every configured sink — and, when a
 *  standard-event dictionary entry exists (Meta only), ALSO dual-fire it
 *  under that standard name with a distinct event_id. The primary custom
 *  event is never replaced or skipped because of the alias. Awaited by the
 *  tracking handlers with a short per-sink timeout — sendBeacon ignores the
 *  response, so the added latency is invisible to users, while a detached
 *  promise would be un-observable on crash. Never throws. */
export async function dispatchConversions(e: ConversionEvent): Promise<void> {
  const active = SINKS.filter((s) => s.isConfigured());
  if (active.length === 0) return; // feature off — no log spam

  await Promise.all(
    active.flatMap((sink) => {
      const calls = [dispatchOne(sink, e, e.name)];
      if (sink.id === 'meta') {
        const alias = standardEventAlias(e);
        if (alias) {
          calls.push(
            dispatchOne(sink, e, alias, {
              eventNameOverride: alias,
              eventIdOverride: `${e.eventId}:std`,
            }),
          );
        }
      }
      return calls;
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
