import { NextRequest, NextResponse } from 'next/server';
import { fetchOgMeta } from '../../../../../lib/og-fetch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const url = body?.url;
  if (typeof url !== 'string' || !url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  try {
    const meta = await fetchOgMeta(url);
    return NextResponse.json(meta);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'fetch failed' }, { status: 502 });
  }
}
