// Minimal in-house Open Graph / Twitter / <title> parser. No external deps.
// Reads a URL server-side, parses the <head>, and extracts title/image/description.

export interface OgMeta {
  title: string;
  image: string;
  description?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function findMeta(html: string, key: string, value: string): string | null {
  // Match <meta ... key="value" ... content="..."> with either order.
  // Quotes can be " or '. We capture the opening quote and back-reference it
  // so that an apostrophe inside a double-quoted value doesn't end the match.
  const escVal = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // key=... then content=...  → content value is group 3
  const m1 = html.match(new RegExp(
    `<meta[^>]+?${key}=(["'])${escVal}\\1[^>]*?content=(["'])(.*?)\\2`,
    'is',
  ));
  if (m1) return decodeEntities(m1[3]).trim();
  // content=... then key=...  → content value is group 2
  const m2 = html.match(new RegExp(
    `<meta[^>]+?content=(["'])(.*?)\\1[^>]*?${key}=(["'])${escVal}\\3`,
    'is',
  ));
  if (m2) return decodeEntities(m2[2]).trim();
  return null;
}

function findTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : null;
}

function resolveUrl(maybeRelative: string, base: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export async function fetchOgMeta(url: string): Promise<OgMeta> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must be http(s)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let html = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CloudGridMockAdTester/1.0; +https://cloudgrid.ai)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`Fetch failed: HTTP ${res.status}`);
    }
    // Read only enough of the body to cover <head>. Most sites' og: tags are
    // well within the first 200KB.
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder('utf-8');
      let total = 0;
      const cap = 250_000;
      while (total < cap) {
        const { value, done } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        total += value.byteLength;
        if (html.match(/<\/head>/i)) break;
      }
      try {
        await reader.cancel();
      } catch {}
    } else {
      html = await res.text();
    }
  } finally {
    clearTimeout(timer);
  }

  const finalUrl = url; // fetch handles redirects; we trust the input for resolution

  const title =
    findMeta(html, 'property', 'og:title') ||
    findMeta(html, 'name', 'twitter:title') ||
    findTitleTag(html) ||
    parsed.hostname;

  let image =
    findMeta(html, 'property', 'og:image') ||
    findMeta(html, 'property', 'og:image:url') ||
    findMeta(html, 'name', 'twitter:image') ||
    findMeta(html, 'name', 'twitter:image:src') ||
    '';
  if (image) image = resolveUrl(image, finalUrl);

  const description =
    findMeta(html, 'property', 'og:description') ||
    findMeta(html, 'name', 'twitter:description') ||
    findMeta(html, 'name', 'description') ||
    undefined;

  return { title, image, description };
}
