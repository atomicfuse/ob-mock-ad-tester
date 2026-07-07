import { NextRequest, NextResponse } from 'next/server';
import { feedItems, realAds } from '../../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

// POST { real_ad_id, n, m } — attach the real ad as an under-article banner on
// `n` of every `m` article cards (spread evenly), and clear it from the rest.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const feed_id = params.id;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const real_ad_id = typeof body?.real_ad_id === 'string' ? body.real_ad_id : '';
  const n = Number(body?.n);
  const m = Number(body?.m);
  if (!real_ad_id) return NextResponse.json({ error: 'real_ad_id required' }, { status: 400 });
  if (!Number.isInteger(n) || !Number.isInteger(m) || m < 1 || m > 50 || n < 0 || n > m) {
    return NextResponse.json({ error: 'invalid fraction (need 0 ≤ n ≤ m, m ≤ 50)' }, { status: 400 });
  }

  const [itemsCol, realAdsCol] = await Promise.all([feedItems(), realAds()]);
  const ra = await realAdsCol.findOne({ real_ad_id });
  if (!ra) return NextResponse.json({ error: 'real ad not found' }, { status: 404 });

  const items = await itemsCol.find({ feed_id }).sort({ position: 1 }).toArray();
  const articles = items.filter((i) => i.kind === 'article');

  const now = new Date();
  let attached = 0;
  const ops = articles.map((art, i) => {
    // (i * n) % m < n distributes exactly `n` hits across every window of `m`.
    const on = n > 0 && (i * n) % m < n;
    if (on) {
      attached++;
      return {
        updateOne: {
          filter: { _id: art._id },
          update: { $set: { attached_real_ad_id: real_ad_id, updated_at: now } },
        },
      };
    }
    return {
      updateOne: {
        filter: { _id: art._id },
        update: { $set: { updated_at: now }, $unset: { attached_real_ad_id: '' } },
      },
    };
  });
  if (ops.length) await itemsCol.bulkWrite(ops as any);

  const list = await itemsCol.find({ feed_id }).sort({ position: 1 }).toArray();
  return NextResponse.json({ ok: true, attached, articles: articles.length, items: list });
}
