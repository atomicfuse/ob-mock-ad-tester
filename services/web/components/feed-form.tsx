'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedInitiative, CtaPosition, CtaSize } from '../lib/types';

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<FeedInitiative>;
}

export default function FeedForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    feed_id: initial?.feed_id ?? '',
    name: initial?.name ?? '',
    status: (initial?.status ?? 'active') as 'active' | 'paused',
    trigger_mode: (initial?.trigger?.mode ?? 'scroll') as 'scroll' | 'manual',
    scroll_depth_px: initial?.trigger?.scroll_depth_px ?? 1500,
    cta_position: (initial?.trigger?.cta_position ?? 'sticky-bottom-center') as CtaPosition,
    cta_text: initial?.trigger?.cta_text ?? '\uD83D\uDCF0 See more stories',
    cta_bg_color: initial?.trigger?.cta_bg_color ?? '#111111',
    cta_text_color: initial?.trigger?.cta_text_color ?? '#ffffff',
    cta_size: (initial?.trigger?.cta_size ?? 'medium') as CtaSize,
    ad_ratio: initial?.ad_ratio ?? 3,
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
      ...(mode === 'create' ? { feed_id: form.feed_id } : {}),
      name: form.name,
      status: form.status,
      trigger: {
        mode: form.trigger_mode,
        scroll_depth_px: Number(form.scroll_depth_px) || 0,
        cta_position: form.cta_position,
        cta_text: form.cta_text,
        cta_bg_color: form.cta_bg_color,
        cta_text_color: form.cta_text_color,
        cta_size: form.cta_size,
      },
      ad_ratio: Number(form.ad_ratio) || 3,
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
      router.push(mode === 'create' ? `/admin/feeds/${form.feed_id}` : '/admin/feeds');
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Request failed');
      setSubmitting(false);
    }
  }

  return (
    <form className="form card" onSubmit={onSubmit}>
      <div>
        <label htmlFor="feed_id">Feed ID</label>
        <input
          id="feed_id"
          value={form.feed_id}
          onChange={(e) => update('feed_id', e.target.value)}
          disabled={mode === 'edit'}
          placeholder="feed_homepage"
          required
        />
      </div>
      <div>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Homepage Infinite Feed"
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
        <label htmlFor="trigger_mode">Trigger</label>
        <select
          id="trigger_mode"
          value={form.trigger_mode}
          onChange={(e) => update('trigger_mode', e.target.value as 'scroll' | 'manual')}
        >
          <option value="scroll">scroll — auto-takeover at depth</option>
          <option value="manual">manual — CTA chip user taps</option>
        </select>
      </div>
      {form.trigger_mode === 'scroll' && (
        <div>
          <label htmlFor="scroll_depth_px">Scroll depth (px)</label>
          <input
            id="scroll_depth_px"
            type="number"
            min={0}
            value={form.scroll_depth_px}
            onChange={(e) => update('scroll_depth_px', Number(e.target.value))}
          />
        </div>
      )}
      {form.trigger_mode === 'manual' && (
        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>CTA Chip Settings</legend>
          <div>
            <label htmlFor="cta_position">Position</label>
            <select
              id="cta_position"
              value={form.cta_position}
              onChange={(e) => update('cta_position', e.target.value as CtaPosition)}
            >
              <optgroup label="Sticky (fixed on screen)">
                <option value="sticky-bottom-center">Bottom center</option>
                <option value="sticky-bottom-left">Bottom left</option>
                <option value="sticky-bottom-right">Bottom right</option>
                <option value="sticky-top-center">Top center</option>
                <option value="sticky-top-left">Top left</option>
                <option value="sticky-top-right">Top right</option>
              </optgroup>
              <optgroup label="Non-sticky">
                <option value="inline">Inline (renders where the script is placed)</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label htmlFor="cta_text">Button text</label>
            <input
              id="cta_text"
              value={form.cta_text}
              onChange={(e) => update('cta_text', e.target.value)}
              placeholder="📰 See more stories"
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="cta_bg_color">Background color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="cta_bg_color"
                  type="color"
                  value={form.cta_bg_color}
                  onChange={(e) => update('cta_bg_color', e.target.value)}
                  style={{ width: 40, height: 34, padding: 2, cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={form.cta_bg_color}
                  onChange={(e) => update('cta_bg_color', e.target.value)}
                  style={{ flex: 1 }}
                  maxLength={7}
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="cta_text_color">Text color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="cta_text_color"
                  type="color"
                  value={form.cta_text_color}
                  onChange={(e) => update('cta_text_color', e.target.value)}
                  style={{ width: 40, height: 34, padding: 2, cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={form.cta_text_color}
                  onChange={(e) => update('cta_text_color', e.target.value)}
                  style={{ flex: 1 }}
                  maxLength={7}
                />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="cta_size">Size</label>
            <select
              id="cta_size"
              value={form.cta_size}
              onChange={(e) => update('cta_size', e.target.value as CtaSize)}
            >
              <option value="small">Small</option>
              <option value="medium">Medium (default)</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div
            style={{
              marginTop: 4,
              padding: '12px 16px',
              background: '#f9fafb',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: '#6b7280', marginRight: 12 }}>Preview:</span>
            <button
              type="button"
              style={{
                background: form.cta_bg_color,
                color: form.cta_text_color,
                padding:
                  form.cta_size === 'small'
                    ? '8px 14px'
                    : form.cta_size === 'large'
                      ? '16px 28px'
                      : '12px 20px',
                borderRadius: 9999,
                fontSize: form.cta_size === 'small' ? 12 : form.cta_size === 'large' ? 16 : 14,
                fontWeight: 600,
                border: 0,
                cursor: 'default',
                boxShadow: '0 4px 12px rgba(0,0,0,.15)',
              }}
            >
              {form.cta_text || 'See more stories'}
            </button>
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="ad_ratio">Ad ratio (1 ad per N items)</label>
        <input
          id="ad_ratio"
          type="number"
          min={1}
          value={form.ad_ratio}
          onChange={(e) => update('ad_ratio', Number(e.target.value))}
        />
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create Feed' : 'Save Changes'}
        </button>
        <a href="/admin/feeds" className="btn">
          Cancel
        </a>
      </div>
    </form>
  );
}
