import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedItems } from '../../../../../lib/mongo';
import { fetchOgMeta } from '../../../../../lib/og-fetch';
import type { FeedItem } from '../../../../../lib/types';

export const dynamic = 'force-dynamic';

interface BulkBody {
  feed_id?: string;
  urls?: unknown;
}

export async function POST(req: NextRequest) {
  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const feed_id = body.feed_id;
  if (typeof feed_id !== 'string' || !feed_id) {
    return NextResponse.json({ error: 'feed_id required' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
    : [];

  if (urls.length === 0) {
    return NextResponse.json({ error: 'urls must be a non-empty array' }, { status: 400 });
  }

  const [feedsCol, itemsCol] = await Promise.all([feeds(), feedItems()]);
  const feed = await feedsCol.findOne({ feed_id });
  if (!feed) return NextResponse.json({ error: 'feed not found' }, { status: 404 });

  // Fetch og: for all URLs in parallel — failures save as plain article without metadata.
  const now = new Date();
  const articleDocs: FeedItem[] = await Promise.all(
    urls.map(async (url) => {
      const doc: FeedItem = {
        feed_id,
        position: 0, // reassigned below (appended after the last item)
        kind: 'article',
        url,
        created_at: now,
        updated_at: now,
      };
      try {
        const meta = await fetchOgMeta(url);
        doc.fetched = { ...meta, fetched_at: now };
      } catch {
        // leave fetched undefined — operator can refresh later
      }
      return doc;
    }),
  );

  if (articleDocs.length > 0) {
    // Append articles after the current last item so any manual ordering is preserved.
    // Ad slots are not touched here — they are auto-managed via applyAdRatio on feed Settings save.
    const last = await itemsCol.find({ feed_id }).sort({ position: -1 }).limit(1).toArray();
    let pos = last.length ? last[0].position + 1 : 0;
    for (const doc of articleDocs) doc.position = pos++;
    await itemsCol.insertMany(articleDocs);
  }

  return NextResponse.json(
    {
      ok: true,
      added: { articles: articleDocs.length },
    },
    { status: 201 },
  );
}
