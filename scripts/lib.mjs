// Shared helpers for the brand scrapers.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = path.join(ROOT, '.cache');
export const RAW = path.join(ROOT, 'scripts', 'raw');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const exists = (p) => access(p).then(() => true, () => false);

/** Fetch a URL with an on-disk cache so re-runs don't hammer the brand sites. */
export async function fetchCached(url, { binary = false, headers = {} } = {}) {
  const key = createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE, 'http', key + (binary ? '.bin' : '.txt'));
  if (await exists(file)) return binary ? readFile(file) : readFile(file, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en', ...headers } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
      return body;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Run `fn` over `items` with bounded concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

export const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const PIGMENT_RE = /\b(P|N|B|A)(BK|BR|Bk|Br|[YORVBGWM])\s*\.?\s*(\d+(?::\d+)?)/g;

/** Extract Colour Index pigment codes like "PB 15:3" -> "PB15:3". */
export function parsePigments(text) {
  if (!text) return [];
  const found = [];
  for (const m of String(text).matchAll(PIGMENT_RE)) {
    const family = m[2].length === 2 ? m[2][0] + m[2][1].toLowerCase() : m[2];
    const code = `${m[1]}${family}${m[3]}`;
    if (!found.includes(code)) found.push(code);
  }
  return found;
}

/** Map any brand's wording onto four transparency buckets. */
export function normTransparency(raw) {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  if (/semi[\s-]*opaque|semi-covering|halbdeckend|o\/t/.test(s)) return 'semi-opaque';
  if (/semi[\s-]*trans|semi-transparent|lasierend.*halb|halblasierend/.test(s)) return 'semi-transparent';
  if (/opaque|covering|deckend/.test(s)) return 'opaque';
  if (/trans|lasierend/.test(s)) return 'transparent';
  return null;
}

export const GRANULATION = { yes: 'granulating', no: 'non-granulating' };
