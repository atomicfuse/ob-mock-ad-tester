'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedInitiative, AdMode, RealAd } from '../lib/types';

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<FeedInitiative>;
  realAds: RealAd[];
}

// Trimmed FeedForm for fact decks — no scroll trigger / CTA chip / next_feeds
// (the deck UI has its own start screen and never chains). Everything else
// (ad ratio, ad mode, real ad, subid, dedupe) works exactly like feeds and
// posts to the same endpoints.
export default function FactForm({ mode, initial, realAds }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    feed_id: initial?.feed_id ?? '',
    name: initial?.name ?? '',
    status: (initial?.status ?? 'active') as 'active' | 'paused',
    ad_ratio: initial?.ad_ratio ?? 4,
    ad_mode: (initial?.ad_mode ?? 'demo') as AdMode,
    real_ad_id: initial?.real_ad_id ?? '',
    default_subid: initial?.default_subid ?? '',
    live_ad_dedupe: initial?.live_ad_dedupe ?? false,
    deck_knew_label: initial?.deck_knew_label ?? '',
    deck_blow_label: initial?.deck_blow_label ?? '',
    deck_skip_label: initial?.deck_skip_label ?? '',
    deck_ad_top_real_ad_id: initial?.deck_ad_top_real_ad_id ?? '',
    deck_ad_bottom_real_ad_id: initial?.deck_ad_bottom_real_ad_id ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      ...(mode === 'create' ? { feed_id: form.feed_id, feed_type: 'facts' } : {}),
      name: form.name,
      status: form.status,
      ad_ratio: Number(form.ad_ratio) || 4,
      ad_mode: form.ad_mode,
      real_ad_id: form.real_ad_id || null,
      default_subid: form.default_subid.trim(),
      live_ad_dedupe: form.live_ad_dedupe,
      deck_knew_label: form.deck_knew_label.trim(),
      deck_blow_label: form.deck_blow_label.trim(),
      deck_skip_label: form.deck_skip_label.trim(),
      deck_ad_top_real_ad_id: form.deck_ad_top_real_ad_id,
      deck_ad_bottom_real_ad_id: form.deck_ad_bottom_real_ad_id,
    };
    try {
      const url = mode === 'create' ? '/api/admin/feeds' : `/api/admin/feeds/${form.feed_id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      router.push(mode === 'create' ? `/admin/facts/${form.feed_id}` : '/admin/facts');
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Request failed');
      setSubmitting(false);
    }
  }

  return (
    <form className="form card" onSubmit={onSubmit}>
      <div>
        <label htmlFor="feed_id">Deck ID</label>
        <input
          id="feed_id"
          value={form.feed_id}
          onChange={(e) => update('feed_id', e.target.value)}
          disabled={mode === 'edit'}
          placeholder="facts_daily"
          required
        />
      </div>
      <div>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Daily Deck"
          required
        />
      </div>
      <div>
        <label htmlFor="status">Status</label>
        <select
          id="status"
          value={form.status}
          onChange={(e) => update('status', e.target.value as 'active' | 'paused')}
        >
          <option value="active">active</option>
          <option value="paused">paused</option>
        </select>
      </div>
      <div>
        <label htmlFor="ad_ratio">Ad ratio (1 ad per N facts)</label>
        <input
          id="ad_ratio"
          type="number"
          min={1}
          value={form.ad_ratio}
          onChange={(e) => update('ad_ratio', Number(e.target.value))}
        />
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Saving auto-inserts and interleaves ad cards at this ratio.
        </p>
      </div>
      <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <legend style={{ fontWeight: 600, fontSize: 14 }}>Ad Mode</legend>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              cursor: 'pointer',
              textTransform: 'none',
              fontWeight: 400,
              fontSize: 13,
              color: '#111',
            }}
          >
            <input
              type="radio"
              name="ad_mode"
              checked={form.ad_mode === 'demo'}
              onChange={() => update('ad_mode', 'demo')}
              style={{ width: 'auto' }}
            />
            Demo — real-ad script with <code>feedid: demo_default</code> / <code>auth: demo</code>
          </label>
          <label
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              cursor: 'pointer',
              textTransform: 'none',
              fontWeight: 400,
              fontSize: 13,
              color: '#111',
            }}
          >
            <input
              type="radio"
              name="ad_mode"
              checked={form.ad_mode === 'live'}
              onChange={() => update('ad_mode', 'live')}
              style={{ width: 'auto' }}
            />
            Live — real-ad script served as-is
          </label>
        </div>
        <div>
          <label htmlFor="real_ad_id">Real ad</label>
          {realAds.length === 0 ? (
            <div className="empty" style={{ padding: '10px 12px', fontSize: 13 }}>
              No real ads yet — add one in <strong>Ads → Real Ads</strong>.
            </div>
          ) : (
            <select
              id="real_ad_id"
              value={form.real_ad_id}
              onChange={(e) => update('real_ad_id', e.target.value)}
            >
              <option value="">— None selected —</option>
              {realAds.map((ra) => (
                <option key={ra.real_ad_id} value={ra.real_ad_id}>
                  {ra.name} ({ra.real_ad_id})
                </option>
              ))}
            </select>
          )}
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Every ad card renders this real ad.
          </p>
          {!form.real_ad_id && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              No real ad selected — this deck will show no ads until you choose one.
            </p>
          )}
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <legend style={{ fontWeight: 600, fontSize: 14 }}>Banner Ads (around the card)</legend>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Persistent real-ad slots rendered above and below the card stack. Tracked as banner
          placement in analytics, same as feed banners.
        </p>
        <div>
          <label htmlFor="deck_ad_top">Ad above the card</label>
          <select
            id="deck_ad_top"
            value={form.deck_ad_top_real_ad_id}
            onChange={(e) => update('deck_ad_top_real_ad_id', e.target.value)}
          >
            <option value="">— None —</option>
            {realAds.map((ra) => (
              <option key={ra.real_ad_id} value={ra.real_ad_id}>
                {ra.name} ({ra.real_ad_id})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deck_ad_bottom">Ad below the card</label>
          <select
            id="deck_ad_bottom"
            value={form.deck_ad_bottom_real_ad_id}
            onChange={(e) => update('deck_ad_bottom_real_ad_id', e.target.value)}
          >
            <option value="">— None —</option>
            {realAds.map((ra) => (
              <option key={ra.real_ad_id} value={ra.real_ad_id}>
                {ra.name} ({ra.real_ad_id})
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <legend style={{ fontWeight: 600, fontSize: 14 }}>Button Labels</legend>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Customize the swipe buttons. Leave empty for the defaults shown as placeholders.
        </p>
        <div>
          <label htmlFor="deck_knew_label">Left button (swipe left)</label>
          <input
            id="deck_knew_label"
            value={form.deck_knew_label}
            onChange={(e) => update('deck_knew_label', e.target.value)}
            placeholder="😎 Knew it"
            maxLength={40}
          />
        </div>
        <div>
          <label htmlFor="deck_blow_label">Right button (swipe right)</label>
          <input
            id="deck_blow_label"
            value={form.deck_blow_label}
            onChange={(e) => update('deck_blow_label', e.target.value)}
            placeholder="Blew my mind 🤯"
            maxLength={40}
          />
        </div>
        <div>
          <label htmlFor="deck_skip_label">Skip button (on ad cards)</label>
          <input
            id="deck_skip_label"
            value={form.deck_skip_label}
            onChange={(e) => update('deck_skip_label', e.target.value)}
            placeholder="Skip →"
            maxLength={40}
          />
        </div>
      </fieldset>
      <div>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            cursor: 'pointer',
            textTransform: 'none',
            fontWeight: 400,
            fontSize: 13,
            color: '#111',
          }}
        >
          <input
            type="checkbox"
            checked={form.live_ad_dedupe}
            onChange={(e) => update('live_ad_dedupe', e.target.checked)}
            style={{ width: 'auto' }}
          />
          Skip duplicate live ads (per session)
        </label>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          When on, the deck hides a live-ad card if the same creative already appeared earlier in
          the visitor&apos;s session.
        </p>
      </div>
      <div>
        <label htmlFor="default_subid">Default sub ID</label>
        <input
          id="default_subid"
          value={form.default_subid}
          onChange={(e) => update('default_subid', e.target.value)}
          placeholder="e.g. factsorg1"
        />
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Used for the <code>{'{{SUBID}}'}</code> macro in real-ad snippets when the visit URL has
          no <code>sub</code> param (organic traffic). Letters, digits, _ and - only.
        </p>
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create Deck' : 'Save Changes'}
        </button>
        <a href="/admin/facts" className="btn">
          Cancel
        </a>
      </div>
    </form>
  );
}
