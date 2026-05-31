import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { feedItems } from '../../../../../lib/mongo';
import { fetchOgMeta } from '../../../../../lib/og-fetch';
import { reorderFeedItems } from '../../../../../lib/feed-order';

export const dynamic = 'force-dynamic';

function toOid(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const oid = toOid(params.id);
  if (!oid) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const body = await req.json();
  const col = await feedItems();
  const item = await col.findOne({ _id: oid });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const update: Record<string, any> = { updated_at: new Date() };

  if (body.override !== undefined) {
    const ov: Record<string, string> = {};
    if (typeof body.override?.title === 'string') ov.title = body.override.title;
    if (typeof body.override?.image === 'string') ov.image = body.override.image;
    update.override = ov;
  }

  if (body.refresh === true && item.kind === 'article' && item.url) {
    try {
      const meta = await fetchOgMeta(item.url);
      update.fetched = { ...meta, fetched_at: new Date() };
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'fetch failed' }, { status: 502 });
    }
  }

  if (typeof body.position === 'number') {
    update.position = body.position;
  }

  const result = await col.findOneAndUpdate(
    { _id: oid },
    { $set: update },
    { returnDocument: 'after' },
  );
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const oid = toOid(params.id);
  if (!oid) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const col = await feedItems();
  const item = await col.findOne({ _id: oid });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await col.deleteOne({ _id: oid });
  await reorderFeedItems(item.feed_id);
  return NextResponse.json({ ok: true });
}
