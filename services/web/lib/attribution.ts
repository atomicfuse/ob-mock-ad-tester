import type { Attribution } from './types';

// Whitelisted keys → max value length. fbclid/fbc are Meta's case-sensitive
// match keys: if oversized we DROP the key rather than truncate (a truncated
// value can never match and would poison CAPI match quality).
const KEY_LIMITS: Record<keyof Attribution, number> = {
  utm_source: 200,
  utm_medium: 200,
  utm_campaign: 200,
  utm_term: 200,
  utm_content: 200,
  fbclid: 1000,
  gclid: 1000,
  ttclid: 1000,
  cmp: 200,
  ast: 200,
  ad: 200,
  plc: 200,
  sub: 200,
  fbp: 1000,
  fbc: 1000,
  referrer: 200,
};

const NO_TRUNCATE = new Set<keyof Attribution>(['fbclid', 'fbc', 'fbp', 'gclid', 'ttclid']);

/** Validate an attribution object sent by the widget. Unknown keys are
 *  dropped; values must be strings; whole object capped at 4KB. Returns null
 *  when nothing usable remains (organic traffic). Never throws. */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    if (JSON.stringify(raw).length > 4096) return null;
  } catch {
    return null;
  }
  const out: Attribution = {};
  let any = false;
  for (const key of Object.keys(KEY_LIMITS) as (keyof Attribution)[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== 'string' || v.length === 0) continue;
    const limit = KEY_LIMITS[key];
    if (v.length > limit) {
      if (NO_TRUNCATE.has(key)) continue; // drop, never truncate match keys
      out[key] = v.slice(0, limit);
    } else {
      out[key] = v;
    }
    any = true;
  }
  return any ? out : null;
}
