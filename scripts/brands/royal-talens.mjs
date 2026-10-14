// Royal Talens — Van Gogh and Rembrandt watercolour.
//
// royaltalens.com is behind bot protection, so the per-variant specs (opacity, pigments, official hex)
// were captured with a real browser session into scripts/raw/rt_variants.json (see README).
// Granulation is only published on the colour-chart PDFs (marked "G"), and the product images are
// tube photos, so swatches are cropped from those same charts.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE, RAW, parsePigments, normTransparency, slug } from '../lib.mjs';
import { cachedPdf, pdfText, pdfWords, lines, bandAbove, cropBox } from '../pdf.mjs';

const CHARTS = {
  Rembrandt: {
    url: 'https://mediabank.royaltalens.com/royaltalens/file/96a0b1421fb38b18030aeb8bf12a4d77/5e456e38/documents/dir1/Rembrandt%20water%20colour%20ENG.pdf',
    file: 'rembrandt-wc.pdf',
    // "+++ 596 \u0004 1 G" -> colour 596 granulates (control chars are the opacity glyphs)
    // oxlint-disable-next-line no-control-regex
    granRe: /(\d{3})[\s\x00-\x1f]+\d\s*G\b/g,
    // oxlint-disable-next-line no-control-regex
    numRe: /\+{0,3}\s*(\d{3})[\s\x00-\x1f]+\d\b/g,
  },
  'Van Gogh': {
    url: 'https://mediabank.royaltalens.com/royaltalens/file/347318e031a5051aefadae78126b7473/5e456e38/documents/dir2/Van%20Gogh%20watercolour%20ENG.pdf',
    file: 'vangogh-wc.pdf',
    // "409 | +++ |    |G"
    granRe: /(\d{3})\s*\|\s*\+*\s*\|\s*\|?\s*G\b/g,
    numRe: /(\d{3})\s*\|\s*\+*\s*\|/g,
  },
};

const STICKER = /^(NEW|IM|PR|OV|ED|IMPROVED|!)$/;

async function chartInfo(brand) {
  const c = CHARTS[brand];
  const file = await cachedPdf(c.url, c.file);
  const text = await pdfText(file);
  const granulating = new Set([...text.matchAll(c.granRe)].map((m) => m[1]));
  const listed = new Set([...text.matchAll(c.numRe)].map((m) => m[1]));
  return { file, granulating, listed, words: await pdfWords(file) };
}

/** Locate the swatch for colour `num` on the chart and save a PNG crop. */
async function cropSwatch(brand, info, num) {
  const { words, file } = info;
  const ls = lines(words);
  let box;
  if (brand === 'Rembrandt') {
    // Cell: name / swatch / "+++ 108 1" / pigments. The number word sometimes has "+++" glued on.
    const w = words.find((w) => w.text.replace(/^\++/, '') === num && words.some((o) => o !== w && Math.abs(o.y0 - w.y0) < 2 && /^\++$/.test(o.text) && w.x0 - o.x1 < 8 && w.x0 > o.x0) || (w.text === '+++' + num));
    if (!w) return null;
    const plus = words.find((o) => Math.abs(o.y0 - w.y0) < 2 && /^\++/.test(o.text) && w.x0 - o.x1 < 8 && o.x0 <= w.x0) || w;
    const cx = (plus.x0 + w.x1) / 2 + 4;
    box = bandAbove({ ...w, y0: Math.min(w.y0, plus.y0) }, words, { cx, colWidth: 44, maxHeight: 60 });
    return box && { box, buf: await cropBox(file, box, { inset: { left: 0.05, right: 0.05, top: 0.2, bottom: 0.15 } }) };
  }
  // Van Gogh cell: swatch / name / "108 | +++ |". Anchor on the name line just above the number.
  const numWord = words.find((w) => w.text === num && words.some((o) => Math.abs(o.y0 - w.y0) < 2 && o.text === '|' && o.x0 > w.x1 && o.x0 - w.x1 < 8));
  if (!numWord) return null;
  const nameLine = ls
    .filter((l) => l.page === numWord.page && l.y1 <= numWord.y0 + 1 && numWord.y0 - l.y1 < 14 && l.x0 < numWord.x1 + 30 && l.x1 > numWord.x0 - 30)
    .sort((a, b) => b.y1 - a.y1)[0];
  const anchor = nameLine || numWord;
  const cx = numWord.x0 + 14;
  box = bandAbove(anchor, words, { cx, colWidth: 50, ignore: STICKER, maxHeight: 45 });
  return { box, buf: await cropBox(file, box, { inset: { left: 0.04, right: 0.45, top: 0.3, bottom: 0.08 } }) };
}

export async function scrape() {
  const variants = JSON.parse(await readFile(path.join(RAW, 'rt_variants.json'), 'utf8'));
  const charts = { Rembrandt: await chartInfo('Rembrandt'), 'Van Gogh': await chartInfo('Van Gogh') };
  const outDir = path.join(CACHE, 'crops', 'royal-talens');
  await mkdir(outDir, { recursive: true });

  const byKey = new Map();
  for (const v of variants) {
    const brand = v.vendor;
    const num = v.specs['Colour number'];
    if (!num || !CHARTS[brand]) continue;
    const key = `${brand}|${num}`;
    // Prefer tube listings for the canonical source link; all variants share the same specs.
    if (byKey.has(key) && !/tube/.test(v.handle)) continue;
    byKey.set(key, v);
  }

  const paints = [];
  for (const [key, v] of byKey) {
    const [brand, num] = key.split('|');
    const info = charts[brand];
    const name = v.opts[1] || v.specs.Variant || v.title;
    let swatch = null;
    const crop = await cropSwatch(brand, info, num);
    if (crop?.buf) {
      const file = path.join(outDir, `${slug(brand)}-${num}.png`);
      await writeFile(file, crop.buf);
      swatch = { file };
    }
    paints.push({
      // Both are Royal Talens ranges, but painters know them as brands in their own right.
      brand,
      line: brand === 'Rembrandt' ? 'Artists’ Watercolour' : 'Watercolour',
      name,
      code: num,
      pigments: parsePigments(v.specs.Pigments),
      pigmentsRaw: v.specs.Pigments || null,
      transparency: normTransparency(v.specs.Opacity),
      transparencyRaw: v.specs.Opacity || null,
      granulation: info.granulating.has(num) ? true : info.listed.has(num) ? false : null,
      granulationRaw: info.granulating.has(num) ? 'G (colour chart)' : info.listed.has(num) ? 'not marked G on colour chart' : 'not on colour chart',
      staining: null,
      lightfastness: (v.lightfast || v.specs.Lightfastness || '').replace(/\s.*$/, '') || null,
      series: null,
      hex: v.specs['Hex colour code'] || null,
      swatch,
      sourceUrl: `https://www.royaltalens.com/products/${v.handle}?variant=${v.vid}`,
    });
  }
  return paints;
}
