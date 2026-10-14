// Maimeri Blu — one page per colour/size on maimeri.it. The site publishes pigments, coverage and
// lightfastness, but no granulation information.
import * as cheerio from 'cheerio';
import { fetchCached, pool, parsePigments } from '../lib.mjs';

const LIST = 'https://www.maimeri.it/en/products/watercolour/maimeri-blu.html';
const COVERAGE = { 1: 'transparent', 2: 'semi-opaque', 3: 'opaque' };
const COVERAGE_RAW = { 1: 'Transparent colour', 2: 'Semi-opaque colour', 3: 'Opaque colour' };
const LIGHTFAST = { 1: 'Low', 2: 'Normal', 3: 'Highest' };

export async function scrape() {
  const $list = cheerio.load(await fetchCached(LIST));
  const urls = [...new Set($list('a[href*="/maimeri-blu/"]').map((_, a) => $list(a).attr('href')).get())]
    .filter((u) => /-\d{7}\.html$/.test(u));

  const pages = await pool(urls, 4, async (url) => {
    const $ = cheerio.load(await fetchCached(url));
    const heading = $('.dettaglio_prodotto .info > p').first().text().trim(); // "391 - Ultramarine Light"
    const m = heading.match(/^(\d{3})\s*-\s*(.+)$/);
    if (!m) return null;
    const pig = $('.info_prodotto .pigmento').text().replace(/\s+/g, ' ').trim();
    const cov = ($('.coprenza [class*="coprenza_"]').attr('class') || '').match(/coprenza_(\d)/)?.[1];
    const stars = $('.info_prodotto .resistenza:not(.coprenza) .stella.selected').length;
    const img = $('.immagini_prodotto img').first().attr('src');
    return {
      brand: 'Maimeri',
      line: 'Maimeri Blu',
      name: m[2].trim(),
      code: m[1],
      pigments: parsePigments(pig),
      pigmentsRaw: pig || null,
      transparency: COVERAGE[cov] || null,
      transparencyRaw: COVERAGE_RAW[cov] || null,
      granulation: null,
      granulationRaw: 'not published by Maimeri',
      staining: null,
      lightfastness: LIGHTFAST[stars] || null,
      series: $('.info_prodotto .row').filter((_, r) => /Price group/i.test($(r).text())).find('.value').text().trim() || null,
      swatch: img && /\/MB\d+/i.test(img) ? { url: encodeURI(img) } : null,
      sourceUrl: url,
    };
  });

  // The same colour is listed once per size; keep the entry with the most data.
  const byCode = new Map();
  for (const p of pages.filter(Boolean)) {
    const prev = byCode.get(p.code);
    const score = (x) => (x.swatch ? 2 : 0) + (x.pigments.length ? 1 : 0) + (x.transparency ? 1 : 0);
    if (!prev || score(p) > score(prev)) byCode.set(p.code, p);
  }
  return [...byCode.values()];
}
