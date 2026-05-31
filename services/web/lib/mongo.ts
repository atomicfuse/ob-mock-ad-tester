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
} from './types';

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (global._mongoClientPromise) return global._mongoClientPromise;
  const uri = process.env.MONGODB_URL;
  if (!uri) {
    throw new Error('MONGODB_URL is not set');
  }
  const promise = new MongoClient(uri).connect();
  if (process.env.NODE_ENV !== 'production') {
    global._mongoClientPromise = promise;
  }
  return promise;
}

let indexesEnsured = false;

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db();
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
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
