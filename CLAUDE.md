# CLAUDE.md

## Overview

Mock Ad Tester is an internal tool for testing ad placements on publisher websites. It provides an admin dashboard for managing mock ads and content feeds, embeddable widgets that publishers drop onto their sites, and analytics tracking for impressions, clicks, and engagement.

Deployed via CloudGrid. Single service: a Next.js 14 app backed by MongoDB.

## Project structure

```
services/web/             — the Next.js app (all code lives here)
  app/                    — App Router pages and API routes
    admin/                — Admin dashboard (Ads, Feeds, Analytics tabs)
    api/
      admin/              — CRUD endpoints for ads, feeds, feed-items
      mock-ad/            — Public: serves a random active ad
      feed/               — Public: serves resolved feed + tracking endpoints
    health/               — Health check
  components/             — React components (forms, tables, editors, previews)
  lib/
    mongo.ts              — MongoDB connection + collection helpers
    types.ts              — All TypeScript types/interfaces
    cors.ts               — CORS helpers for widget endpoints
    feed-order.ts         — Feed item ordering logic
    og-fetch.ts           — OpenGraph metadata fetcher for article URLs
  public/
    widget.js             — Embeddable ad widget (vanilla JS, Shadow DOM)
    feed-widget.js        — Embeddable infinite-feed widget (vanilla JS)
    test-embed.html       — Local test page for widgets
cloudgrid.yaml            — CloudGrid deployment config (requires mongodb)
```

## Development

```bash
cd services/web
npm install
npm run dev              # starts Next.js dev server on :3000
```

Requires `MONGODB_URL` env var (set in `.env.local`). See `.env.example` for reference.

## Key concepts

- **Mock Ads**: Ad creatives with campaign, brand, image, landing page. CRUD via admin, served randomly via `/api/mock-ad`.
- **Feed Initiatives**: Configurable content feeds mixing articles and ads. Each feed has a trigger mode (scroll depth or manual CTA button), ad ratio, and supports mock or live ad modes.
- **Feed Items**: Ordered list of articles (fetched via OG metadata) and ad slots within a feed. Supports drag-to-reorder and bulk operations.
- **Widgets**: Two vanilla JS widgets (`widget.js` for standalone ads, `feed-widget.js` for feeds) that publishers embed via `<script>` tags. Both auto-detect their backend origin from the script src URL.
- **Analytics**: Impression/click/exit tracking with CTR calculation. Self-impressions from admin pages are filtered out.

## Tech stack

- Next.js 14 (App Router, standalone output)
- React 18 (no component library — plain CSS in `globals.css`)
- MongoDB 6.x driver (no ODM/ORM)
- TypeScript 5.5
- No test framework configured
- No linter/formatter configured

## API patterns

- Admin endpoints under `/api/admin/` — standard REST, return JSON
- Public widget endpoints under `/api/feed/` and `/api/mock-ad/` — CORS-enabled via `lib/cors.ts`
- Tracking endpoints accept POST with JSON body, return 204
- All DB access goes through helpers in `lib/mongo.ts` (lazy connection, indexes ensured on first access)

## Widget development

The widgets in `public/` are vanilla JS (no build step). They must stay compatible with older browsers. Changes are tested via `public/test-embed.html` or by embedding on an external page pointing at the dev server.
