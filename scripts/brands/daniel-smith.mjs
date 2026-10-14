// Daniel Smith — Extra Fine, PrimaTek and Luminescent watercolours.
//
// danielsmith.com blocks non-browser clients, so these inputs were captured from a real browser
// session (see README):
//   scripts/raw/ds_chars.json      the "Watercolor Pigment Characteristics" table (all rows)
//   scripts/raw/ds_swatches.json   swatch-gallery entries per line
//   scripts/raw/ds_img_index.json  swatch image URL -> file in .cache/browser-images/daniel-smith/
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE, RAW, parsePigments, normTransparency, slug } from '../lib.mjs';

const IMG_DIR = path.join(CACHE, 'browser-images', 'daniel-smith');
const load = async (f) => JSON.parse(await readFile(path.join(RAW, f), 'utf8'));

const nameKey = (s) => slug(String(s).replace(/watercolou?r|genuine|primatek/gi, ''));

export async function scrape() {
  const chars = await load('ds_chars.json');
  const galleries = await load('ds_swatches.json');
  const imgIndex = await load('ds_img_index.json');
  const fileForUrl = new Map(imgIndex.map((i) => [i.url, path.join(IMG_DIR, i.name)]));

  // Index swatch images by SKU (embedded in most filenames) and by normalised name.
  const bySku = new Map();
  const byName = new Map();
  const lineBySku = new Map();
  for (const [gallery, items] of Object.entries(galleries)) {
    const line = /primatek/.test(gallery) ? 'PrimaTek' : /luminescent/.test(gallery) ? 'Luminescent' : 'Extra Fine';
    for (const it of items) {
      const sku = (it.href.match(/(2846\d{5})/) || [])[1];
      const entry = { url: it.href, line };
      if (sku) {
        // Prefer the 15ml gallery's image when a colour appears in several galleries.
        if (!bySku.has(sku) || gallery.includes('15ml')) bySku.set(sku, entry);
        if (line !== 'Extra Fine') lineBySku.set(sku, line);
      }
      const nk = nameKey(it.alt || it.title || '');
      if (nk && !byName.has(nk)) byName.set(nk, entry);
    }
  }

  return chars.map((c) => {
    const sku = String(c.sku).trim();
    const img = bySku.get(sku) || byName.get(nameKey(c.danielsmithwatercolor));
    const file = img && fileForUrl.get(img.url);
    const line = lineBySku.get(sku) || img?.line || (/genuine/i.test(c.danielsmithwatercolor) ? 'PrimaTek' : 'Extra Fine');
    const gran = (c.granulation || '').trim();
    return {
      brand: 'Daniel Smith',
      line: `${line} Watercolor`,
      name: c.danielsmithwatercolor.trim(),
      code: sku,
      pigments: parsePigments(c.cinames),
      pigmentsRaw: c.cinames || null,
      pigmentNames: c.commonpigmentnames || null,
      transparency: normTransparency(c.transparency),
      transparencyRaw: c.transparency || null,
      granulation: gran ? !/non/i.test(gran) : null,
      granulationRaw: gran || null,
      staining: c.staining || null,
      lightfastness: c.lightfastness || null,
      series: (c.series || '').replace(/series\s*/i, '') || null,
      // Swatch images are "tube | painted swatch" side by side; keep the masstone part on the right.
      swatch: file ? { file, crop: { left: 0.54, right: 0.07, top: 0.03, bottom: 0.45 } } : null,
      sourceUrl: 'https://danielsmith.com/daniel-smith-watercolor-pigment-characteristics-chart/',
    };
  });
}
