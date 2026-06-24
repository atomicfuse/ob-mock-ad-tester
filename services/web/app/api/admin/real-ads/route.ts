import { NextRequest, NextResponse } from 'next/server';
import { realAds } from '../../../../lib/mongo';
import type { RealAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const col = await realAds();
  const list = await col.find({}).sort({ created_at: -1 }).toArray();
  return NextResponse.json(list.map(({ _id, ...r }) => r));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<RealAd>;
  if (typeof body.real_ad_id !== 'string' || !body.real_ad_id.trim()) {
    return NextResponse.json({ error: 'real_ad_id is required' }, { status: 400 });
  }
  if (!/^[a-z0-9_-]+$/i.test(body.real_ad_id)) {
    return NextResponse.json(
      { error: 'real_ad_id must be alphanumeric (letters, digits, _ and -)' },
      { status: 400 },
    );
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const col = await realAds();
  const exists = await col.findOne({ real_ad_id: body.real_ad_id });
  if (exists) {
    return NextResponse.json({ error: 'real_ad_id already exists' }, { status: 409 });
  }

  const now = new Date();
  const doc: RealAd = {
    real_ad_id: body.real_ad_id.trim(),
    name: body.name.trim(),
    head_script: typeof body.head_script === 'string' ? body.head_script : '',
    snippet: typeof body.snippet === 'string' ? body.snippet : '',
    ads_per_snippet:
      typeof body.ads_per_snippet === 'number' && body.ads_per_snippet >= 1
        ? Math.floor(body.ads_per_snippet)
        : 1,
    created_at: now,
    updated_at: now,
  };
  await col.insertOne(doc);
  return NextResponse.json(doc, { status: 201 });
}
