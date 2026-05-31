import { NextRequest, NextResponse } from 'next/server';
import { ads } from '../../../../../lib/mongo';
import type { MockAd } from '../../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await ads();
  const ad = await col.findOne({ ad_id: params.id });
  if (!ad) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(ad);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as Partial<MockAd>;
  const allowed: (keyof MockAd)[] = [
    'campaign',
    'title',
    'brand',
    'image_url',
    'landing_page',
    'status',
  ];
  const update: Partial<MockAd> = { updated_at: new Date() };
  for (const k of allowed) {
    if (k in body && typeof (body as any)[k] === 'string') {
      (update as any)[k] = (body as any)[k];
    }
  }
  if (update.status && update.status !== 'active' && update.status !== 'paused') {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  const col = await ads();
  const result = await col.findOneAndUpdate(
    { ad_id: params.id },
    { $set: update },
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await ads();
  const result = await col.deleteOne({ ad_id: params.id });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
