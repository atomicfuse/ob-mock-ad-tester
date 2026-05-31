import { NextRequest, NextResponse } from 'next/server';
import { feeds } from '../../../../lib/mongo';
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
  const doc: FeedInitiative = {
    feed_id: body.feed_id,
    name: body.name,
    status: body.status === 'paused' ? 'paused' : 'active',
    trigger: {
      mode: trigger.mode === 'manual' ? 'manual' : 'scroll',
      scroll_depth_px:
        typeof trigger.scroll_depth_px === 'number' && trigger.scroll_depth_px >= 0
          ? trigger.scroll_depth_px
          : 1500,
    },
    ad_ratio: typeof body.ad_ratio === 'number' && body.ad_ratio >= 1 ? body.ad_ratio : 3,
    ad_mode: body.ad_mode === 'live' ? 'live' : 'mock',
    live_ad_snippet: typeof body.live_ad_snippet === 'string' ? body.live_ad_snippet : '',
    created_at: now,
    updated_at: now,
  };
  await col.insertOne(doc);
  return NextResponse.json(doc, { status: 201 });
}
