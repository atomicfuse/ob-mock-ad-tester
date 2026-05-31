import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ads } from '../../../../lib/mongo';
import AdForm from '../../../../components/ad-form';
import AdPreview from '../../../../components/ad-preview';
import EmbedCodeBlock from '../../../../components/embed-code-block';
import type { MockAd } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function AdDetailPage({ params }: { params: { id: string } }) {
  const col = await ads();
  const adDoc = await col.findOne({ ad_id: params.id });
  if (!adDoc) notFound();
  const { _id, ...rest } = adDoc;
  const ad = rest as MockAd;

  const h = headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const embedCode = `<script src="${origin}/widget.js" async></script>\n<div data-cg-ad="${ad.ad_id}"></div>`;

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>
          Ad: <code>{ad.ad_id}</code>{' '}
          <span className={`pill pill-${ad.status}`}>{ad.status}</span>
        </h1>
        <a href="/admin/ads" className="btn">
          ← Back
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2>Edit</h2>
          <AdForm mode="edit" initial={ad} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h2>Preview</h2>
            <div className="preview-frame">
              <AdPreview ad={ad} />
            </div>
          </div>

          <div>
            <h2>Embed Code</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Paste this on any page where you want <code>{ad.ad_id}</code> to render.
            </p>
            <EmbedCodeBlock code={embedCode} />
          </div>
        </div>
      </div>
    </>
  );
}
