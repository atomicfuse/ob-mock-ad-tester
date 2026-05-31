import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function corsHeaders() {
  return { ...CORS_HEADERS };
}

export function corsResponse(body?: unknown, init: ResponseInit = {}) {
  const headers = { ...CORS_HEADERS, ...(init.headers as Record<string, string> | undefined) };
  if (body === undefined || body === null) {
    return new NextResponse(null, { ...init, headers });
  }
  return NextResponse.json(body, { ...init, headers });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// True when the tracking call originates from an admin page on the app itself
// (e.g. the in-app feed preview). Used to skip self-impressions while still
// counting traffic from /test-embed.html and from genuine third-party embeds.
export function isSelfOrigin(req: NextRequest): boolean {
  const selfHost = req.headers.get('host') ?? '';
  if (!selfHost) return false;
  const referer = req.headers.get('referer');
  if (!referer) return false;
  try {
    const u = new URL(referer);
    if (u.host !== selfHost) return false;
    return u.pathname.startsWith('/admin/') || u.pathname === '/admin';
  } catch {
    return false;
  }
}
