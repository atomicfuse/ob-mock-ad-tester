import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { feedItems } from '../../../../../lib/mongo';
import { fetchOgMeta } from '../../../../../lib/og-fetch';
import { validateListicleJson } from '../../../../../lib/listicle';

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

  if (body.card !== undefined) {
    if (item.kind !== 'card') {
      return NextResponse.json(
        { error: 'card can only be set on items with kind "card"' },
        { status: 400 },
      );
    }
    // Reuse the shared row validator (same rules as JSON import) by wrapping
    // this single edit in the { items: [...] } shape it expects.
    const validated = validateListicleJson({
      items: [
        {
          heading: body.card?.heading,
          text: body.card?.text,
          image_url: body.card?.image,
        },
      ],
    });
    if ('row_errors' in validated) {
      const [first] = validated.row_errors;
      return NextResponse.json(
        { error: `card.${first.field}: ${first.message}`, row_errors: validated.row_errors },
        { status: 400 },
      );
    }
    const [validCard] = validated.items;
    update.card = {
      heading: validCard.heading,
      image: validCard.image_url,
      ...(validCard.text ? { text: validCard.text } : {}),
    };
  }

  if (body.fact !== undefined) {
    if (item.kind !== 'fact') {
      return NextResponse.json(
        { error: 'fact can only be set on items with kind "fact"' },
        { status: 400 },
      );
    }
    const text = typeof body.fact?.text === 'string' ? body.fact.text.trim() : '';
    if (!text) {
      return NextResponse.json({ error: 'fact.text: required' }, { status: 400 });
    }
    if (text.length > 500) {
      return NextResponse.json({ error: 'fact.text: too long (max 500 chars)' }, { status: 400 });
    }
    update.fact = { text };
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

  // Attach / detach a real-ad banner under this article.
  const unset: Record<string, ''> = {};
  if ('attached_real_ad_id' in body) {
    if (typeof body.attached_real_ad_id === 'string' && body.attached_real_ad_id) {
      update.attached_real_ad_id = body.attached_real_ad_id;
    } else {
      unset.attached_real_ad_id = '';
    }
  }

  const ops: Record<string, any> = { $set: update };
  if (Object.keys(unset).length) ops.$unset = unset;

  const result = await col.findOneAndUpdate({ _id: oid }, ops, { returnDocument: 'after' });
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const oid = toOid(params.id);
  if (!oid) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const col = await feedItems();
  const item = await col.findOne({ _id: oid });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await col.deleteOne({ _id: oid });
  // Leave remaining positions as-is — they stay correctly ordered (a gap is
  // harmless since everything sorts by position), preserving any manual order.
  return NextResponse.json({ ok: true });
}
