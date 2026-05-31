'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { MockAd } from '../lib/types';

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<MockAd>;
}

export default function AdForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    ad_id: initial?.ad_id ?? '',
    campaign: initial?.campaign ?? '',
    title: initial?.title ?? '',
    brand: initial?.brand ?? '',
    image_url: initial?.image_url ?? '',
    landing_page: initial?.landing_page ?? '',
    status: (initial?.status ?? 'active') as 'active' | 'paused',
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
    try {
      const url = mode === 'create' ? '/api/admin/ads' : `/api/admin/ads/${form.ad_id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const payload = mode === 'create' ? form : (() => {
        const { ad_id, ...rest } = form;
        return rest;
      })();
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
      router.push(mode === 'create' ? `/admin/ads/${form.ad_id}` : '/admin/ads');
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Request failed');
      setSubmitting(false);
    }
  }

  return (
    <form className="form card" onSubmit={onSubmit}>
      <div>
        <label htmlFor="ad_id">Ad ID</label>
        <input
          id="ad_id"
          value={form.ad_id}
          onChange={(e) => update('ad_id', e.target.value)}
          disabled={mode === 'edit'}
          placeholder="ad_001"
          required
        />
      </div>
      <div>
        <label htmlFor="campaign">Campaign</label>
        <input
          id="campaign"
          value={form.campaign}
          onChange={(e) => update('campaign', e.target.value)}
          placeholder="finance_test"
          required
        />
      </div>
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="This Tool Helps People Save More Every Month"
          required
        />
      </div>
      <div>
        <label htmlFor="brand">Brand</label>
        <input
          id="brand"
          value={form.brand}
          onChange={(e) => update('brand', e.target.value)}
          placeholder="CloudGrid.ai"
          required
        />
      </div>
      <div>
        <label htmlFor="image_url">Image URL</label>
        <input
          id="image_url"
          type="url"
          value={form.image_url}
          onChange={(e) => update('image_url', e.target.value)}
          placeholder="https://example.com/finance.jpg"
          required
        />
      </div>
      <div>
        <label htmlFor="landing_page">Landing Page</label>
        <input
          id="landing_page"
          type="url"
          value={form.landing_page}
          onChange={(e) => update('landing_page', e.target.value)}
          placeholder="https://example.com/landing-page"
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
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create Ad' : 'Save Changes'}
        </button>
        <a href="/admin/ads" className="btn">
          Cancel
        </a>
      </div>
    </form>
  );
}
