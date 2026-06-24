import { NextRequest, NextResponse } from 'next/server';
import { realAds } from '../../../../../lib/mongo';
import type { RealAd } from '../../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await realAds();
  const doc = await col.findOne({ real_ad_id: params.id });
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { _id, ...rest } = doc;
  return NextResponse.json(rest);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as Partial<RealAd>;
  const update: Partial<RealAd> = { updated_at: new Date() };

  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.head_script === 'string') update.head_script = body.head_script;
  if (typeof body.snippet === 'string') update.snippet = body.snippet;
  if (typeof body.ads_per_snippet === 'number' && body.ads_per_snippet >= 1) {
    update.ads_per_snippet = Math.floor(body.ads_per_snippet);
  }

  const col = await realAds();
  const result = await col.findOneAndUpdate(
    { real_ad_id: params.id },
    { $set: update },
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { _id, ...rest } = result;
  return NextResponse.json(rest);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const col = await realAds();
  const res = await col.deleteOne({ real_ad_id: params.id });
  if (res.deletedCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
