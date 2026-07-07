'use client';

import { useState } from 'react';
import type { AdMode, FeedItem, MockAd, RealAd } from '../lib/types';

type ItemDoc = FeedItem & { _id: string };

interface Props {
  feedId: string;
  adRatio: number;
  initialAdMode: AdMode;
  initialRealAdId: string | null;
  initialItems: ItemDoc[];
  ads: MockAd[];
  realAds: RealAd[];
}

export default function FeedItemEditor({
  feedId,
  adRatio,
  initialAdMode,
  initialRealAdId,
  initialItems,
  ads,
  realAds,
}: Props) {
  const [items, setItems] = useState<ItemDoc[]>(initialItems);
  const [urlsText, setUrlsText] = useState('');
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adMode, setAdMode] = useState<AdMode>(initialAdMode);
  const [selectedRealAdId, setSelectedRealAdId] = useState<string>(initialRealAdId ?? '');
  const [realAdsBusy, setRealAdsBusy] = useState(false);
  const [realAdsMsg, setRealAdsMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; image: string }>({
    title: '',
    image: '',
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [adCopies, setAdCopies] = useState(1);
  const [attachingFor, setAttachingFor] = useState<string | null>(null);
  const [currentRatio, setCurrentRatio] = useState(adRatio);
  const [bannerN, setBannerN] = useState(1);
  const [bannerM, setBannerM] = useState(2);
  const [bannerRealAdId, setBannerRealAdId] = useState('');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

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
    const selected = Array.from(selectedAdIds);
    if (selected.length === 0) return;
    const copies = Math.max(1, Math.min(50, adCopies || 1));
    // Repeat each selected ad `copies` times — the same mock ad may appear
    // multiple times in a feed.
    const ad_ids: string[] = [];
    for (const id of selected) {
      for (let i = 0; i < copies; i++) ad_ids.push(id);
    }
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
      setAdCopies(1);
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

  function realAdName(id: string) {
    const ra = realAds.find((r) => r.real_ad_id === id);
    return ra ? ra.name : id;
  }

  async function setAttachedRealAd(item: ItemDoc, realAdId: string | null) {
    setAttachingFor(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feed-items/${item._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attached_real_ad_id: realAdId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || `HTTP ${res.status}`);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
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

  async function applyRatio(r: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}/apply-ratio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratio: r }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setItems(data.items);
      setCurrentRatio(r);
    } finally {
      setBusy(false);
    }
  }

  async function applyBanners() {
    if (!bannerRealAdId) return;
    setBusy(true);
    setError(null);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}/apply-banners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ real_ad_id: bannerRealAdId, n: bannerN, m: bannerM }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setItems(data.items);
      setBannerMsg(
        `Attached to ${data.attached} of ${data.articles} article${data.articles === 1 ? '' : 's'}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const adsById = new Map(ads.map((a) => [a.ad_id, a]));
  // How many times each ad already appears in this feed (an ad may repeat).
  const adUseCount = new Map<string, number>();
  for (const it of items) {
    if (it.kind === 'ad' && it.ad_id) {
      adUseCount.set(it.ad_id, (adUseCount.get(it.ad_id) ?? 0) + 1);
    }
  }
  const availableAds = ads; // all active ads — the same ad can be added repeatedly
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
        body: JSON.stringify({
          ad_mode: mode,
          real_ad_id: selectedRealAdId || null,
        }),
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
          Pick from active ads. The same ad can be added multiple times — set{' '}
          <strong>Copies</strong> to add several at once.
        </p>
        {ads.length === 0 ? (
          <div className="empty" style={{ padding: 16, fontSize: 13 }}>
            No active ads — create one in <code>/admin/ads</code>.
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
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.title}
                      </span>
                      {adUseCount.get(a.ad_id) ? (
                        <span
                          className="pill"
                          style={{ background: '#fef3c7', color: '#92400e', flexShrink: 0 }}
                        >
                          ×{adUseCount.get(a.ad_id)} in feed
                        </span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      <code>{a.ad_id}</code> · {a.brand}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {selectedAdIds.size} selected
          </span>
          <label
            className="muted"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            Copies
            <input
              type="number"
              min={1}
              max={50}
              value={adCopies}
              onChange={(e) =>
                setAdCopies(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))
              }
              disabled={busy}
              style={{
                width: 52,
                padding: '4px 6px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={addAds}
            disabled={busy || selectedAdIds.size === 0}
          >
            {(() => {
              const n = selectedAdIds.size * Math.max(1, adCopies || 1);
              return `Add ${selectedAdIds.size > 0 ? n : ''} ad${n === 1 ? '' : 's'}`;
            })()}
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
          In <strong>Live</strong> mode every ad slot renders the chosen real ad instead of a mock
          ad. Manage real ad scripts in <strong>Ads → Real Ads</strong>.
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
              opacity: selectedRealAdId ? 1 : 0.85,
            }}
          >
            <input
              type="radio"
              name={`adMode-${feedId}`}
              checked={adMode === 'live'}
              onChange={() => selectedRealAdId && saveRealAds('live')}
              disabled={realAdsBusy || !selectedRealAdId}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Live mode
                {!selectedRealAdId && (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                    (choose a real ad first)
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Render each ad slot using the real ad selected below.
              </div>
            </div>
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Real ad</span>
          {realAds.length === 0 ? (
            <div className="empty" style={{ padding: '10px 12px', fontSize: 13 }}>
              No real ads yet — add one in <strong>Ads → Real Ads</strong>.
            </div>
          ) : (
            <select
              value={selectedRealAdId}
              onChange={(e) => setSelectedRealAdId(e.target.value)}
              disabled={realAdsBusy}
              style={{
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'inherit',
                background: '#fff',
              }}
            >
              <option value="">— None selected —</option>
              {realAds.map((ra) => (
                <option key={ra.real_ad_id} value={ra.real_ad_id}>
                  {ra.name} ({ra.real_ad_id})
                </option>
              ))}
            </select>
          )}
          {selectedRealAdId && (() => {
            const ra = realAds.find((r) => r.real_ad_id === selectedRealAdId);
            return ra ? (
              <span className="muted" style={{ fontSize: 11 }}>
                {ra.snippet ? (
                  <code>{ra.snippet.slice(0, 80)}{ra.snippet.length > 80 ? '…' : ''}</code>
                ) : 'No snippet'}
              </span>
            ) : null;
          })()}
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
            {realAdsBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Ads under articles (bulk)</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Attach a real-ad banner under a fraction of the article cards, spread evenly. Sets it on the
          chosen share and clears it from all other articles.
        </p>
        {realAds.length === 0 ? (
          <div className="empty" style={{ padding: 16, fontSize: 13 }}>
            No real ads yet — add one in <strong>Ads → Real Ads</strong>.
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12 }}>Presets</span>
              {([[1, 2], [1, 3], [2, 5], [3, 4]] as [number, number][]).map(([n, m]) => (
                <button
                  key={`${n}/${m}`}
                  type="button"
                  className={`btn${bannerN === n && bannerM === m ? ' btn-primary' : ''}`}
                  onClick={() => {
                    setBannerN(n);
                    setBannerM(m);
                  }}
                  disabled={busy}
                  style={{ padding: '2px 10px', fontSize: 12 }}
                >
                  {n}/{m}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span className="muted">Fraction (n / m)</span>
                <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    max={bannerM}
                    value={bannerN}
                    onChange={(e) => setBannerN(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    disabled={busy}
                    style={{ width: 52, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                  />
                  <span>/</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={bannerM}
                    onChange={(e) => setBannerM(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    disabled={busy}
                    style={{ width: 52, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 1, minWidth: 180 }}>
                <span className="muted">Real ad</span>
                <select
                  value={bannerRealAdId}
                  onChange={(e) => setBannerRealAdId(e.target.value)}
                  disabled={busy}
                  style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' }}
                >
                  <option value="">Choose a real ad…</option>
                  {realAds.map((ra) => (
                    <option key={ra.real_ad_id} value={ra.real_ad_id}>
                      {ra.name} ({ra.real_ad_id})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={applyBanners}
                disabled={busy || !bannerRealAdId || bannerN > bannerM || bannerM < 1}
                style={{ whiteSpace: 'nowrap' }}
              >
                Apply {bannerN}/{bannerM}
              </button>
            </div>
            {bannerMsg && <div style={{ color: '#065f46', fontSize: 12 }}>{bannerMsg}</div>}
          </>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div>
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
                Drag the <span style={{ fontSize: 14 }}>⠿</span> handle to reorder. New items are
                added to the end.
              </p>
            </div>
            <div className="row" style={{ gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <span className="muted" style={{ fontSize: 12 }}>Ratio</span>
              {[1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn${currentRatio === r ? ' btn-primary' : ''}`}
                  onClick={() => applyRatio(r)}
                  disabled={busy}
                  title={`${r} article${r === 1 ? '' : 's'} : 1 ad — fill from active mock ads and interleave`}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  {r}/1
                </button>
              ))}
            </div>
          </div>
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
                  onDragOver={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    if (overIndex !== idx) setOverIndex(idx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(idx);
                  }}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 12,
                    borderBottom: '1px solid #f1f1f2',
                    borderTop:
                      dragIndex !== null && overIndex === idx && dragIndex !== idx
                        ? '2px solid #3b82f6'
                        : '2px solid transparent',
                    alignItems: 'flex-start',
                    background: dragIndex === idx ? '#eff6ff' : '#fff',
                    opacity: dragIndex === idx ? 0.4 : 1,
                  }}
                >
                  <div
                    draggable={!isEdit && !busy}
                    onDragStart={(e) => {
                      setDragIndex(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      try {
                        e.dataTransfer.setData('text/plain', String(idx));
                      } catch {}
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    title={isEdit ? '' : 'Drag to reorder'}
                    style={{
                      width: 32,
                      textAlign: 'center',
                      paddingTop: 4,
                      color: '#9ca3af',
                      cursor: isEdit || busy ? 'default' : 'grab',
                      userSelect: 'none',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 15, lineHeight: 1 }}>⠿</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>#{idx}</div>
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
                    {!isEdit && it.kind === 'article' && (
                      <div style={{ marginTop: 8 }}>
                        {it.attached_real_ad_id ? (
                          <span
                            className="pill"
                            style={{
                              background: '#ede9fe',
                              color: '#5b21b6',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            Ad under article: {realAdName(it.attached_real_ad_id)}
                            <button
                              type="button"
                              onClick={() => setAttachedRealAd(it, null)}
                              disabled={busy}
                              title="Remove ad"
                              style={{
                                border: 0,
                                background: 'transparent',
                                cursor: 'pointer',
                                color: '#5b21b6',
                                fontSize: 13,
                                lineHeight: 1,
                                padding: 0,
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : attachingFor === it._id ? (
                          <select
                            autoFocus
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => e.target.value && setAttachedRealAd(it, e.target.value)}
                            onBlur={() => setAttachingFor(null)}
                            style={{
                              fontSize: 12,
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #d1d5db',
                            }}
                          >
                            <option value="" disabled>
                              {realAds.length
                                ? 'Choose a real ad…'
                                : 'No real ads — add in Ads → Real Ads'}
                            </option>
                            {realAds.map((ra) => (
                              <option key={ra.real_ad_id} value={ra.real_ad_id}>
                                {ra.name} ({ra.real_ad_id})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setAttachingFor(it._id)}
                            disabled={busy}
                            style={{ padding: '2px 10px', fontSize: 12 }}
                            title="Render a real-ad script in a slot under this article's header"
                          >
                            + Ad under article
                          </button>
                        )}
                      </div>
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
