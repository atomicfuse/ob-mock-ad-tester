import { MongoClient, Db, Collection } from 'mongodb';
import type {
  MockAd,
  MockAdImpression,
  MockAdClick,
  FeedInitiative,
  FeedItem,
  FeedImpression,
  FeedClick,
  FeedExit,
  FeedEvent,
  FeedSession,
  CapiLogEntry,
  RealAd,
} from './types';

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/** Retry a Mongo operation on transient connection errors (dropped sockets,
 *  pool-cleared events) — the kind of blip a shared cluster produces under
 *  network hiccups. Read-heavy admin pages fan out many parallel queries, so
 *  without this a single bad connection fails the whole page. Non-transient
 *  errors (bad query, auth, etc.) rethrow immediately. */
export async function withMongoRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const transient =
        err?.name === 'MongoNetworkError' ||
        err?.name === 'MongoPoolClearedError' ||
        err?.code === 'EPIPE' ||
        (typeof err?.hasErrorLabel === 'function' &&
          (err.hasErrorLabel('RetryableReadError') || err.hasErrorLabel('RetryableWriteError')));
      if (!transient || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastErr;
}

function getClientPromise(): Promise<MongoClient> {
  if (global._mongoClientPromise) return global._mongoClientPromise;
  const uri = process.env.MONGODB_URL;
  if (!uri) {
    throw new Error('MONGODB_URL is not set');
  }
  // Reuse a single client across every request (and across dev HMR reloads).
  // Caching in ALL environments is critical: without it, each request in
  // production opened a brand-new MongoClient + connection, exhausting the
  // connection limit and causing writes (e.g. tracking) to fail silently.
  //
  // Options tuned for the shared cluster, which aggressively closes idle
  // sockets (observed as EPIPE / "socket ended by the other party" cascades):
  // - maxIdleTimeMS recycles idle connections client-side BEFORE the server
  //   kills them, so we stop writing into dead sockets.
  // - a bounded pool avoids stampeding the shared instance under FB-traffic
  //   bursts; excess operations queue briefly instead.
  // - retryWrites/retryReads let the driver transparently retry one failover.
  global._mongoClientPromise = new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 1,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 5_000,
    retryWrites: true,
    retryReads: true,
  }).connect();
  return global._mongoClientPromise;
}

let indexesEnsured = false;

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db();
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      db.collection('real_ads').createIndex({ real_ad_id: 1 }, { unique: true }),
      db.collection('mock_ads').createIndex({ ad_id: 1 }, { unique: true }),
      db.collection('mock_ad_impressions').createIndex({ ad_id: 1 }),
      db.collection('mock_ad_impressions').createIndex({ timestamp: -1 }),
      db.collection('mock_ad_clicks').createIndex({ ad_id: 1 }),
      db.collection('mock_ad_clicks').createIndex({ timestamp: -1 }),
      // Feed feature
      db.collection('feed_initiatives').createIndex({ feed_id: 1 }, { unique: true }),
      db.collection('feed_items').createIndex({ feed_id: 1, position: 1 }),
      db.collection('feed_impressions').createIndex({ feed_id: 1 }),
      db.collection('feed_impressions').createIndex({ timestamp: -1 }),
      db.collection('feed_clicks').createIndex({ feed_id: 1 }),
      db.collection('feed_clicks').createIndex({ timestamp: -1 }),
      db.collection('feed_exits').createIndex({ feed_id: 1 }),
      db.collection('feed_exits').createIndex({ timestamp: -1 }),
      // Measurement & attribution
      db.collection('feed_sessions').createIndex({ session_id: 1 }, { unique: true }),
      db.collection('feed_sessions').createIndex({ feed_id: 1, started_at: -1 }),
      db.collection('feed_sessions').createIndex({ feed_id: 1, 'attribution.sub': 1 }),
      db.collection('feed_events').createIndex({ feed_id: 1, timestamp: -1 }),
      db.collection('feed_events').createIndex({ session_id: 1 }),
      // Absorbs duplicate beacons (bfcache restores/retries) — inserts swallow E11000.
      db
        .collection('feed_events')
        .createIndex({ session_id: 1, event: 1, depth: 1 }, { unique: true }),
      db.collection('capi_log').createIndex({ ts: 1 }, { expireAfterSeconds: 2592000 }),
      db.collection('capi_log').createIndex({ status: 1, ts: -1 }),
    ]).catch(() => {
      indexesEnsured = false;
    });
  }
  return db;
}

export async function ads(): Promise<Collection<MockAd>> {
  return (await getDb()).collection<MockAd>('mock_ads');
}

export async function impressions(): Promise<Collection<MockAdImpression>> {
  return (await getDb()).collection<MockAdImpression>('mock_ad_impressions');
}

export async function clicks(): Promise<Collection<MockAdClick>> {
  return (await getDb()).collection<MockAdClick>('mock_ad_clicks');
}

// --- Feed feature ---

export async function feeds(): Promise<Collection<FeedInitiative>> {
  return (await getDb()).collection<FeedInitiative>('feed_initiatives');
}

export async function feedItems(): Promise<Collection<FeedItem>> {
  return (await getDb()).collection<FeedItem>('feed_items');
}

export async function feedImpressions(): Promise<Collection<FeedImpression>> {
  return (await getDb()).collection<FeedImpression>('feed_impressions');
}

export async function feedClicks(): Promise<Collection<FeedClick>> {
  return (await getDb()).collection<FeedClick>('feed_clicks');
}

export async function feedExits(): Promise<Collection<FeedExit>> {
  return (await getDb()).collection<FeedExit>('feed_exits');
}

export async function realAds(): Promise<Collection<RealAd>> {
  return (await getDb()).collection<RealAd>('real_ads');
}

export async function feedSessions(): Promise<Collection<FeedSession>> {
  return (await getDb()).collection<FeedSession>('feed_sessions');
}

export async function feedEvents(): Promise<Collection<FeedEvent>> {
  return (await getDb()).collection<FeedEvent>('feed_events');
}

export async function capiLog(): Promise<Collection<CapiLogEntry>> {
  return (await getDb()).collection<CapiLogEntry>('capi_log');
}
