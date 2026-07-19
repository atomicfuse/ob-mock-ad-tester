import { NextRequest, NextResponse } from 'next/server';
import { feeds } from '../../../../lib/mongo';
import { applyAdRatio } from '../../../../lib/feed-order';
import type { FeedInitiative } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const col = await feeds();
  const list = await col.find({}).sort({ created_at: -1 }).toArray();
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<FeedInitiative>;
  if (typeof body.feed_id !== 'string' || !body.feed_id) {
    return NextResponse.json({ error: 'feed_id is required' }, { status: 400 });
  }
  if (!/^[a-z0-9_-]+$/i.test(body.feed_id)) {
    return NextResponse.json(
      { error: 'feed_id must be alphanumeric (letters, digits, _ and -)' },
      { status: 400 },
    );
  }
  if (typeof body.name !== 'string' || !body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const col = await feeds();
  const exists = await col.findOne({ feed_id: body.feed_id });
  if (exists) {
    return NextResponse.json({ error: 'feed_id already exists' }, { status: 409 });
  }

  const now = new Date();
  const trigger = body.trigger ?? { mode: 'scroll' as const, scroll_depth_px: 1500 };
  const nextFeeds = Array.isArray(body.next_feeds)
    ? body.next_feeds
        .filter(
          (id): id is string =>
            typeof id === 'string' && /^[a-z0-9_-]+$/i.test(id) && id !== body.feed_id,
        )
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, 12)
    : [];
  const doc: FeedInitiative = {
    feed_id: body.feed_id,
    name: body.name,
    status: body.status === 'paused' ? 'paused' : 'active',
    // 'facts' marks a swipe-deck initiative (managed under /admin/facts).
    // Immutable after create — PATCH never touches it.
    ...(body.feed_type === 'facts' ? { feed_type: 'facts' as const } : {}),
    trigger: {
      mode: trigger.mode === 'manual' ? 'manual' : 'scroll',
      scroll_depth_px:
        typeof trigger.scroll_depth_px === 'number' && trigger.scroll_depth_px >= 0
          ? trigger.scroll_depth_px
          : 1500,
      cta_position: trigger.cta_position || 'sticky-bottom-center',
      cta_text: typeof trigger.cta_text === 'string' ? trigger.cta_text : '\uD83D\uDCF0 See more stories',
      cta_bg_color: typeof trigger.cta_bg_color === 'string' ? trigger.cta_bg_color : '#111111',
      cta_text_color: typeof trigger.cta_text_color === 'string' ? trigger.cta_text_color : '#ffffff',
      cta_size: trigger.cta_size || 'medium',
    },
    ad_ratio: typeof body.ad_ratio === 'number' && body.ad_ratio >= 1 ? body.ad_ratio : 3,
    ad_mode: body.ad_mode === 'live' ? 'live' : 'demo',
    ...(typeof body.default_subid === 'string' && body.default_subid
      ? { default_subid: body.default_subid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) }
      : {}),
    live_ad_head_script: typeof body.live_ad_head_script === 'string' ? body.live_ad_head_script : '',
    live_ad_snippet: typeof body.live_ad_snippet === 'string' ? body.live_ad_snippet : '',
    live_ads_per_snippet:
      typeof body.live_ads_per_snippet === 'number' && body.live_ads_per_snippet >= 1
        ? Math.floor(body.live_ads_per_snippet)
        : 1,
    ...(typeof body.live_ad_dedupe === 'boolean' ? { live_ad_dedupe: body.live_ad_dedupe } : {}),
    ...(nextFeeds.length > 0 ? { next_feeds: nextFeeds } : {}),
    created_at: now,
    updated_at: now,
  };
  await col.insertOne(doc);
  await applyAdRatio(doc.feed_id);
  return NextResponse.json(doc, { status: 201 });
}
