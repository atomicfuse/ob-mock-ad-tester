# Feed Measurement & Tracking

The feed is a content-arbitrage funnel: paid campaigns (Meta) drive users to articles on our
sites → the embedded feed widget opens (**one feed open = one session**) → users swipe article
and ad cards → ad clicks generate SSP revenue reported by **sub ID**. This document is the
single source of truth for what we measure, where it goes, and the naming conventions that
join the three systems (Meta ↔ internal analytics ↔ SSP revenue dashboard).

## Event taxonomy

| Event | Trigger | Stored in | Sent to Meta as | Purpose / KPI |
|---|---|---|---|---|
| `session_start` | feed overlay opens | `feed_events` | `FeedSession` | session count; Meta volume event (cost/session in Ads Manager) |
| `card_view` | card ≥60% visible for 500ms, once per position per session | `feed_impressions` (placement `card`) | — | funnel / per-position analytics |
| `ad_view` | an ad card or under-article banner is viewed (view = the card was viewed; provider scripts are never consulted) | `feed_impressions` (kind `ad`) | — | ad economics, ad views/session |
| `swipe_depth` | user first reaches swipe 1 / 2 / 4 / 6 / 8 / 10 (each fires once) — `depth:1` fires after exactly one swipe, added specifically to catch churn right after card 1 | `feed_events` | `SwipeDepth1..10` (subset via `META_CAPI_EVENTS`) + standard-event dual-fire, see below | engagement grading; Meta optimization proxy |
| `article_click` | article card clicked (navigates to the article) | `feed_clicks` (kind `article`) | `ArticleContinuation` + standard-event dual-fire | continuation rate |
| `ad_click` | ad card or banner slot clicked | `feed_clicks` (kind `ad`) | `AdClick` + standard-event dual-fire | revenue proxy — the primary optimization event |
| `feed_exit` | close button / pagehide | `feed_exits` | — | session duration, exit position |

Every event carries `session_id` (minted per feed open) and the session's `attribution`
object. A rollup doc per session is upserted into **`feed_sessions`** (counters, max swipe
depth, attribution) — all "By source" analytics read only this collection.

**Meta dedup `event_id` scheme** (deterministic — a future browser pixel using the same
convention dedups automatically within Meta's 48h window):
`<session_id>:FeedSession` · `<session_id>:SwipeDepth<N>` · `<session_id>:AdClick:<position>` ·
`<session_id>:ArticleContinuation:<position>` · standard-event aliases append `:std` to their
primary event's id, so Meta never dedups the alias against the custom-named original.

## Standard-event dual-fire (Meta delivery signal)

`session_start`, `swipe_depth`, `ad_click`, and `article_click` all **also** dual-fire under a
Meta standard event name (`META_STANDARD_EVENT_MAP` in `.env.example`), alongside — never
replacing — the custom event above. Custom Conversions, By-source analytics, and everything
else keep reading the custom names untouched; this only adds cross-advertiser training signal
for Meta's delivery algorithm.

| Our event | Standard alias | Note |
|---|---|---|
| `session_start` | *(none)* | Nothing in Meta's 17 standard events honestly describes "opened a feed overlay" — left unmapped rather than force a bad fit |
| `swipe_depth:1` | `ViewContent` | Catches the biggest churn cliff (bounced after card 1) |
| `swipe_depth:4` | `Lead` | Escalating content-engagement ladder |
| `swipe_depth:8` | `AddToCart` | |
| `article_click` | `InitiateCheckout` | |
| `ad_click` | `Subscribe` | ⚠️ Highest-risk mapping here — `Subscribe` means "started a *paid* subscription," not applicable to a native-ad click. Deliberate choice: put the strongest-sounding standard event on the highest-value action. **Never** alias anything to `Purchase` — Meta polices it strictly and it's reserved for real transactions. |

If Meta ever flags event-quality on the account, this table is the first thing to revisit —
loosen `article_click`/`ad_click` toward safer aliases (`Lead`, `ViewContent`) or unmap them via
`META_STANDARD_EVENT_MAP`, no code change required.

## Attribution: URL parameter convention (set on every Meta ad)

Add this to the **URL parameters** field of every ad (Meta fills the `{{...}}` macros;
`fbclid` is appended automatically):

```
utm_source=facebook&utm_medium=paid&cmp={{campaign.id}}&ast={{adset.id}}&ad={{ad.id}}&plc={{placement}}&sub=<your_subid>
```

- `sub` is the operator-chosen sub ID (e.g. `srchgrd2_fb1`) — the join key to the SSP dashboard.
- Captured keys: `utm_source/medium/campaign/term/content, fbclid, gclid, ttclid, cmp, ast, ad, plc, sub` + `referrer` hostname + `_fbp`/`_fbc` cookies (fbc constructed from fbclid when the cookie is absent).
- **First-touch:** attribution is stored in `sessionStorage` for 30 min, so a continuation
  click to another of our articles (whose URL has no params) stays attributed to the original
  campaign. Cross-domain continuation loses attribution (sessionStorage is per-origin).
- Organic visits simply have no attribution — they group as `(none)` internally and are
  skipped for Meta by default (`META_REQUIRE_FB_IDS=true`).

## Sub-ID macros in Real Ad snippets

Write snippets with placeholders instead of hardcoded sub IDs — one snippet serves every
campaign/adset/placement:

```
subid={{SUBID}}-{{PLACEMENT}}     →      subid=srchgrd2_fb1-p3
```

- `{{SUBID}}` → the session's `sub` URL param → the feed's **Default sub ID** → the feed id.
  Allowed in both head script and snippet.
- `{{FEED}}` → the feed id. Session-constant, so it's allowed in both head script and snippet.
  Use it when one shared snippet serves multiple feeds and you still want per-feed rows in the
  SSP (e.g. `subid={{SUBID}}-{{FEED}}` → `<sub>-wtpop`).
- `{{PLACEMENT}}` → `p<position>` for ad cards, `ban<position>` for under-article banners.
  **Snippet only — never in the head script** (per-slot values there would multiply the
  once-per-page provider loader). Omit this token entirely if you don't want per-placement
  granularity (e.g. `subid={{SUBID}}-{{FEED}}` for adset×feed reporting without placement).
- Values are sanitized to `[A-Za-z0-9_-]`, max 64 chars. Unknown `{{...}}` tokens are left
  untouched (provider macros keep working).

## Meta CAPI

Server-side events POST to `graph.facebook.com/{META_GRAPH_VERSION}/{META_PIXEL_ID}/events`,
one event per request. `user_data` = client IP + user agent + `fbp`/`fbc` (sent raw — Meta
requires these unhashed). Every attempt (ok / error / skipped+reason) is logged to `capi_log`
(30-day TTL); the analytics page shows an error count for the last 24h.

Env (see `.env.example`): `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_GRAPH_VERSION`,
`META_CAPI_EVENTS`, `META_REQUIRE_FB_IDS`, `META_TEST_EVENT_CODE` (QA only — remove in prod).
Unset = the sink is off; everything else keeps working.

Adding Google Ads / TikTok later: implement the `ConversionSink` interface in
`lib/conversions/` (gclid / ttclid are already captured).

## KPI definitions

| KPI | Formula | Where |
|---|---|---|
| Cost / session | Ads Manager cost per `FeedSession` (create a Custom Conversion) | Meta |
| Session engagement | swipe-depth distribution (% sessions ≥2/4/6/8/10 — the By-source table's existing columns; `swipe_depth:1` is recorded but not yet its own column there) + cards/session | internal, By source |
| Continuation rate | article_clicks ÷ sessions | internal, By source |
| Ad clicks / session | ad_clicks ÷ sessions | internal, By source |
| Ad-click-session rate | sessions with ≥1 ad click ÷ sessions | internal, By source |
| Revenue / session (future) | SSP revenue(subid) ÷ sessions(subid) — joined by the sub-ID convention | manual v1 |

## Operator setup checklist

1. Add the URL-parameter template to every Meta ad (above).
2. Install the Meta base pixel (PageView) on article domains — mints first-party `_fbp`/`_fbc`,
   materially lifts match quality, enables browser+server dedup later.
3. Verify article domains in Business Manager.
4. Set the `META_*` env vars; QA with `META_TEST_EVENT_CODE` in Events Manager → Test events;
   remove the test code for production.
5. Create Custom Conversions for `FeedSession` and `AdClick` to optimize ad sets and get cost
   columns.
6. Rewrite Real Ad snippets to use `{{SUBID}}-{{PLACEMENT}}` instead of hardcoded sub IDs, and
   set each feed's **Default sub ID** for organic traffic.
