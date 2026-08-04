import { NextRequest, NextResponse } from 'next/server';
import { feeds, feedSessions, feedEvents, withMongoRetry } from '../../../../../../lib/mongo';

export const dynamic = 'force-dynamic';

// GET — cross-funnel continuation stats for one feed:
//   chooser_views    sessions that reached the end-of-feed chooser card
//   continues        chooser picks fired from this feed (feed_continue events)
//   hop1_sessions    sessions in OTHER feeds that arrived from this feed
//   hop2_sessions    of those, sessions that continued onward AGAIN (their
//                    session_id is some later session's origin_session_id)
//   by_target        hop-1 breakdown by destination feed
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const [feedsCol, sessionsCol, eventsCol] = await Promise.all([
    feeds(),
    feedSessions(),
    feedEvents(),
  ]);
  const feed = await feedsCol.findOne({ feed_id: id });
  if (!feed) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [chooserViews, continues, hop1Docs] = await withMongoRetry(() =>
    Promise.all([
      eventsCol.countDocuments({ feed_id: id, event: 'chooser_view' }),
      eventsCol.countDocuments({ feed_id: id, event: 'feed_continue' }),
      sessionsCol
        .find({ arrived_from_feed: id })
        .project<{ session_id: string; feed_id: string }>({ _id: 0, session_id: 1, feed_id: 1 })
        .toArray(),
    ]),
  );

  const hop1Ids = hop1Docs.map((s) => s.session_id);
  // A hop-1 session that continued again is the origin of some later session.
  const hop2 = hop1Ids.length
    ? await withMongoRetry(() =>
        sessionsCol.countDocuments({ origin_session_id: { $in: hop1Ids } }),
      )
    : 0;

  const byTarget: Record<string, number> = {};
  for (const s of hop1Docs) byTarget[s.feed_id] = (byTarget[s.feed_id] ?? 0) + 1;

  return NextResponse.json({
    feed_id: id,
    chooser_views: chooserViews,
    continues,
    hop1_sessions: hop1Ids.length,
    hop2_sessions: hop2,
    by_target: byTarget,
  });
}
