import { NextRequest, NextResponse } from 'next/server';
import {
  feedImpressions,
  feedClicks,
  feedExits,
  feedEvents,
  feedSessions,
  capiLog,
} from '../../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const feedId = params.id;
  const [impCol, clickCol, exitCol, eventCol, sessionCol, capiCol] = await Promise.all([
    feedImpressions(),
    feedClicks(),
    feedExits(),
    feedEvents(),
    feedSessions(),
    capiLog(),
  ]);
  const filter = { feed_id: feedId };
  const [impRes, clickRes, exitRes, eventRes, sessionRes, capiRes] = await Promise.all([
    impCol.deleteMany(filter),
    clickCol.deleteMany(filter),
    exitCol.deleteMany(filter),
    eventCol.deleteMany(filter),
    sessionCol.deleteMany(filter),
    capiCol.deleteMany(filter),
  ]);
  return NextResponse.json({
    ok: true,
    impressions_deleted: impRes.deletedCount,
    clicks_deleted: clickRes.deletedCount,
    exits_deleted: exitRes.deletedCount,
    events_deleted: eventRes.deletedCount,
    sessions_deleted: sessionRes.deletedCount,
    capi_log_deleted: capiRes.deletedCount,
  });
}
