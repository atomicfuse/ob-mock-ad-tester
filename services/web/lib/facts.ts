// Shared validation for fact-deck import/export. Pure functions only — no
// I/O, no Mongo, no Next.js types — mirroring lib/listicle.ts so the /facts
// route and single-item edits share the same row rules.

export interface RowError {
  index: number;
  field: string;
  message: string;
}

export interface FactInput {
  text: string;
  /** Optional card background image (external URL, http/https). */
  image?: string;
}

export type ValidateFactsResult =
  | { title?: string; items: FactInput[] }
  | { row_errors: RowError[] };

const MAX_TITLE_LEN = 200;
const MAX_TEXT_LEN = 500;
const MAX_IMAGE_URL_LEN = 2048;
const MAX_ITEMS = 500;

// Validate the `{ title?, items: [...] }` paste/export shape. Rows may be
// plain strings or `{ text, image? }` objects — both normalize to trimmed
// FactInput rows. Collects every row error in one pass so the caller can
// render a full list back to the user in one round-trip.
export function validateFactsJson(raw: unknown): ValidateFactsResult {
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

  const items: FactInput[] = [];

  rawItems.forEach((rawItem, index) => {
    // Accept "fact text" or { text: "fact text", image?: "https://..." }.
    let candidate: unknown = rawItem;
    let rawImage: unknown;
    if (rawItem !== null && typeof rawItem === 'object' && !Array.isArray(rawItem)) {
      candidate = (rawItem as Record<string, unknown>).text;
      rawImage = (rawItem as Record<string, unknown>).image;
    }
    if (typeof candidate !== 'string') {
      row_errors.push({
        index,
        field: 'text',
        message: 'row must be a string or an object with a "text" string',
      });
      return;
    }
    const trimmed = candidate.trim();
    if (trimmed.length < 1) {
      row_errors.push({ index, field: 'text', message: 'text is required' });
      return;
    }
    if (trimmed.length > MAX_TEXT_LEN) {
      row_errors.push({
        index,
        field: 'text',
        message: `text must be ${MAX_TEXT_LEN} characters or fewer`,
      });
      return;
    }

    // Optional card background image — same URL rules as the listicle
    // image_url, but never required.
    let image: string | undefined;
    if (rawImage !== undefined && rawImage !== null && rawImage !== '') {
      if (typeof rawImage !== 'string') {
        row_errors.push({ index, field: 'image', message: 'image must be a string URL' });
        return;
      }
      const imgTrimmed = rawImage.trim();
      if (imgTrimmed.length > 0) {
        if (imgTrimmed.length > MAX_IMAGE_URL_LEN) {
          row_errors.push({
            index,
            field: 'image',
            message: `image must be ${MAX_IMAGE_URL_LEN} characters or fewer`,
          });
          return;
        }
        try {
          const parsed = new URL(imgTrimmed);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            row_errors.push({ index, field: 'image', message: 'image must use http: or https:' });
            return;
          }
          image = imgTrimmed;
        } catch {
          row_errors.push({ index, field: 'image', message: 'image is not a valid URL' });
          return;
        }
      }
    }

    items.push({ text: trimmed, ...(image ? { image } : {}) });
  });

  if (row_errors.length > 0) return { row_errors };
  return { title, items };
}
