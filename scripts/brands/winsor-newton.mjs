// Winsor & Newton Professional + Cotman — Shopify store, specs rendered in a table on each product page.
import * as cheerio from 'cheerio';
import { fetchCached, pool, parsePigments, normTransparency } from '../lib.mjs';

const BASE = 'https://www.winsornewton.com';
const LINES = [
  { prefix: 'professional-watercolour-', line: 'Professional Watercolour' },
  { prefix: 'cotman-watercolour-', line: 'Cotman Watercolour' },
];
// Handles under those prefixes that are not single colours.
const NOT_A_COLOUR = /(set|bundle|brush|tin|box|collection|pocket|palette|medium|bestsellers|dot-card|sketch|kit|pad|paper|gift|tube-set|selection)/;

async function allProducts() {
  const out = [];
  for (let page = 1; page < 30; page++) {
    const json = JSON.parse(await fetchCached(`${BASE}/products.json?limit=250&page=${page}`));
    if (!json.products.length) break;
    out.push(...json.products);
  }
  return out;
}

export async function scrape() {
  const products = await allProducts();
  const candidates = [];
  for (const p of products) {
    const line = LINES.find((l) => p.handle.startsWith(l.prefix));
    if (!line || NOT_A_COLOUR.test(p.handle.slice(line.prefix.length))) continue;
    candidates.push({ p, line: line.line });
  }

  const paints = await pool(candidates, 4, async ({ p, line }) => {
    const url = `${BASE}/products/${p.handle}`;
    const $ = cheerio.load(await fetchCached(url));
    const spec = {};
    $('table.specification-table tr').each((_, tr) => {
      const k = $(tr).find('th').text().replace(/\s+/g, ' ').trim().replace(/:$/, '');
      const v = $(tr).find('td').text().replace(/\s+/g, ' ').trim();
      if (k) spec[k] = v;
    });
    if (!spec['Pigment Code'] && !spec['Opacity']) return null; // not a paint colour page

    const gs = (spec['Granulation/staining'] || '').toLowerCase();
    const name = p.title.replace(/^(Professional|Cotman)\s+Watercolou?r\s*[-–]\s*/i, '').trim();
    return {
      brand: 'Winsor & Newton',
      line,
      name,
      code: spec['Colour Number'] || null,
      pigments: parsePigments(spec['Pigment Code']),
      pigmentsRaw: spec['Pigment Code'] || null,
      transparency: normTransparency(spec['Opacity']),
      transparencyRaw: spec['Opacity'] || null,
      // W&N lists granulation and staining in one combined field and leaves it out entirely when a
      // colour is neither, so a missing field means non-granulating.
      granulation: /granulat/.test(gs),
      granulationRaw: spec['Granulation/staining'] || 'not flagged',
      staining: /staining/.test(gs) ? 'staining' : 'non-staining',
      lightfastness: spec['Permanence'] || null,
      series: spec['Series'] || null,
      swatch: p.images[0] ? { url: p.images[0].src.split('?')[0] + '?width=600' } : null,
      sourceUrl: url,
    };
  });
  return paints.filter(Boolean);
}
