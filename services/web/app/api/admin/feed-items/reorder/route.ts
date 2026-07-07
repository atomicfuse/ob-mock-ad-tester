import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { feedItems } from '../../../../../lib/mongo';
import { reorderFeedItems } from '../../../../../lib/feed-order';

export const dynamic = 'force-dynamic';

// POST accepts one of:
//   { feed_id, ids: string[] }               — set the full order (drag-to-reorder)
//   { feed_id, auto: true }                  — re-interleave articles/ads by ad_ratio
//   { feed_id, item_id, direction:up|down }  — swap one item with its neighbor
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const feed_id = body?.feed_id;
  if (typeof feed_id !== 'string' || !feed_id) {
    return NextResponse.json({ error: 'feed_id required' }, { status: 400 });
  }

  const col = await feedItems();

  // --- Auto-arrange by ratio ---
  if (body.auto === true) {
    await reorderFeedItems(feed_id);
    const list = await col.find({ feed_id }).sort({ position: 1 }).toArray();
    return NextResponse.json(list);
  }

  // --- Full reorder from an explicit id list ---
  if (Array.isArray(body.ids)) {
    if (body.ids.length === 0) {
      return NextResponse.json({ error: 'ids must be non-empty' }, { status: 400 });
    }
    const oids: ObjectId[] = [];
    for (const id of body.ids) {
      if (typeof id !== 'string') {
        return NextResponse.json({ error: 'ids must be strings' }, { status: 400 });
      }
      try {
        oids.push(new ObjectId(id));
      } catch {
        return NextResponse.json({ error: `bad id: ${id}` }, { status: 400 });
      }
    }
    // Must match this feed's items exactly (no missing / extra / duplicate ids),
    // so a stale client can't silently drop or duplicate rows.
    const existing = await col.find({ feed_id }).toArray();
    const existingIds = new Set(existing.map((d) => d._id.toString()));
    const submitted = new Set(oids.map((o) => o.toString()));
    if (
      oids.length !== existing.length ||
      submitted.size !== oids.length ||
      !oids.every((o) => existingIds.has(o.toString()))
    ) {
      return NextResponse.json(
        { error: "ids must match this feed's items exactly" },
        { status: 409 },
      );
    }
    const now = new Date();
    // Two-pass write: park rows at negative sentinels first so we never collide
    // on a future unique index over (feed_id, position).
    await Promise.all(
      oids.map((oid, idx) => col.updateOne({ _id: oid }, { $set: { position: -(idx + 1) } })),
    );
    await Promise.all(
      oids.map((oid, idx) =>
        col.updateOne({ _id: oid }, { $set: { position: idx, updated_at: now } }),
      ),
    );
    const list = await col.find({ feed_id }).sort({ position: 1 }).toArray();
    return NextResponse.json(list);
  }

  // --- Swap one item with its neighbor (up/down) ---
  const { item_id, direction } = body;
  if (typeof item_id !== 'string') {
    return NextResponse.json({ error: 'item_id, ids, or auto required' }, { status: 400 });
  }
  if (direction !== 'up' && direction !== 'down') {
    return NextResponse.json({ error: 'direction must be up or down' }, { status: 400 });
  }
  let oid: ObjectId;
  try {
    oid = new ObjectId(item_id);
  } catch {
    return NextResponse.json({ error: 'bad item_id' }, { status: 400 });
  }
  const item = await col.findOne({ _id: oid, feed_id });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const neighborPos = direction === 'up' ? item.position - 1 : item.position + 1;
  if (neighborPos < 0) return NextResponse.json({ ok: true, noop: true });
  const neighbor = await col.findOne({ feed_id, position: neighborPos });
  if (!neighbor) return NextResponse.json({ ok: true, noop: true });
  await col.updateOne({ _id: item._id }, { $set: { position: -1 } });
  await col.updateOne({ _id: neighbor._id }, { $set: { position: item.position } });
  await col.updateOne({ _id: item._id }, { $set: { position: neighborPos } });
  return NextResponse.json({ ok: true });
}
