// Shared validation + slug helpers for listicle card import/export.
// Pure functions only — no I/O, no Mongo, no Next.js types — so they can be
// unit-exercised trivially and reused by both the /cards route and the
// feed-items PATCH route (single-card edits reuse the same row rules).

export interface CardInput {
  heading: string;
  text?: string;
  image_url: string;
}

export interface RowError {
  index: number;
  field: string;
  message: string;
}

export type ValidateListicleResult =
  | { title?: string; items: CardInput[] }
  | { row_errors: RowError[] };

const MAX_TITLE_LEN = 200;
const MAX_HEADING_LEN = 300;
const MAX_TEXT_LEN = 500;
const MAX_IMAGE_URL_LEN = 2048;
const MAX_ITEMS = 500;

// Validate the `{ title?, items: [...] }` paste/export shape. Collects every
// row error in one pass (not just the first) so the caller can render a full
// list back to the user in one round-trip.
export function validateListicleJson(raw: unknown): ValidateListicleResult {
  const row_errors: RowError[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { row_errors: [{ index: -1, field: 'root', message: 'body must be a JSON object' }] };
  }
  const obj = raw as Record<string, unknown>;

  let title: string | undefined;
  if (obj.title !== undefined && obj.title !== null) {
    if (typeof obj.title !== 'string') {
      row_errors.push({ index: -1, field: 'title', message: 'title must be a string' });
    } else {
      const trimmed = obj.title.trim();
      if (trimmed.length > 0) {
        if (trimmed.length > MAX_TITLE_LEN) {
          row_errors.push({
            index: -1,
            field: 'title',
            message: `title must be ${MAX_TITLE_LEN} characters or fewer`,
          });
        } else {
          title = trimmed;
        }
      }
    }
  }

  const rawItems = obj.items;
  if (!Array.isArray(rawItems)) {
    row_errors.push({ index: -1, field: 'items', message: 'items must be an array' });
    return { row_errors };
  }
  if (rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
    row_errors.push({
      index: -1,
      field: 'items',
      message: `items must contain between 1 and ${MAX_ITEMS} entries`,
    });
    return { row_errors };
  }

  const items: CardInput[] = [];

  rawItems.forEach((rawItem, index) => {
    if (rawItem === null || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      row_errors.push({ index, field: 'item', message: 'row must be a JSON object' });
      return;
    }
    const item = rawItem as Record<string, unknown>;

    let heading: string | undefined;
    if (typeof item.heading !== 'string') {
      row_errors.push({ index, field: 'heading', message: 'heading is required' });
    } else {
      const trimmed = item.heading.trim();
      if (trimmed.length < 1) {
        row_errors.push({ index, field: 'heading', message: 'heading is required' });
      } else if (trimmed.length > MAX_HEADING_LEN) {
        row_errors.push({
          index,
          field: 'heading',
          message: `heading must be ${MAX_HEADING_LEN} characters or fewer`,
        });
      } else {
        heading = trimmed;
      }
    }

    let text: string | undefined;
    if (item.text !== undefined && item.text !== null) {
      if (typeof item.text !== 'string') {
        row_errors.push({ index, field: 'text', message: 'text must be a string' });
      } else {
        const trimmed = item.text.trim();
        if (trimmed.length > MAX_TEXT_LEN) {
          row_errors.push({
            index,
            field: 'text',
            message: `text must be ${MAX_TEXT_LEN} characters or fewer`,
          });
        } else if (trimmed.length > 0) {
          text = trimmed;
        }
      }
    }

    let image_url: string | undefined;
    if (typeof item.image_url !== 'string' || item.image_url.trim().length === 0) {
      row_errors.push({ index, field: 'image_url', message: 'image_url is required' });
    } else {
      const trimmed = item.image_url.trim();
      if (trimmed.length > MAX_IMAGE_URL_LEN) {
        row_errors.push({
          index,
          field: 'image_url',
          message: `image_url must be ${MAX_IMAGE_URL_LEN} characters or fewer`,
        });
      } else {
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            row_errors.push({
              index,
              field: 'image_url',
              message: 'image_url must use http: or https:',
            });
          } else {
            image_url = trimmed;
          }
        } catch {
          row_errors.push({ index, field: 'image_url', message: 'image_url is not a valid URL' });
        }
      }
    }

    if (heading !== undefined && image_url !== undefined) {
      items.push({ heading, text, image_url });
    }
  });

  if (row_errors.length > 0) return { row_errors };
  return { title, items };
}

// Lowercase, strip diacritics, collapse non-alphanumeric runs to a single
// dash, trim, and cap length. Falls back to `fallback` when the result is
// empty (e.g. an all-emoji heading).
export function slugify(heading: string, fallback: string): string {
  const stripped = heading
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  let slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > 60) {
    const cut = slug.slice(0, 60);
    const lastDash = cut.lastIndexOf('-');
    slug = lastDash > 0 ? cut.slice(0, lastDash) : cut;
    slug = slug.replace(/^-+|-+$/g, '');
  }

  return slug.length > 0 ? slug : fallback;
}

// Deterministic left-to-right dedup: the first occurrence of a slug is kept
// as-is; the second occurrence becomes `-2`, the third `-3`, etc.
export function dedupeSlugs(slugs: string[]): string[] {
  const counts = new Map<string, number>();
  return slugs.map((slug) => {
    const seen = (counts.get(slug) ?? 0) + 1;
    counts.set(slug, seen);
    return seen === 1 ? slug : `${slug}-${seen}`;
  });
}
