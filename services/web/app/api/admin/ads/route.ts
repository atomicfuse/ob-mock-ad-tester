import { NextRequest, NextResponse } from 'next/server';
import { ads } from '../../../../lib/mongo';
import type { MockAdInput } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const col = await ads();
  const list = await col.find({}).sort({ created_at: -1 }).toArray();
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<MockAdInput>;
  const required = ['ad_id', 'campaign', 'title', 'brand', 'image_url', 'landing_page'] as const;
  for (const k of required) {
    if (typeof body[k] !== 'string' || !body[k]) {
      return NextResponse.json({ error: `${k} is required` }, { status: 400 });
    }
  }
  const col = await ads();
  const existing = await col.findOne({ ad_id: body.ad_id });
  if (existing) {
    return NextResponse.json({ error: 'ad_id already exists' }, { status: 409 });
  }
  const now = new Date();
  const doc = {
    ad_id: body.ad_id!,
    campaign: body.campaign!,
    title: body.title!,
    brand: body.brand!,
    image_url: body.image_url!,
    landing_page: body.landing_page!,
    status: (body.status === 'paused' ? 'paused' : 'active') as 'active' | 'paused',
    created_at: now,
    updated_at: now,
  };
  await col.insertOne(doc);
  return NextResponse.json(doc, { status: 201 });
}
