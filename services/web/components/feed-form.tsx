'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedInitiative } from '../lib/types';

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
