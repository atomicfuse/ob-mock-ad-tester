/**
 * Demo mode: keep the real-ad provider script, but point it at demo content.
 *
 * Rewrites two keys inside a provider snippet / head-script string:
 *   feedid: '<anything>'  →  feedid: 'demo_default'
 *   auth:   '<anything>'  →  auth:   'demo'
 *
 * Everything else — subid macros, qs params, element ids, layout options —
 * passes through byte-for-byte. Matching is robust to single or double quotes
 * and arbitrary whitespace around the colon, and the key itself may be bare
 * (`feedid:`), single-quoted (`'feedid':`), or double-quoted (`"feedid":`,
 * JSON-style). Strings without these keys are returned unchanged.
 *
 * Pattern anatomy: `(['"]?)` optionally captures a quote around the key and
 * `\2` requires the matching close quote; `\b` before the key preserves the
 * original bare-key boundary behavior (so `author:`, `oauth:`, `auth_token:`
 * and `feedid=` inside a qs string stay untouched).
 */
const FEEDID_REWRITE = /((['"]?)\bfeedid\2\s*:\s*)(['"])[^'"]*\3/g;
const AUTH_REWRITE = /((['"]?)\bauth\2\s*:\s*)(['"])[^'"]*\3/g;

/** Any feedid-key-followed-by-colon occurrence (bare or quoted key). */
const FEEDID_KEY = /(['"]?)\bfeedid\1\s*:/g;
/** A feedid key whose value has been rewritten to the demo feed. */
const FEEDID_DEMO = /(['"]?)\bfeedid\1\s*:\s*(['"])demo_default\2/g;

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

export function rewriteSnippetForDemo(text: string): string {
  if (!text) return text;
  const rewritten = text
    .replace(FEEDID_REWRITE, '$1$3demo_default$3')
    .replace(AUTH_REWRITE, '$1$3demo$3');

  // Safety net: if the snippet still contains a feedid key whose value was
  // not rewritten to demo_default, the rewrite silently missed it — surface
  // that loudly (but never throw; serving must not break).
  if (countMatches(rewritten, FEEDID_KEY) > countMatches(rewritten, FEEDID_DEMO)) {
    console.warn(
      '[demo-ads] snippet contains feedid but demo rewrite did not match — real ads may serve in demo mode'
    );
  }

  return rewritten;
}
