import { NextRequest, NextResponse } from 'next/server';
import { feedImpressions, feedClicks, feedExits } from '../../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const feedId = params.id;
  const [impCol, clickCol, exitCol] = await Promise.all([
    feedImpressions(),
    feedClicks(),
    feedExits(),
  ]);
  const [impRes, clickRes, exitRes] = await Promise.all([
    impCol.deleteMany({ feed_id: feedId }),
    clickCol.deleteMany({ feed_id: feedId }),
    exitCol.deleteMany({ feed_id: feedId }),
  ]);
  return NextResponse.json({
    ok: true,
    impressions_deleted: impRes.deletedCount,
    clicks_deleted: clickRes.deletedCount,
    exits_deleted: exitRes.deletedCount,
  });
}
