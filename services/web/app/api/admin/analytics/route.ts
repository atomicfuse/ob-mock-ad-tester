import { NextRequest, NextResponse } from 'next/server';
import { ads, impressions, clicks } from '../../../../lib/mongo';
import type { AdMetrics } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const campaign = searchParams.get('campaign');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const timeFilter: Record<string, Date> = {};
  if (from) timeFilter.$gte = new Date(from);
  if (to) timeFilter.$lte = new Date(to);
  const hasTime = Object.keys(timeFilter).length > 0;

  const adFilter: Record<string, unknown> = {};
  if (campaign) adFilter.campaign = campaign;

  const [adsCol, impCol, clickCol] = await Promise.all([ads(), impressions(), clicks()]);
  const adsList = await adsCol.find(adFilter).sort({ created_at: -1 }).toArray();

  const baseMatch = (extra: Record<string, unknown>) => {
    const m: Record<string, unknown> = { ...extra };
    if (campaign) m.campaign = campaign;
    if (hasTime) m.timestamp = timeFilter;
    return m;
  };

  const [impCounts, clickCounts] = await Promise.all([
    impCol
      .aggregate<{ _id: string; count: number }>([
        { $match: baseMatch({}) },
        { $group: { _id: '$ad_id', count: { $sum: 1 } } },
      ])
      .toArray(),
    clickCol
      .aggregate<{ _id: string; count: number }>([
        { $match: baseMatch({}) },
        { $group: { _id: '$ad_id', count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const impMap = new Map(impCounts.map((d) => [d._id, d.count]));
  const clickMap = new Map(clickCounts.map((d) => [d._id, d.count]));

  const metrics: AdMetrics[] = adsList.map((ad) => {
    const i = impMap.get(ad.ad_id) ?? 0;
    const c = clickMap.get(ad.ad_id) ?? 0;
    return {
      ad_id: ad.ad_id,
      campaign: ad.campaign,
      status: ad.status,
      title: ad.title,
      impressions: i,
      clicks: c,
      ctr: i > 0 ? c / i : 0,
    };
  });

  const campaigns = Array.from(new Set(adsList.map((a) => a.campaign))).sort();

  return NextResponse.json({ metrics, campaigns });
}
