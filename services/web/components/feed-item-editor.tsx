'use client';

import { useState } from 'react';
import type { FeedItem, RealAd } from '../lib/types';

type ItemDoc = FeedItem & { _id: string };

interface CardRowError {
  index: number;
  field: string;
  message: string;
}

interface Props {
  feedId: string;
  initialItems: ItemDoc[];
  realAds: RealAd[];
}

export default function FeedItemEditor({
  feedId,
  initialItems,
  realAds,
}: Props) {
  const [items, setItems] = useState<ItemDoc[]>(initialItems);
  const [urlsText, setUrlsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    image: string;
    heading: string;
    text: string;
    cardImage: string;
  }>({
    title: '',
    image: '',
    heading: '',
    text: '',
    cardImage: '',
  });
  const [cardsText, setCardsText] = useState('');
  const [cardsMode, setCardsMode] = useState<'replace' | 'append'>('replace');
  const [cardsRename, setCardsRename] = useState(false);
  const [cardsBusy, setCardsBusy] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardsRowErrors, setCardsRowErrors] = useState<CardRowError[]>([]);
  const [cardsMsg, setCardsMsg] = useState<string | null>(null);
  const [cardsCopied, setCardsCopied] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [attachingFor, setAttachingFor] = useState<string | null>(null);
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
    setEditError(null);
    if (item.kind === 'card') {
      setEditForm({
        title: '',
        image: '',
        heading: item.card?.heading ?? '',
        text: item.card?.text ?? '',
        cardImage: item.card?.image ?? '',
      });
    } else {
      setEditForm({
        title: item.override?.title ?? '',
        image: item.override?.image ?? '',
        heading: '',
        text: '',
        cardImage: '',
      });
    }
  }

  async function saveEdit(item: ItemDoc) {
    setBusy(true);
    setEditError(null);
    const body =
      item.kind === 'card'
        ? {
            card: {
              heading: editForm.heading,
              text: editForm.text || undefined,
              image: editForm.cardImage,
            },
          }
        : {
            override: {
              title: editForm.title || undefined,
              image: editForm.image || undefined,
            },
          };
    try {
      const res = await fetch(`/api/admin/feed-items/${item._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setEditError(b.error || `HTTP ${res.status}`);
        return; // keep the edit form open so the admin can fix and retry
      }
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function importCards() {
    let parsed: any;
    try {
      parsed = JSON.parse(cardsText);
    } catch {
      setCardsError('Invalid JSON');
      setCardsRowErrors([]);
      return;
    }
    setCardsBusy(true);
    setCardsError(null);
    setCardsRowErrors([]);
    setCardsMsg(null);
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          mode: cardsMode,
          renameFeed: cardsMode === 'replace' && cardsRename,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        if (Array.isArray(b.row_errors)) {
          setCardsRowErrors(b.row_errors);
        } else {
          setCardsError(b.error || `HTTP ${res.status}`);
        }
        return;
      }
      const data = await res.json();
      setItems(data.items);
      setCardsMsg(`Imported ${data.added ?? 0} card${data.added === 1 ? '' : 's'}.`);
    } catch (e: any) {
      setCardsError(e?.message ?? 'Import failed');
    } finally {
      setCardsBusy(false);
    }
  }

  async function exportCards() {
    setCardsBusy(true);
    setCardsError(null);
    setCardsRowErrors([]);
    setCardsMsg(null);
    try {
      const res = await fetch(`/api/admin/feeds/${encodeURIComponent(feedId)}/cards`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setCardsError(b.error || `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const pretty = JSON.stringify(data, null, 2);
      setCardsText(pretty);
      try {
        await navigator.clipboard.writeText(pretty);
        setCardsCopied(true);
        setTimeout(() => setCardsCopied(false), 1500);
      } catch {
        // best-effort — clipboard access may be denied
      }
    } catch (e: any) {
      setCardsError(e?.message ?? 'Export failed');
    } finally {
      setCardsBusy(false);
    }
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
        `Attached to ${data.attached} of ${data.eligible} item${data.eligible === 1 ? '' : 's'} (articles + cards).`,
      );
    } finally {
      setBusy(false);
    }
  }

  const articleCount = items.filter((it) => it.kind === 'article').length;
  const cardCount = items.filter((it) => it.kind === 'card').length;
  const adCount = items.length - articleCount - cardCount;

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
        <h2 style={{ margin: 0 }}>Listicle cards</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Paste a JSON blob to bulk-add non-clickable listicle cards:{' '}
          <code>{'{ title?, items: [{ heading, text?, image_url }] }'}</code>.
        </p>
        <textarea
          value={cardsText}
          onChange={(e) => setCardsText(e.target.value)}
          placeholder={
            '{\n  "title": "46 Things Everyone Had in the 90s But No Longer Exist",\n  "items": [\n    { "heading": "The rewind pencil trick", "text": "Optional blurb.", "image_url": "https://example.com/img1.jpg" }\n  ]\n}'
          }
          rows={8}
          disabled={cardsBusy}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            resize: 'vertical',
          }}
        />
        <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}
          >
            <input
              type="radio"
              name={`cardsMode-${feedId}`}
              checked={cardsMode === 'replace'}
              onChange={() => setCardsMode('replace')}
              disabled={cardsBusy}
            />
            Replace all cards
          </label>
          <label
            style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}
          >
            <input
              type="radio"
              name={`cardsMode-${feedId}`}
              checked={cardsMode === 'append'}
              onChange={() => setCardsMode('append')}
              disabled={cardsBusy}
            />
            Append
          </label>
        </div>
        <label
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            fontSize: 13,
            cursor: cardsMode === 'replace' ? 'pointer' : 'default',
            opacity: cardsMode === 'replace' ? 1 : 0.5,
          }}
        >
          <input
            type="checkbox"
            checked={cardsRename}
            onChange={(e) => setCardsRename(e.target.checked)}
            disabled={cardsBusy || cardsMode !== 'replace'}
          />
          Also rename this feed to the pasted title
        </label>
        {cardsRowErrors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cardsRowErrors.map((e, i) => (
              <div key={i} style={{ color: '#b91c1c', fontSize: 12 }}>
                {e.index >= 0 ? `Row ${e.index + 1} — ` : ''}
                {e.field}: {e.message}
              </div>
            ))}
          </div>
        )}
        {cardsError && <div style={{ color: '#b91c1c', fontSize: 13 }}>{cardsError}</div>}
        {cardsMsg && <div style={{ color: '#065f46', fontSize: 12 }}>{cardsMsg}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={exportCards} disabled={cardsBusy}>
            {cardsCopied ? 'Copied' : 'Export'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={importCards}
            disabled={cardsBusy || !cardsText.trim()}
          >
            Import
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Ads under articles/cards (bulk)</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Attach a real-ad banner under a fraction of the article/card items, spread evenly. Sets it on the
          chosen share and clears it from all other articles/cards.
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
                    — {articleCount} article{articleCount === 1 ? '' : 's'}
                    {cardCount > 0 ? `, ${cardCount} card${cardCount === 1 ? '' : 's'}` : ''}, {adCount} ad
                    {adCount === 1 ? '' : 's'}
                  </span>
                )}
                )
              </h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                Drag the <span style={{ fontSize: 14 }}>⠿</span> handle to reorder. Ad slots are
                inserted automatically by ratio when you save the feed settings.
              </p>
            </div>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: 32 }}>
            No items yet — add some articles or cards above.
          </div>
        ) : (
          <div>
            {items.map((it, idx) => {
              const title =
                it.override?.title ||
                it.fetched?.title ||
                (it.kind === 'ad' ? 'Ad slot' : null) ||
                it.card?.heading ||
                '(no title yet)';
              const image =
                it.override?.image ||
                it.fetched?.image ||
                it.card?.image ||
                '';
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
                          background:
                            it.kind === 'ad' ? '#fef3c7' : it.kind === 'card' ? '#dcfce7' : '#dbeafe',
                          color:
                            it.kind === 'ad' ? '#92400e' : it.kind === 'card' ? '#166534' : '#1e40af',
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
                      it.kind === 'card' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input
                            type="text"
                            value={editForm.heading}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, heading: e.target.value }))
                            }
                            placeholder="Heading"
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 13,
                            }}
                          />
                          <textarea
                            value={editForm.text}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, text: e.target.value }))
                            }
                            placeholder="Text (optional)"
                            rows={3}
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 13,
                              fontFamily: 'inherit',
                              resize: 'vertical',
                            }}
                          />
                          <input
                            type="url"
                            value={editForm.cardImage}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, cardImage: e.target.value }))
                            }
                            placeholder="Image URL"
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 13,
                            }}
                          />
                          {editError && (
                            <div style={{ color: '#b91c1c', fontSize: 13 }}>{editError}</div>
                          )}
                        </div>
                      ) : (
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
                          {editError && (
                            <div style={{ color: '#b91c1c', fontSize: 13 }}>{editError}</div>
                          )}
                        </div>
                      )
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                        {it.kind === 'article' && it.url && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}>
                            {it.url}
                          </div>
                        )}
                        {it.kind === 'ad' && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            Auto-inserted ad slot — renders the feed&apos;s real ad.
                          </div>
                        )}
                        {it.kind === 'card' && it.card?.text && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {it.card.text}
                          </div>
                        )}
                      </>
                    )}
                    {!isEdit && it.kind !== 'ad' && (
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
                            Ad under article/card: {realAdName(it.attached_real_ad_id)}
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
                            title="Render a real-ad script in a slot under this article/card's header"
                          >
                            + Ad under article/card
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
                          onClick={() => {
                            setEditing(null);
                            setEditError(null);
                          }}
                          disabled={busy}
                          style={{ padding: '2px 8px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 4 }}>
                        {it.kind === 'article' && (
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
                        )}
                        {(it.kind === 'article' || it.kind === 'card') && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => startEdit(it)}
                            disabled={busy}
                            style={{ padding: '2px 8px' }}
                          >
                            {it.kind === 'card' ? 'Edit' : 'Override'}
                          </button>
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
