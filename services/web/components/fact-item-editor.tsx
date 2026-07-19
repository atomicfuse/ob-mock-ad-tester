'use client';

import { useState } from 'react';
import type { FeedItem } from '../lib/types';

type ItemDoc = FeedItem & { _id: string };

interface RowError {
  index: number;
  field: string;
  message: string;
}

interface Props {
  feedId: string;
  initialItems: ItemDoc[];
}

// Fact-deck item queue — mirrors FeedItemEditor's list UX (positions incl.
// interleaved ad slots, kind pills, drag reorder, inline edit, delete) with
// JSON import/export in place of URL bulk paste. No OG fetch, no banners.
export default function FactItemEditor({ feedId, initialItems }: Props) {
  const [items, setItems] = useState<ItemDoc[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonMode, setJsonMode] = useState<'replace' | 'append'>('replace');
  const [jsonRename, setJsonRename] = useState(false);
  const [jsonBusy, setJsonBusy] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonRowErrors, setJsonRowErrors] = useState<RowError[]>([]);
  const [jsonMsg, setJsonMsg] = useState<string | null>(null);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  async function refresh() {
    const res = await fetch(`/api/admin/feed-items?feed_id=${encodeURIComponent(feedId)}`);
    if (res.ok) setItems(await res.json());
  }

  async function del(item: ItemDoc) {
    if (!confirm('Remove this item from the deck?')) return;
    setBusy(true);
    await fetch(`/api/admin/feed-items/${item._id}`, { method: 'DELETE' });
    await refresh();
    setBusy(false);
  }

  function startEdit(item: ItemDoc) {
    setEditing(item._id);
    setEditError(null);
    setEditText(item.fact?.text ?? '');
  }

  async function saveEdit(item: ItemDoc) {
    setBusy(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/feed-items/${item._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact: { text: editText } }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setEditError(b.error || `HTTP ${res.status}`);
        return;
      }
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function importFacts() {
    setJsonBusy(true);
    setJsonError(null);
    setJsonRowErrors([]);
    setJsonMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError('Not valid JSON.');
      setJsonBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}/facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(parsed as object),
          mode: jsonMode,
          renameFeed: jsonMode === 'replace' && jsonRename,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJsonError(data.error || `HTTP ${res.status}`);
        if (Array.isArray(data.row_errors)) setJsonRowErrors(data.row_errors);
        return;
      }
      setItems(data.items);
      setJsonText('');
      setJsonMsg(
        `Imported ${data.added} fact${data.added === 1 ? '' : 's'}` +
          (data.removed ? ` (replaced ${data.removed})` : '') +
          '.',
      );
    } catch (e: any) {
      setJsonError(e?.message ?? 'Import failed');
    } finally {
      setJsonBusy(false);
    }
  }

  async function exportFacts() {
    setJsonError(null);
    setJsonMsg(null);
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}/facts`);
      if (!res.ok) {
        setJsonError(`Export failed (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      const pretty = JSON.stringify(data, null, 2);
      setJsonText(pretty);
      try {
        await navigator.clipboard.writeText(pretty);
        setJsonCopied(true);
        setTimeout(() => setJsonCopied(false), 1500);
      } catch {
        /* clipboard unavailable — the textarea still holds the export */
      }
    } catch (e: any) {
      setJsonError(e?.message ?? 'Export failed');
    }
  }

  async function persistOrder(next: ItemDoc[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/feed-items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_id: feedId, ids: next.map((i) => i._id) }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || `HTTP ${res.status}`);
        await refresh(); // revert to server truth
        return;
      }
      setItems(await res.json());
    } catch (e: any) {
      setError(e?.message ?? 'Reorder failed');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(targetIdx: number) {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null || from === targetIdx) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    setItems(next); // optimistic — persistOrder reconciles with the server
    persistOrder(next);
  }

  const factCount = items.filter((i) => i.kind === 'fact').length;
  const adCount = items.filter((i) => i.kind === 'ad').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Import facts (JSON)</strong>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Shape: <code>{'{ "title": "...", "items": ["fact text", ...] }'}</code> — rows can also
          be <code>{'{ "text": "..." }'}</code> objects. Ad cards are inserted automatically at the
          deck&apos;s ratio after import.
        </p>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={6}
          placeholder='{ "items": ["Sharks existed before trees.", "A day on Venus is longer than a year on Venus."] }'
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            style={{ display: 'flex', gap: 4, alignItems: 'center', textTransform: 'none', fontWeight: 400, fontSize: 13 }}
          >
            <input
              type="radio"
              checked={jsonMode === 'replace'}
              onChange={() => setJsonMode('replace')}
              style={{ width: 'auto' }}
            />
            Replace all facts
          </label>
          <label
            style={{ display: 'flex', gap: 4, alignItems: 'center', textTransform: 'none', fontWeight: 400, fontSize: 13 }}
          >
            <input
              type="radio"
              checked={jsonMode === 'append'}
              onChange={() => setJsonMode('append')}
              style={{ width: 'auto' }}
            />
            Append
          </label>
          {jsonMode === 'replace' && (
            <label
              style={{ display: 'flex', gap: 4, alignItems: 'center', textTransform: 'none', fontWeight: 400, fontSize: 13 }}
            >
              <input
                type="checkbox"
                checked={jsonRename}
                onChange={(e) => setJsonRename(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Rename deck to JSON title
            </label>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={jsonBusy || !jsonText.trim()}
            onClick={importFacts}
          >
            {jsonBusy ? 'Importing…' : 'Import'}
          </button>
          <button type="button" className="btn" onClick={exportFacts}>
            {jsonCopied ? 'Copied ✓' : 'Export current facts'}
          </button>
        </div>
        {jsonMsg && <div style={{ color: '#166534', fontSize: 13 }}>{jsonMsg}</div>}
        {jsonError && <div style={{ color: '#b91c1c', fontSize: 13 }}>{jsonError}</div>}
        {jsonRowErrors.length > 0 && (
          <ul style={{ color: '#b91c1c', fontSize: 12, margin: 0, paddingLeft: 18 }}>
            {jsonRowErrors.map((re, i) => (
              <li key={i}>
                {re.index >= 0 ? `Row ${re.index + 1} — ` : ''}
                {re.field}: {re.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row between">
        <span className="muted" style={{ fontSize: 13 }}>
          {factCount} fact{factCount === 1 ? '' : 's'} · {adCount} ad card
          {adCount === 1 ? '' : 's'} — drag to reorder
        </span>
        {busy && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {items.length === 0 ? (
        <div className="empty">No facts yet — import some above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, idx) => (
            <div
              key={item._id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(idx);
              }}
              onDragLeave={() => setOverIndex((o) => (o === idx ? null : o))}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className="card"
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '10px 12px',
                cursor: 'grab',
                opacity: dragIndex === idx ? 0.5 : 1,
                outline: overIndex === idx && dragIndex !== null ? '2px solid #2563eb' : 'none',
              }}
            >
              <span className="muted" style={{ fontSize: 12, width: 24, textAlign: 'right' }}>
                {idx + 1}
              </span>
              <span
                className="pill"
                style={{
                  background: item.kind === 'ad' ? '#fef3c7' : '#dbeafe',
                  color: item.kind === 'ad' ? '#92400e' : '#1e40af',
                }}
              >
                {item.kind}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {item.kind === 'ad' ? (
                  <span className="muted" style={{ fontSize: 13 }}>
                    Ad card — renders the deck&apos;s real ad
                  </span>
                ) : editing === item._id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      style={{ fontSize: 13, width: '100%' }}
                    />
                    {editError && (
                      <div style={{ color: '#b91c1c', fontSize: 12 }}>{editError}</div>
                    )}
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || !editText.trim()}
                        onClick={() => saveEdit(item)}
                      >
                        Save
                      </button>
                      <button type="button" className="btn" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 13, wordBreak: 'break-word' }}>
                    {item.fact?.text ?? <em className="muted">(empty fact)</em>}
                  </span>
                )}
              </div>
              {editing !== item._id && (
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {item.kind === 'fact' && (
                    <button type="button" className="btn" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => del(item)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
