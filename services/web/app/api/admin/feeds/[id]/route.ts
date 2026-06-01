import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems } from '../../../../../lib/mongo';
import type { FeedInitiative } from '../../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await feeds();
  const feed = await col.findOne({ feed_id: params.id });
  if (!feed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(feed);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as Partial<FeedInitiative>;
  const update: Partial<FeedInitiative> = { updated_at: new Date() };

  if (typeof body.name === 'string') update.name = body.name;
  if (body.status === 'active' || body.status === 'paused') update.status = body.status;
  if (body.trigger) {
    const cur = body.trigger;
    update.trigger = {
      mode: cur.mode === 'manual' ? 'manual' : 'scroll',
      scroll_depth_px:
        typeof cur.scroll_depth_px === 'number' && cur.scroll_depth_px >= 0
          ? cur.scroll_depth_px
          : 1500,
      cta_position: cur.cta_position || 'sticky-bottom-center',
      cta_text: typeof cur.cta_text === 'string' ? cur.cta_text : '\uD83D\uDCF0 See more stories',
      cta_bg_color: typeof cur.cta_bg_color === 'string' ? cur.cta_bg_color : '#111111',
      cta_text_color: typeof cur.cta_text_color === 'string' ? cur.cta_text_color : '#ffffff',
      cta_size: cur.cta_size || 'medium',
    };
  }
  if (typeof body.ad_ratio === 'number' && body.ad_ratio >= 1) update.ad_ratio = body.ad_ratio;
  if (body.ad_mode === 'live' || body.ad_mode === 'mock') update.ad_mode = body.ad_mode;
  if (typeof body.live_ad_snippet === 'string') update.live_ad_snippet = body.live_ad_snippet;

  const col = await feeds();
  const result = await col.findOneAndUpdate(
    { feed_id: params.id },
    { $set: update },
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const res = await feedsCol.deleteOne({ feed_id: params.id });
  if (res.deletedCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  await itemsCol.deleteMany({ feed_id: params.id });
  return NextResponse.json({ ok: true });
}
