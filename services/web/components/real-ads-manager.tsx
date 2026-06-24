'use client';

import { useState } from 'react';
import type { RealAd } from '../lib/types';

interface Props {
  initialAds: RealAd[];
}

const emptyForm = { real_ad_id: '', name: '', head_script: '', snippet: '', ads_per_snippet: 1 };

export default function RealAdsManager({ initialAds }: Props) {
  const [ads, setAds] = useState<RealAd[]>(initialAds);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const res = await fetch('/api/admin/real-ads');
    if (res.ok) setAds(await res.json());
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/real-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          real_ad_id: form.real_ad_id,
          name: form.name,
          head_script: form.head_script,
          snippet: form.snippet,
          ads_per_snippet: form.ads_per_snippet,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `HTTP ${res.status}`); return; }
      setForm({ ...emptyForm });
      setShowForm(false);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/real-ads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          head_script: editForm.head_script,
          snippet: editForm.snippet,
          ads_per_snippet: editForm.ads_per_snippet,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `HTTP ${res.status}`); return; }
      setEditing(null);
      setMsg('Saved.');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm(`Delete real ad "${id}"?`)) return;
    setBusy(true);
    await fetch(`/api/admin/real-ads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await reload();
    setBusy(false);
  }

  function startEdit(ad: RealAd) {
    setEditing(ad.real_ad_id);
    setEditForm({
      real_ad_id: ad.real_ad_id,
      name: ad.name,
      head_script: ad.head_script,
      snippet: ad.snippet,
      ads_per_snippet: ad.ads_per_snippet,
    });
    setError(null);
    setMsg(null);
  }

  const monoStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    resize: 'vertical' as const,
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ads.length === 0 && !showForm && (
        <div className="empty" style={{ padding: 20, fontSize: 13 }}>
          No real ads yet — create one below.
        </div>
      )}

      {ads.map((ad) => {
        const isEdit = editing === ad.real_ad_id;
        return (
          <div key={ad.real_ad_id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{ad.name}</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  <code>{ad.real_ad_id}</code>
                </span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {!isEdit && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => startEdit(ad)}
                    disabled={busy}
                    style={{ padding: '3px 10px', fontSize: 12 }}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => del(ad.real_ad_id)}
                  disabled={busy}
                  style={{ padding: '3px 10px', fontSize: 12 }}
                >
                  Delete
                </button>
              </div>
            </div>

            {isEdit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Name</span>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    disabled={busy}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    Head script <span style={{ fontWeight: 400, color: '#6b7280' }}>(loaded once per page)</span>
                  </span>
                  <textarea
                    value={editForm.head_script}
                    onChange={(e) => setEditForm((f) => ({ ...f, head_script: e.target.value }))}
                    placeholder={'<script src="https://provider.com/sdk.js"></script>'}
                    rows={3}
                    disabled={busy}
                    spellCheck={false}
                    style={monoStyle}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Per-slot embed snippet</span>
                  <textarea
                    value={editForm.snippet}
                    onChange={(e) => setEditForm((f) => ({ ...f, snippet: e.target.value }))}
                    placeholder={'<div id="ad-slot"></div>\n<script>loadAd("ad-slot")</script>'}
                    rows={6}
                    disabled={busy}
                    spellCheck={false}
                    style={monoStyle}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Ads created by this snippet</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={editForm.ads_per_snippet}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setEditForm((f) => ({ ...f, ads_per_snippet: Number.isFinite(n) && n >= 1 ? n : 1 }));
                    }}
                    disabled={busy}
                    style={{ ...inputStyle, width: 90 }}
                  />
                  <span className="muted" style={{ fontSize: 11 }}>
                    1 = single full-bleed ad; 2+ = provider multi-card block in scrollable card.
                  </span>
                </label>
                {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  {msg && <span style={{ color: '#065f46', fontSize: 12 }}>{msg}</span>}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditing(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => save(ad.real_ad_id)}
                    disabled={busy}
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {!isEdit && (
              <div className="muted" style={{ fontSize: 12 }}>
                {ad.snippet ? (
                  <code style={{ fontSize: 11, color: '#6b7280' }}>
                    {ad.snippet.slice(0, 80)}{ad.snippet.length > 80 ? '…' : ''}
                  </code>
                ) : (
                  <span style={{ fontStyle: 'italic' }}>No snippet</span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {showForm ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>New real ad</h3>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>ID</span>
            <input
              type="text"
              value={form.real_ad_id}
              onChange={(e) => setForm((f) => ({ ...f, real_ad_id: e.target.value }))}
              placeholder="taboola-main"
              disabled={busy}
              style={inputStyle}
            />
            <span className="muted" style={{ fontSize: 11 }}>Letters, digits, _ and - only.</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Taboola main feed"
              disabled={busy}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Head script <span style={{ fontWeight: 400, color: '#6b7280' }}>(loaded once per page)</span>
            </span>
            <textarea
              value={form.head_script}
              onChange={(e) => setForm((f) => ({ ...f, head_script: e.target.value }))}
              placeholder={'<script src="https://provider.com/sdk.js"></script>'}
              rows={3}
              disabled={busy}
              spellCheck={false}
              style={monoStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Per-slot embed snippet</span>
            <textarea
              value={form.snippet}
              onChange={(e) => setForm((f) => ({ ...f, snippet: e.target.value }))}
              placeholder={'<div id="ad-slot"></div>\n<script>loadAd("ad-slot")</script>'}
              rows={6}
              disabled={busy}
              spellCheck={false}
              style={monoStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Ads created by this snippet</span>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={form.ads_per_snippet}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setForm((f) => ({ ...f, ads_per_snippet: Number.isFinite(n) && n >= 1 ? n : 1 }));
              }}
              disabled={busy}
              style={{ ...inputStyle, width: 90 }}
            />
            <span className="muted" style={{ fontSize: 11 }}>
              1 = single full-bleed ad; 2+ = provider multi-card block in scrollable card.
            </span>
          </label>
          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => { setShowForm(false); setError(null); }} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={create}
              disabled={busy || !form.real_ad_id.trim() || !form.name.trim()}
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setError(null); }}
          style={{ alignSelf: 'flex-start' }}
        >
          + New Real Ad
        </button>
      )}
    </div>
  );
}
