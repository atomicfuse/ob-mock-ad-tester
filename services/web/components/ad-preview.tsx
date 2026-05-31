import type { MockAd } from '../lib/types';

export default function AdPreview({ ad }: { ad: Pick<MockAd, 'title' | 'brand' | 'image_url'> }) {
  return (
    <div className="preview-card">
      <div className="img" style={{ backgroundImage: `url(${JSON.stringify(ad.image_url)})` }} />
      <div className="body">
        <div className="title">{ad.title}</div>
        <div className="meta">
          <span className="brand">{ad.brand}</span>
          <span className="sponsored">Sponsored</span>
        </div>
      </div>
    </div>
  );
}
