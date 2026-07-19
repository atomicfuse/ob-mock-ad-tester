export type AdStatus = 'active' | 'paused';

// --- Feed feature ---

export type FeedStatus = 'active' | 'paused';

export type CtaPosition =
  | 'sticky-bottom-center'
  | 'sticky-bottom-left'
  | 'sticky-bottom-right'
  | 'sticky-top-center'
  | 'sticky-top-left'
  | 'sticky-top-right'
  | 'inline';

export type CtaSize = 'small' | 'medium' | 'large';

export interface FeedTrigger {
  mode: 'scroll' | 'manual';
  scroll_depth_px: number;
  /** CTA chip customisation (manual mode only) */
  cta_position?: CtaPosition;
  cta_text?: string;
  cta_bg_color?: string;
  cta_text_color?: string;
  cta_size?: CtaSize;
}

/** 'live' — ad slots render the feed's real-ad provider snippet as-is.
 *  'demo' — identical to 'live' (same snippets, slots, tracking), except the
 *  server rewrites `feedid` → 'demo_default' and `auth` → 'demo' inside every
 *  snippet at resolution time so the provider serves demo content. */
export type AdMode = 'live' | 'demo';

/** 'feed' — scrolling article feed (default, absent on legacy docs).
 *  'facts' — swipeable fact deck. Same collections, tracking, and analytics;
 *  only the admin surface and the widget consumption UI differ. */
export type FeedType = 'feed' | 'facts';

export interface RealAd {
  real_ad_id: string;
  name: string;
  head_script: string;
  snippet: string;
  ads_per_snippet: number;
  created_at: Date;
  updated_at: Date;
}

export interface FeedInitiative {
  feed_id: string;
  name: string;
  status: FeedStatus;
  /** Absent = 'feed'. 'facts' initiatives are managed under /admin/facts and
   *  render as a swipe deck instead of a scroll feed. Immutable after create. */
  feed_type?: FeedType;
  trigger: FeedTrigger;
  ad_ratio: number;
  ad_mode: AdMode;
  real_ad_id?: string;
  /** Fallback for the {{SUBID}} snippet macro when the session URL carries no
   *  `sub` param (organic traffic). Defaults to feed_id when absent. */
  default_subid?: string;
  live_ad_head_script: string;
  live_ad_snippet: string;
  /** How many ad cards one live snippet produces. 1 → full-bleed single card;
   *  >1 → the provider's own multi-card block renders in a scrollable card. */
  live_ads_per_snippet: number;
  /** When true, widget collapses live-ad cards whose creative was already
   *  shown this session. */
  live_ad_dedupe?: boolean;
  /** feed_ids offered on the end-of-feed chooser card. Non-empty makes the
   *  feed finite — it plays once and ends with the chooser instead of looping. */
  next_feeds?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface FeedFetchedMeta {
  title: string;
  image: string;
  description?: string;
  fetched_at: Date;
}

export interface FeedItemOverride {
  title?: string;
  image?: string;
}

export type FeedItemKind = 'article' | 'ad' | 'card' | 'fact';

export interface FeedItem {
  feed_id: string;
  position: number;
  kind: FeedItemKind;
  url?: string;
  fetched?: FeedFetchedMeta;
  override?: FeedItemOverride;
  ad_id?: string;
  /** kind === 'card' only — listicle card content. `image` is an external
   *  URL (no upload). */
  card?: { heading: string; text?: string; image: string };
  /** kind === 'fact' only — swipe-deck fact card content (text only). */
  fact?: { text: string };
  /** (articles and cards only) A RealAd whose snippet renders in a slot under
   *  this item's header. The publisher's injected script runs in that slot. */
  attached_real_ad_id?: string;
  created_at: Date;
  updated_at: Date;
}

// What the public /api/feed endpoint returns per item — articles enriched
// and ad slots emitted as bare live/demo slots.
export interface FeedItemResolved {
  position: number;
  kind: FeedItemKind;
  // article:
  title?: string;
  image?: string;
  description?: string;
  url?: string;
  // ad:
  ad_id?: string;
  // fact (swipe deck):
  fact?: { text: string };
  // article banner — a real-ad snippet to render in a slot under the header:
  banner_snippet?: string;
  banner_head_script?: string;
  banner_ad_id?: string;
  /** URL-safe slug for the widget's `?item=` query param. Present for
   *  articles, cards, and facts; absent for ads. */
  slug?: string;
}

/** One chooser option on the end-of-feed card — a target feed resolved to its
 *  display name and first content item's image. */
export interface NextFeedResolved {
  feed_id: string;
  name: string;
  image: string;
}

export interface FeedReadResponse {
  feed_id: string;
  /** Present (as 'facts') only for fact-deck initiatives — tells the widget to
   *  mount the swipe deck instead of the scroll overlay. */
  feed_type?: FeedType;
  /** Deck display name — sent only for fact decks (the deck start screen shows
   *  it). Regular feeds never render a name, so it stays absent for them. */
  name?: string;
  trigger: FeedTrigger;
  items: FeedItemResolved[];
  ad_mode: AdMode;
  live_ad_head_script?: string;
  live_ad_snippet?: string;
  live_ads_per_snippet?: number;
  default_subid?: string;
  /** When true, widget collapses live-ad cards whose creative was already
   *  shown this session. */
  live_ad_dedupe?: boolean;
  /** Resolved chooser options — present only when the feed has next_feeds
   *  configured and at least one target resolves. */
  next_feeds?: NextFeedResolved[];
}

// --- Measurement & attribution ---

/** Whitelisted acquisition params captured by the widget from the article page
 *  URL at feed open. All optional — absent entirely for organic traffic. */
export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  cmp?: string; // campaign id ({{campaign.id}})
  ast?: string; // adset id ({{adset.id}})
  ad?: string; // ad id ({{ad.id}})
  plc?: string; // placement ({{placement}})
  sub?: string; // operator-chosen sub id
  fbp?: string; // _fbp cookie, verbatim
  fbc?: string; // _fbc cookie, or constructed fb.1.<ts>.<fbclid>
  referrer?: string; // hostname only
}

export type FeedEventName =
  | 'session_start'
  | 'swipe_depth'
  | 'chooser_view'
  | 'feed_continue'
  // Fact-deck events. Swipes carry depth = position + 1 so the
  // {session_id, event, depth} unique index dedupes per position instead of
  // swallowing every swipe after the first.
  | 'swipe_knew'
  | 'swipe_blow'
  // Once per deck session (no depth) — reaching the score card.
  | 'deck_complete';

export interface FeedEvent {
  event: FeedEventName;
  feed_id: string;
  session_id: string;
  depth?: number;
  /** feed_continue only — the feed picked on the chooser card. */
  chosen_feed_id?: string;
  /** feed_id of the feed this session continued from via the chooser card. */
  arrived_from_feed?: string;
  attribution?: Attribution | null;
  page: string;
  timestamp: Date;
}

/** One doc per widget session, upserted on every tracking event. Powers
 *  sub-id / campaign / placement analytics without scanning event collections. */
export interface FeedSession {
  session_id: string;
  feed_id: string;
  attribution: Attribution | null;
  first_page?: string;
  started_at: Date;
  last_event_at: Date;
  cards_viewed: number;
  ad_views: number;
  ad_clicks: number;
  article_clicks: number;
  max_swipe_depth: number;
  time_in_feed_ms?: number;
  exited?: boolean;
  /** feed_id of the feed this session continued from via the chooser card. */
  arrived_from_feed?: string;
  /** session_id of the origin feed's session at the crossing. */
  origin_session_id?: string;
}

export interface CapiLogEntry {
  ts: Date;
  sink: string;
  event_name: string;
  event_id: string;
  session_id: string;
  feed_id: string;
  status: 'ok' | 'error' | 'skipped';
  skip_reason?: string;
  http_status?: number;
  error?: string;
  fbtrace_id?: string;
  test?: boolean;
}

export interface FeedImpression {
  feed_id: string;
  position: number;
  kind: FeedItemKind;
  item_ref: string;
  page: string;
  timestamp: Date;
  /** 'card' = a full article/ad card (default); 'banner' = the real-ad slot
   *  under an article. Banner impressions are kept out of the per-item article
   *  rows so they don't inflate article impression counts. */
  placement?: 'card' | 'banner';
  /** Random id minted by the widget per feed open — groups every event of one
   *  visit so per-session metrics are computed directly, not via proxies. */
  session_id?: string;
  attribution?: Attribution | null;
  /** feed_id of the feed this session continued from via the chooser card. */
  arrived_from_feed?: string;
}

export interface FeedClick extends FeedImpression {
  landing_url: string;
  /** Where the click happened: 'card' = a full ad/article card (default),
   *  'banner' = the real-ad slot under an article. Banner clicks are counted
   *  separately so they don't inflate the article row's clicks. */
  placement?: 'card' | 'banner';
}

export interface FeedExit {
  feed_id: string;
  exit_position: number;
  items_viewed: number;
  time_in_feed_ms: number;
  page: string;
  timestamp: Date;
  session_id?: string;
  attribution?: Attribution | null;
  /** feed_id of the feed this session continued from via the chooser card. */
  arrived_from_feed?: string;
}

export interface FeedItemDailyStats {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  exits: number;
}

export interface FeedItemMetrics {
  position: number;
  kind: FeedItemKind;
  label: string; // title for articles, "ad <ad_id>" for ads
  impressions: number;
  clicks: number;
  /** ALL ad clicks attributable to this position (kind === 'ad'): full-card
   *  ad-slot clicks (placement 'card') plus under-card real-ad banner clicks
   *  (placement 'banner'). Disjoint from `clicks`, which is content-only —
   *  the per-item table shows them as separate Clicks / Ad clicks columns. */
  adClicks?: number;
  ctr: number;
  exits: number;
  daily: FeedItemDailyStats[];
}

export interface FeedDailyStats {
  date: string; // YYYY-MM-DD
  entries: number;
  impressions: number;
  clicks: number;
  exits: number;
  sessions: number; // distinct session_ids seen that day
  ad_views: number; // ad impressions that day (cards + banners)
  ad_clicks: number; // ad clicks that day (cards + banners)
}

export interface AdPlacementStats {
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface FeedAnalytics {
  feed_id: string;
  items: FeedItemMetrics[];
  daily: FeedDailyStats[];
  /** True when this response was served from cache because the database was
   *  unavailable — numbers may be up to a few minutes old. */
  stale?: boolean;
  /** Internal placement comparison: full-card ad slots vs under-article
   *  banners, all-time. */
  ad_placements: {
    card: AdPlacementStats;
    banner: AdPlacementStats;
  };
  totals: {
    entries: number; // = impressions at position 0
    exits: number;
    avg_cards_viewed: number; // legacy, exit-event based
    avg_time_in_feed_ms: number; // legacy, exit-event based
    banner_clicks: number; // clicks on real-ad slots rendered under articles
    avg_ad_impressions_per_visitor: number; // legacy, entries-based proxy
    // Session-based metrics — computed directly from session_id-tagged events.
    sessions: number;
    avg_card_views_per_session: number; // card impressions / session
    avg_ad_views_per_session: number; // ad impressions (cards + banners) / session
    ad_clicks_per_session: number; // ad clicks (cards + banners) / session
    avg_session_ms: number; // last event − first event, averaged
  };
}
