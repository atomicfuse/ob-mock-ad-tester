'use client';

import { useState } from 'react';
import type { AdMode, FeedItem, MockAd } from '../lib/types';

type ItemDoc = FeedItem & { _id: string };

interface Props {
  feedId: string;
  adRatio: number;
  initialAdMode: AdMode;
  initialLiveAdSnippet: string;
  initialItems: ItemDoc[];
  ads: MockAd[];
}

export default function FeedItemEditor({
  feedId,
  adRatio,
  initialAdMode,
  initialLiveAdSnippet,
  initialItems,
  ads,
}: Props) {
  const [items, setItems] = useState<ItemDoc[]>(initialItems);
  const [urlsText, setUrlsText] = useState('');
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adMode, setAdMode] = useState<AdMode>(initialAdMode);
  const [liveAdSnippet, setLiveAdSnippet] = useState(initialLiveAdSnippet);
  const [realAdsBusy, setRealAdsBusy] = useState(false);
  const [realAdsMsg, setRealAdsMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; image: string }>({
    title: '',
    image: '',
  });

  async function refresh() {
    const res = await fetch(`/api/admin/feed-items?feed_id=${encodeURIComponent(feedId)}`);
    if (res.ok) setItems(await res.json());
  }

  async function addArticles() {
    const urls = urlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/feed-items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_id: feedId, urls }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || `HTTP ${res.status}`);
        return;
      }
      setUrlsText('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addAds() {
    const ad_ids = Array.from(selectedAdIds);
    if (ad_ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/feed-items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_id: feedId, ad_ids }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || `HTTP ${res.status}`);
        return;
      }
      setSelectedAdIds(new Set());
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function del(item: ItemDoc) {
    if (!confirm('Delete this item?')) return;
    setBusy(true);
    await fetch(`/api/admin/feed-items/${item._id}`, { method: 'DELETE' });
    await refresh();
    setBusy(false);
  }

  async function refreshMeta(item: ItemDoc) {
    setBusy(true);
    await fetch(`/api/admin/feed-items/${item._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: true }),
    });
    await refresh();
    setBusy(false);
  }

  function startEdit(item: ItemDoc) {
    setEditing(item._id);
    setEditForm({
      title: item.override?.title ?? '',
      image: item.override?.image ?? '',
    });
  }

  async function saveEdit(item: ItemDoc) {
    setBusy(true);
    await fetch(`/api/admin/feed-items/${item._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        override: {
          title: editForm.title || undefined,
          image: editForm.image || undefined,
        },
      }),
    });
    setEditing(null);
    await refresh();
    setBusy(false);
  }

  function toggleAd(adId: string) {
    setSelectedAdIds((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else next.add(adId);
      return next;
    });
  }

  const adsById = new Map(ads.map((a) => [a.ad_id, a]));
  const usedAdIds = new Set(
    items
      .filter((it) => it.kind === 'ad')
      .map((it) => it.ad_id)
      .filter((v): v is string => typeof v === 'string'),
  );
  const availableAds = ads.filter((a) => !usedAdIds.has(a.ad_id));
  const articleCount = items.filter((it) => it.kind === 'article').length;
  const adCount = items.length - articleCount;

  async function saveRealAds(nextMode?: AdMode) {
    const mode = nextMode ?? adMode;
    setRealAdsBusy(true);
    setRealAdsMsg(null);
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_mode: mode, live_ad_snippet: liveAdSnippet }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setRealAdsMsg({ kind: 'err', text: b.error || `HTTP ${res.status}` });
        return;
      }
      setAdMode(mode);
      setRealAdsMsg({
        kind: 'ok',
        text: `Saved. Ads render in ${mode === 'live' ? 'LIVE' : 'MOCK'} mode.`,
      });
    } finally {
      setRealAdsBusy(false);
    }
  }

  function toggleAllAds() {
    if (selectedAdIds.size === availableAds.length) setSelectedAdIds(new Set());
    else setSelectedAdIds(new Set(availableAds.map((a) => a.ad_id)));
  }

  const urlsCount = urlsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Add articles</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Paste one article URL per line. We&apos;ll fetch og: metadata for each.
        </p>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={'https://example.com/article-1\nhttps://example.com/article-2'}
          rows={5}
          disabled={busy}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {urlsCount} URL{urlsCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={addArticles}
            disabled={busy || urlsCount === 0}
          >
            Add {urlsCount > 0 ? urlsCount : ''} article{urlsCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            Add mock ads
            {adMode === 'live' && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  padding: '2px 6px',
                  background: '#fef3c7',
                  color: '#92400e',
                  borderRadius: 4,
                  fontWeight: 600,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}
              >
                Inactive — live mode
              </span>
            )}
          </h2>
          {availableAds.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={toggleAllAds}
              disabled={busy}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              {selectedAdIds.size === availableAds.length ? 'Clear' : 'Select all'}
            </button>
          )}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Pick from active ads. Each ad can only be added once per feed.
          {usedAdIds.size > 0 && ` ${usedAdIds.size} already in queue.`}
        </p>
        {ads.length === 0 ? (
          <div className="empty" style={{ padding: 16, fontSize: 13 }}>
            No active ads — create one in <code>/admin/ads</code>.
          </div>
        ) : availableAds.length === 0 ? (
          <div className="empty" style={{ padding: 16, fontSize: 13 }}>
            All active ads are already in this feed.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 220,
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
            }}
          >
            {availableAds.map((a) => {
              const checked = selectedAdIds.has(a.ad_id);
              return (
                <label
                  key={a.ad_id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '8px 10px',
                    borderBottom: '1px solid #f1f1f2',
                    cursor: 'pointer',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAd(a.ad_id)}
                    disabled={busy}
                  />
                  <div
                    style={{
                      width: 48,
                      height: 28,
                      borderRadius: 3,
                      backgroundImage: `url(${a.image_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundColor: '#e5e7eb',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      <code>{a.ad_id}</code> · {a.brand}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {selectedAdIds.size} selected
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={addAds}
            disabled={busy || selectedAdIds.size === 0}
          >
            Add {selectedAdIds.size > 0 ? selectedAdIds.size : ''} ad{selectedAdIds.size === 1 ? '' : 's'}
          </button>
        </div>
        {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Real ads (Outbrain / Taboola / …)</h2>
          <span
            className="pill"
            style={{
              background: adMode === 'live' ? '#fef3c7' : '#e5e7eb',
              color: adMode === 'live' ? '#92400e' : '#374151',
              fontSize: 11,
              letterSpacing: '.04em',
            }}
          >
            {adMode === 'live' ? 'LIVE' : 'MOCK'}
          </span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          In <strong>Live</strong> mode every ad slot in this feed renders the snippet below
          instead of a mock ad — your provider rotates the underlying creative. Switch back to{' '}
          <strong>Mock</strong> anytime; the queue keeps its slot positions either way.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              border: adMode === 'mock' ? '2px solid #1e40af' : '1px solid #d1d5db',
              borderRadius: 8,
              cursor: 'pointer',
              alignItems: 'flex-start',
            }}
          >
            <input
              type="radio"
              name={`adMode-${feedId}`}
              checked={adMode === 'mock'}
              onChange={() => saveRealAds('mock')}
              disabled={realAdsBusy}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Mock mode</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Render each ad slot using a mock ad from this feed&apos;s queue.
              </div>
            </div>
          </label>
          <label
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              border: adMode === 'live' ? '2px solid #92400e' : '1px solid #d1d5db',
              borderRadius: 8,
              cursor: 'pointer',
              alignItems: 'flex-start',
              opacity: liveAdSnippet.trim() ? 1 : 0.85,
            }}
          >
            <input
              type="radio"
              name={`adMode-${feedId}`}
              checked={adMode === 'live'}
              onChange={() => liveAdSnippet.trim() && saveRealAds('live')}
              disabled={realAdsBusy || !liveAdSnippet.trim()}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Live mode
                {!liveAdSnippet.trim() && (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                    (add a snippet first)
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Render each ad slot using the live snippet below.
              </div>
            </div>
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Live-ads embed snippet
          </span>
          <textarea
            value={liveAdSnippet}
            onChange={(e) => setLiveAdSnippet(e.target.value)}
            placeholder={
              '<div class="OUTBRAIN" data-src="..." data-widget-id="MB_2"></div>\n<script async src="//widgets.outbrain.com/outbrain.js"></script>'
            }
            rows={8}
            disabled={realAdsBusy}
            spellCheck={false}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              resize: 'vertical',
            }}
          />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
          {realAdsMsg && (
            <span
              style={{ color: realAdsMsg.kind === 'ok' ? '#065f46' : '#b91c1c', fontSize: 12 }}
            >
              {realAdsMsg.text}
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => saveRealAds()}
            disabled={realAdsBusy}
          >
            {realAdsBusy ? 'Saving…' : 'Save snippet'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0 }}>
            Queue ({items.length}
            {items.length > 0 && (
              <span style={{ fontWeight: 400, fontSize: 14, color: '#666' }}>
                {' '}
                — {articleCount} article{articleCount === 1 ? '' : 's'}, {adCount} ad
                {adCount === 1 ? '' : 's'}
              </span>
            )}
            )
          </h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Auto-ordered as {adRatio} article{adRatio === 1 ? '' : 's'} : 1 ad, repeating.
          </p>
        </div>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: 32 }}>
            No items yet — add some articles or ads above.
          </div>
        ) : (
          <div>
            {items.map((it, idx) => {
              const ad = it.kind === 'ad' ? adsById.get(it.ad_id ?? '') : null;
              const title =
                it.override?.title ||
                it.fetched?.title ||
                (ad ? ad.title : '(no title yet)');
              const image =
                it.override?.image ||
                it.fetched?.image ||
                (ad ? ad.image_url : '');
              const isEdit = editing === it._id;
              return (
                <div
                  key={it._id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 12,
                    borderBottom: '1px solid #f1f1f2',
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#666',
                      paddingTop: 6,
                    }}
                  >
                    #{idx}
                  </div>
                  <div
                    style={{
                      width: 96,
                      height: 54,
                      borderRadius: 4,
                      background: '#e5e7eb',
                      backgroundImage: image ? `url(${image})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        className="pill"
                        style={{
                          background: it.kind === 'ad' ? '#fef3c7' : '#dbeafe',
                          color: it.kind === 'ad' ? '#92400e' : '#1e40af',
                        }}
                      >
                        {it.kind}
                      </span>
                      {it.kind === 'article' && it.fetched?.fetched_at && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          fetched {new Date(it.fetched.fetched_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {isEdit ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, title: e.target.value }))
                          }
                          placeholder="Override title (leave blank to use og: title)"
                          style={{
                            padding: '6px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        />
                        <input
                          type="url"
                          value={editForm.image}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, image: e.target.value }))
                          }
                          placeholder="Override image URL (blank = og:image)"
                          style={{
                            padding: '6px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                        {it.kind === 'article' && it.url && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}>
                            {it.url}
                          </div>
                        )}
                        {it.kind === 'ad' && ad && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {ad.brand} · campaign: {ad.campaign}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      alignItems: 'stretch',
                    }}
                  >
                    {isEdit ? (
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => saveEdit(it)}
                          disabled={busy}
                          style={{ padding: '2px 8px' }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setEditing(null)}
                          disabled={busy}
                          style={{ padding: '2px 8px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 4 }}>
                        {it.kind === 'article' && (
                          <>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => refreshMeta(it)}
                              disabled={busy}
                              title="Re-fetch og: tags"
                              style={{ padding: '2px 8px' }}
                            >
                              ↻
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => startEdit(it)}
                              disabled={busy}
                              style={{ padding: '2px 8px' }}
                            >
                              Override
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => del(it)}
                          disabled={busy}
                          style={{ padding: '2px 8px' }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
