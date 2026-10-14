// M. Graham — one WordPress page per colour, listed in the watercolor sitemap.
import * as cheerio from 'cheerio';
import { fetchCached, pool, parsePigments, normTransparency } from '../lib.mjs';

const BASE = 'https://mgraham.com';

export async function scrape() {
  const sitemap = await fetchCached(`${BASE}/watercolor-paints-sitemap.xml`);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /\/watercolor-paints\/[^/]+\/$/.test(u));

  const paints = await pool(urls, 4, async (url) => {
    const $ = cheerio.load(await fetchCached(url));
    const field = (label) => {
      const el = $('#tab-1 strong').filter((_, s) => $(s).text().trim().startsWith(label)).first();
      return el.find('span').first().text().replace(/\s+/g, ' ').trim() || null;
    };
    const title = $('h1').first().text().replace(/\s*Watercolor Paint\s*$/i, '').trim();
    const m = title.match(/^(.*?)\s+(\d{3})$/);
    const sg = field('Staining/Granulating') || '';
    const swatch = $('img.swatch').attr('src');
    const pigmentsRaw = field('Pigment Composition');
    return {
      brand: 'M. Graham',
      line: 'Artists’ Watercolor',
      name: m ? m[1] : title,
      code: m ? m[2] : null,
      pigments: parsePigments(pigmentsRaw),
      pigmentsRaw,
      transparency: normTransparency(field('Opacity Rating')),
      transparencyRaw: field('Opacity Rating'),
      // Combined field, e.g. "Staining", "Granulating", "Staining, Granulating" or blank.
      granulation: /granulat/i.test(sg),
      granulationRaw: sg || 'not flagged',
      staining: /non[\s-]*staining/i.test(sg) ? 'non-staining' : /staining/i.test(sg) ? 'staining' : null,
      lightfastness: field('Lightfast Rating'),
      series: null,
      swatch: swatch ? { url: new URL(swatch, BASE).href } : null,
      sourceUrl: url,
    };
  });
  return paints.filter((p) => p.name);
}
