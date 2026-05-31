import { NextRequest, NextResponse } from 'next/server';
import { feedItems, feeds, ads } from '../../../../lib/mongo';
import { fetchOgMeta } from '../../../../lib/og-fetch';
import type { FeedItem, FeedItemKind } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const feed_id = req.nextUrl.searchParams.get('feed_id');
  if (!feed_id) {
    return NextResponse.json({ error: 'feed_id required' }, { status: 400 });
  }
  const col = await feedItems();
  const list = await col.find({ feed_id }).sort({ position: 1 }).toArray();
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<FeedItem> & { feed_id?: string };
  const feed_id = body.feed_id;
  const kind = body.kind as FeedItemKind | undefined;
  if (typeof feed_id !== 'string' || !feed_id) {
    return NextResponse.json({ error: 'feed_id required' }, { status: 400 });
  }
  if (kind !== 'article' && kind !== 'ad') {
    return NextResponse.json({ error: 'kind must be article or ad' }, { status: 400 });
  }

  const [feedsCol, itemsCol, adsCol] = await Promise.all([feeds(), feedItems(), ads()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) {
    return NextResponse.json({ error: 'feed not found' }, { status: 404 });
  }

  // Next position
  const last = await itemsCol
    .find({ feed_id })
    .sort({ position: -1 })
    .limit(1)
    .toArray();
  const nextPosition = last.length ? last[0].position + 1 : 0;

  const now = new Date();
  const doc: FeedItem = {
    feed_id,
    position: nextPosition,
    kind,
    created_at: now,
    updated_at: now,
  };

  if (kind === 'article') {
    if (typeof body.url !== 'string' || !body.url) {
      return NextResponse.json({ error: 'url required for article' }, { status: 400 });
    }
    doc.url = body.url;
    try {
      const meta = await fetchOgMeta(body.url);
      doc.fetched = { ...meta, fetched_at: now };
    } catch (err: any) {
      // Save the item without fetched metadata — user can manually override
      // or hit refresh later.
      doc.fetched = undefined;
    }
    if (body.override) {
      doc.override = {
        title: typeof body.override.title === 'string' ? body.override.title : undefined,
        image: typeof body.override.image === 'string' ? body.override.image : undefined,
      };
    }
  } else {
    if (typeof body.ad_id !== 'string' || !body.ad_id) {
      return NextResponse.json({ error: 'ad_id required for ad' }, { status: 400 });
    }
    const ad = await adsCol.findOne({ ad_id: body.ad_id });
    if (!ad) {
      return NextResponse.json({ error: 'ad not found' }, { status: 404 });
    }
    doc.ad_id = body.ad_id;
  }

  const inserted = await itemsCol.insertOne(doc);
  return NextResponse.json({ ...doc, _id: inserted.insertedId }, { status: 201 });
}
