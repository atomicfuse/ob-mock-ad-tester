import { NextRequest, NextResponse } from 'next/server';
import { impressions, clicks } from '../../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const [impCol, clickCol] = await Promise.all([impressions(), clicks()]);
  const [impRes, clickRes] = await Promise.all([
    impCol.deleteMany({ ad_id: params.id }),
    clickCol.deleteMany({ ad_id: params.id }),
  ]);
  return NextResponse.json({
    ok: true,
    impressions_deleted: impRes.deletedCount,
    clicks_deleted: clickRes.deletedCount,
  });
}
