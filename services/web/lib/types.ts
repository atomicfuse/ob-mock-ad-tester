export type AdStatus = 'active' | 'paused';

export interface MockAd {
  ad_id: string;
  campaign: string;
  title: string;
  brand: string;
  image_url: string;
  landing_page: string;
  status: AdStatus;
  created_at: Date;
  updated_at: Date;
}

export interface MockAdInput {
  ad_id: string;
  campaign: string;
  title: string;
  brand: string;
  image_url: string;
  landing_page: string;
  status?: AdStatus;
}

export interface MockAdImpression {
  ad_id: string;
  campaign: string;
  page: string;
  timestamp: Date;
}

export interface MockAdClick {
  ad_id: string;
  campaign: string;
  landing_page: string;
  page: string;
  timestamp: Date;
}

export interface AdMetrics {
  ad_id: string;
  campaign: string;
  status: AdStatus;
  title: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

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

export type AdMode = 'mock' | 'live';

export interface FeedInitiative {
  feed_id: string;
  name: string;
  status: FeedStatus;
  trigger: FeedTrigger;
  ad_ratio: number;
  ad_mode: AdMode;
  live_ad_snippet: string;
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

export type FeedItemKind = 'article' | 'ad';

export interface FeedItem {
  feed_id: string;
  position: number;
  kind: FeedItemKind;
  url?: string;
  fetched?: FeedFetchedMeta;
  override?: FeedItemOverride;
  ad_id?: string;
  created_at: Date;
  updated_at: Date;
}

// What the public /api/feed endpoint returns per item — articles enriched
// and ads resolved against live mock_ads.
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
  ad_title?: string;
  ad_brand?: string;
  ad_image?: string;
  ad_landing_page?: string;
  ad_campaign?: string;
}

export interface FeedReadResponse {
  feed_id: string;
  trigger: FeedTrigger;
  items: FeedItemResolved[];
  ad_mode: AdMode;
  live_ad_snippet?: string;
}

export interface FeedImpression {
  feed_id: string;
  position: number;
  kind: FeedItemKind;
  item_ref: string;
  page: string;
  timestamp: Date;
}

export interface FeedClick extends FeedImpression {
  landing_url: string;
}

export interface FeedExit {
  feed_id: string;
  exit_position: number;
  items_viewed: number;
  time_in_feed_ms: number;
  page: string;
  timestamp: Date;
}

export interface FeedItemMetrics {
  position: number;
  kind: FeedItemKind;
  label: string; // title for articles, "ad <ad_id>" for ads
  impressions: number;
  clicks: number;
  ctr: number;
  exits: number;
}

export interface FeedAnalytics {
  feed_id: string;
  items: FeedItemMetrics[];
  totals: {
    entries: number; // = impressions at position 0
    exits: number;
    avg_cards_viewed: number;
    avg_time_in_feed_ms: number;
  };
}
