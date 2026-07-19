import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems } from '../../../../../../lib/mongo';
import { applyAdRatio } from '../../../../../../lib/feed-order';
import { validateFactsJson } from '../../../../../../lib/facts';
import type { FeedItem } from '../../../../../../lib/types';

export const dynamic = 'force-dynamic';

// POST { title?, items: [...], mode?: 'replace' | 'append', renameFeed?: boolean }
// — bulk import deck facts from the paste/export JSON shape (see lib/facts.ts;
// rows are strings or { text }). 'replace' (default) swaps out all existing
// facts for the new set; 'append' adds after the existing queue. Either way
// the deck is re-interleaved afterward so ad slots fall in with the deck's
// ad_ratio, preserving the existing items' relative order. The pasted JSON's
// top-level `title` is never applied automatically — pass `renameFeed: true`
// (only honored in 'replace' mode) to explicitly opt into renaming the deck.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const feed_id = params.id;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const mode = body?.mode === 'append' ? 'append' : 'replace';
  const renameFeed = mode === 'replace' && body?.renameFeed === true;

  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'deck not found' }, { status: 404 });

  const validated = validateFactsJson(body);
  if ('row_errors' in validated) {
    return NextResponse.json(
      { error: 'validation failed', row_errors: validated.row_errors },
      { status: 400 },
    );
  }
  const { title, items } = validated;

  let removed = 0;
  if (mode === 'replace') {
    const result = await itemsCol.deleteMany({ feed_id, kind: 'fact' });
    removed = result.deletedCount ?? 0;
  }

  const last = await itemsCol.find({ feed_id }).sort({ position: -1 }).limit(1).toArray();
  let pos = last.length ? last[0].position + 1 : 0;
  const now = new Date();
  const newDocs: FeedItem[] = items.map((text) => ({
    feed_id,
    position: pos++,
    kind: 'fact',
    fact: { text },
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

// GET — export facts (position order) in the same shape POST accepts, so
// export → import(replace) round-trips to an identical deck state.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const feed_id = params.id;

  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'deck not found' }, { status: 404 });

  const facts = await itemsCol.find({ feed_id, kind: 'fact' }).sort({ position: 1 }).toArray();
  const items = facts.filter((f) => !!f.fact?.text).map((f) => f.fact!.text);

  return NextResponse.json({ title: feed.name, items });
}
