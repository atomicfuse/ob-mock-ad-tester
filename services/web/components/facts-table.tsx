'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { FeedInitiative } from '../lib/types';

export default function FactsTable({ initialDecks }: { initialDecks: FeedInitiative[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(deck: FeedInitiative) {
    setBusy(deck.feed_id);
    const next = deck.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/admin/feeds/${deck.feed_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    router.refresh();
  }

  async function del(deck: FeedInitiative) {
    if (!confirm(`Delete deck ${deck.feed_id} and all its facts? Cannot be undone.`)) return;
    setBusy(deck.feed_id);
    await fetch(`/api/admin/feeds/${deck.feed_id}`, { method: 'DELETE' });
    setBusy(null);
    router.refresh();
  }

  if (initialDecks.length === 0) {
    return (
      <div className="empty">
        <p>No fact decks yet.</p>
        <Link href="/admin/facts/new" className="btn btn-primary">
          Create your first deck
        </Link>
      </div>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Deck ID</th>
          <th>Name</th>
          <th>Ratio</th>
          <th>Status</th>
          <th style={{ width: 320 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {initialDecks.map((deck) => (
          <tr key={deck.feed_id}>
            <td>
              <Link href={`/admin/facts/${deck.feed_id}`}>
                <code>{deck.feed_id}</code>
              </Link>
            </td>
            <td>{deck.name}</td>
            <td>{deck.ad_ratio}:1</td>
            <td>
              <span className={`pill pill-${deck.status}`}>{deck.status}</span>
            </td>
            <td>
              <div className="row" style={{ gap: 6 }}>
                <Link href={`/admin/facts/${deck.feed_id}`} className="btn">
                  Edit
                </Link>
                <Link
                  href={`/admin/facts/${deck.feed_id}/preview`}
                  className="btn"
                  target="_blank"
                  rel="noopener"
                >
                  Preview
                </Link>
                <Link href={`/admin/facts/${deck.feed_id}/analytics`} className="btn">
                  Analytics
                </Link>
                <button
                  type="button"
                  className="btn"
                  disabled={busy === deck.feed_id}
                  onClick={() => toggle(deck)}
                >
                  {deck.status === 'active' ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy === deck.feed_id}
                  onClick={() => del(deck)}
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
