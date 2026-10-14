// Schmincke — HORADAM® Aquarell (incl. Supergranulating) and AKADEMIE® Aquarell.
// The colour chart on each product-line page carries every property as data-* attributes.
import * as cheerio from 'cheerio';
import { fetchCached, parsePigments } from '../lib.mjs';

const BASE = 'https://www.schmincke.de';
const PAGES = [
  `${BASE}/en/produkte/aquarell/horadam-aquarell`,
  `${BASE}/en/produkte/aquarell/akademie-aquarell`,
];
const OPACITY = { L: 'transparent', HL: 'semi-transparent', HD: 'semi-opaque', D: 'opaque' };
const OPACITY_RAW = { L: 'transparent (L)', HL: 'semi-transparent (HL)', HD: 'semi-opaque (HD)', D: 'opaque (D)' };
const STAINING = { non: 'non-staining', semi: 'semi-staining', st: 'staining' };
// Schmincke lightfastness scale: 5 = highest.
const LIGHTFAST = { 1: 'weak', 2: 'moderate', 3: 'good', 4: 'very good', 5: 'highest' };

export async function scrape() {
  const paints = [];
  const seen = new Set();
  for (const page of PAGES) {
    const $ = cheerio.load(await fetchCached(page));
    $('.schminckede_farbkarte.details').each((_, el) => {
      const d = $(el).data();
      const num = String(d.articlenumber || '').trim();
      if (!num || seen.has(num)) return;
      // The chart contains a placeholder card ("ONETZ") with no data at all.
      if (!String(d.pigments || '').replace(/[,\s]/g, '') && !OPACITY[d.coverability]) return;
      seen.add(num);
      const lineTitle = String(d.productlinetitle || '');
      const superG = String(d.supergranulation) === '1';
      const img = $(el).find('.schminckede_farbkarte_image img').first().attr('src');
      const name = String(d.title || '').replace(/\s+/g, ' ').trim();
      paints.push({
        brand: 'Schmincke',
        line: /akademie/i.test(lineTitle) ? 'AKADEMIE® Aquarell' : superG ? 'HORADAM® Aquarell Supergranulating' : 'HORADAM® Aquarell',
        name: name.charAt(0).toUpperCase() + name.slice(1),
        code: num,
        pigments: parsePigments(d.pigments),
        pigmentsRaw: String(d.pigments || '').replace(/,\s*$/, '') || null,
        transparency: OPACITY[d.coverability] || null,
        transparencyRaw: OPACITY_RAW[d.coverability] || null,
        granulation: d.granulation === 'G' || superG,
        granulationRaw: superG ? 'supergranulating' : d.granulation === 'G' ? 'granulating (G)' : 'not marked G',
        staining: STAINING[d.staining] || null,
        lightfastness: LIGHTFAST[d.lightfast] || null,
        series: d.pricegroup ? String(d.pricegroup) : null,
        // AKADEMIE images are a half-pan photographed on a background of the paint colour; keep a
        // strip of that background to the left of the pan (and below the "NEW" banner).
        swatch: img && !/Fallback/i.test(img)
          ? { url: new URL(img, BASE).href, ...(/akademie/i.test(lineTitle) && { crop: { left: 0.02, right: 0.76, top: 0.3, bottom: 0.04 } }) }
          : null,
        sourceUrl: `${page}#karte_${num}`,
      });
    });
  }
  return paints;
}
