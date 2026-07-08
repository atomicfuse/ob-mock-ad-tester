import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems } from '../../../../../../lib/mongo';
import { applyAdRatio } from '../../../../../../lib/feed-order';
import { validateListicleJson } from '../../../../../../lib/listicle';
import type { FeedItem } from '../../../../../../lib/types';

export const dynamic = 'force-dynamic';

// POST { title?, items: [...], mode?: 'replace' | 'append', renameFeed?: boolean }
// — bulk import listicle cards from the paste/export JSON shape (see
// lib/listicle.ts). 'replace' (default) swaps out all existing cards for the
// new set; 'append' adds the new cards after the existing queue. Either way
// the feed is re-interleaved afterward so cards fall in with the feed's
// ad_ratio, preserving the existing items' relative order. The pasted JSON's
// top-level `title` is never applied automatically — pass `renameFeed: true`
// (only honored in 'replace' mode) to explicitly opt into renaming the feed
// to that title; otherwise an import from another feed's export would
// silently rename this one.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const feed_id = params.id;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const mode = body?.mode === 'append' ? 'append' : 'replace';
  // Renaming the feed off the pasted JSON's top-level `title` is opt-in only —
  // otherwise importing a JSON blob exported from a *different* feed (which
  // naturally carries that feed's title) would silently rename this one.
  const renameFeed = mode === 'replace' && body?.renameFeed === true;

  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'feed not found' }, { status: 404 });

  const validated = validateListicleJson(body);
  if ('row_errors' in validated) {
    return NextResponse.json(
      { error: 'validation failed', row_errors: validated.row_errors },
      { status: 400 },
    );
  }
  const { title, items } = validated;

  let removed = 0;
  if (mode === 'replace') {
    const result = await itemsCol.deleteMany({ feed_id, kind: 'card' });
    removed = result.deletedCount ?? 0;
  }

  const last = await itemsCol.find({ feed_id }).sort({ position: -1 }).limit(1).toArray();
  let pos = last.length ? last[0].position + 1 : 0;
  const now = new Date();
  const newDocs: FeedItem[] = items.map((item) => ({
    feed_id,
    position: pos++,
    kind: 'card',
    card: {
      heading: item.heading,
      ...(item.text ? { text: item.text } : {}),
      image: item.image_url,
    },
    created_at: now,
    updated_at: now,
  }));
  if (newDocs.length) await itemsCol.insertMany(newDocs);

  if (title && renameFeed) {
    await feedsCol.updateOne({ feed_id }, { $set: { name: title, updated_at: now } });
  }

  // Recompute ad slots against the new content count, then interleave.
  await applyAdRatio(feed_id);

  const list = await itemsCol.find({ feed_id }).sort({ position: 1 }).toArray();
  return NextResponse.json({ ok: true, added: newDocs.length, removed, items: list });
}

// GET — export cards (position order) in the same shape POST accepts, so
// export → import(replace) round-trips to an identical feed state.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const feed_id = params.id;

  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'feed not found' }, { status: 404 });

  const cards = await itemsCol.find({ feed_id, kind: 'card' }).sort({ position: 1 }).toArray();
  const items = cards
    .filter((c) => !!c.card)
    .map((c) => ({
      heading: c.card!.heading,
      ...(c.card!.text ? { text: c.card!.text } : {}),
      image_url: c.card!.image,
    }));

  return NextResponse.json({ title: feed.name, items });
}
