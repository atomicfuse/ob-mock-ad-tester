import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { feedItems } from '../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

// POST { feed_id, item_id, direction: "up" | "down" }
// Swaps the item's position with its neighbor.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { feed_id, item_id, direction } = body ?? {};
  if (typeof feed_id !== 'string' || typeof item_id !== 'string') {
    return NextResponse.json({ error: 'feed_id and item_id required' }, { status: 400 });
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

  const col = await feedItems();
  const item = await col.findOne({ _id: oid, feed_id });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const neighborPos = direction === 'up' ? item.position - 1 : item.position + 1;
  if (neighborPos < 0) return NextResponse.json({ ok: true, noop: true });

  const neighbor = await col.findOne({ feed_id, position: neighborPos });
  if (!neighbor) return NextResponse.json({ ok: true, noop: true });

  // Use a sentinel to swap without violating any future unique index.
  await col.updateOne({ _id: item._id }, { $set: { position: -1 } });
  await col.updateOne({ _id: neighbor._id }, { $set: { position: item.position } });
  await col.updateOne({ _id: item._id }, { $set: { position: neighborPos } });

  return NextResponse.json({ ok: true });
}
