// QoR (Golden Artist Colors) — the "pigment data" page lists every colour with all properties.
import * as cheerio from 'cheerio';
import { fetchCached, pool, parsePigments, normTransparency } from '../lib.mjs';

const BASE = 'https://goldenartistcolors.com';
const PAGE = `${BASE}/products/qor-artist-watercolors/watercolors/pigment-data`;

export async function scrape() {
  const $ = cheerio.load(await fetchCached(PAGE));
  const paints = [];
  $('table tr').each((_, tr) => {
    const td = $(tr).find('td');
    if (td.length < 8) return;
    const a = td.eq(1).find('a').first();
    const name = a.text().trim();
    const code = (td.eq(1).text().match(/\((\d+)\)/) || [])[1] || null;
    if (!name) return;
    const cell = (i) => td.eq(i).text().replace(/\s+/g, ' ').trim();
    const nullish = (v) => (!v || v === '-' || v === 'NA' ? null : v);
    const thumb = td.eq(0).find('img').attr('src');
    const gran = nullish(cell(7));
    paints.push({
      brand: 'QoR',
      line: 'QoR Watercolor',
      name,
      code,
      pigments: parsePigments(cell(3)),
      pigmentsRaw: nullish(cell(3)),
      transparency: normTransparency(cell(5)),
      transparencyRaw: nullish(cell(5)),
      // QoR prints "-" when a colour has no granulation, and names the granulating ones.
      granulation: gran ? !/non/i.test(gran) : false,
      granulationRaw: gran || '-',
      staining: nullish(cell(6))?.toLowerCase() ?? null,
      lightfastness: nullish(cell(4)),
      series: nullish(cell(2)),
      swatch: thumb ? { url: thumb } : null,
      sourceUrl: new URL(a.attr('href'), BASE).href,
    });
  });
  // The table only has 100px thumbnails; each colour page links the large swatch image.
  await pool(paints, 4, async (p) => {
    const html = await fetchCached(p.sourceUrl).catch(() => null);
    const lg = html && cheerio.load(html)('img[src*="/swatch-lg/"]').first().attr('src');
    if (lg) p.swatch = { url: lg, fallbackUrl: p.swatch?.url };
  });
  return paints;
}
