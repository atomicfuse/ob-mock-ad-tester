'use client';

import { useState } from 'react';

export default function EmbedCodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }
  return (
    <div className="code-box">
      <button type="button" onClick={copy} className="btn copy-btn">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      {code}
    </div>
  );
}
