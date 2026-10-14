// Sennelier l'Aquarelle — official PDFs linked from sennelier-colors.com:
//   ColorChart-ENG-WATERCOLOR.pdf    hexagon swatches, number, series, opacity glyph, pigments
//   LIST_..._GRANULATING_COLORS.pdf  the 36 granulating colours of the range
// Opacity on the chart is a small square glyph (filled / half / empty), so it is read from pixels.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, parsePigments, normTransparency, slug } from '../lib.mjs';
import { cachedPdf, pdfText, pdfWords, bandAbove, cropBox, renderPage } from '../pdf.mjs';

const BASE = 'https://www.sennelier-colors.com/article/photo';
const CHART = `${BASE}/dossier494/ColorChart-ENG-WATERCOLOR.pdf`;
const GRAN_LIST = `${BASE}/dossier534/LIST_SENNELIER_ARTIST_WATERCOLOR_GRANULATING_COLORS.pdf`;
const DPI = 200;

/**
 * How filled the opacity square is: find the glyph's dark bounding box inside `box`, then the share
 * of dark pixels within it. Outline only (transparent) ~0.4, half (semi-opaque) ~0.7, full (opaque) ~1.
 */
async function readGlyph(file, page, box) {
  const png = await renderPage(file, page, DPI);
  const k = DPI / 72;
  const { data, info } = await sharp(png)
    .extract({ left: Math.round(box.x0 * k), top: Math.round(box.y0 * k), width: Math.max(2, Math.round((box.x1 - box.x0) * k)), height: Math.max(2, Math.round((box.y1 - box.y0) * k)) })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dark = (x, y) => data[y * info.width + x] < 128;
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (dark(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (dark(x, y)) n++;
  return n / ((x1 - x0 + 1) * (y1 - y0 + 1));
}

export async function scrape() {
  const file = await cachedPdf(CHART, 'sennelier-chart.pdf');
  const words = await pdfWords(file);
  const granText = await pdfText(await cachedPdf(GRAN_LIST, 'sennelier-granulating.pdf'));
  // Rows look like "Cobalt Blue   307   S4   PB28   T   I".
  const granulating = new Set([...granText.matchAll(/\s(\d{3})\s+S\d\s/g)].map((m) => m[1]));
  const outDir = path.join(CACHE, 'crops', 'sennelier');
  await mkdir(outDir, { recursive: true });

  const near = (a, b, dy) => a.page === b.page && Math.abs(a.y0 - b.y0) < dy;
  const tiles = [];
  for (const s of words.filter((w) => w.text === 'serie')) {
    const digit = words.find((w) => near(w, s, 1.5) && w.x0 > s.x1 && w.x0 - s.x1 < 5 && /^\d$/.test(w.text));
    if (!digit) continue;
    const roman = words.find((w) => near(w, s, 1.5) && w.x0 > digit.x1 + 4 && w.x0 - digit.x1 < 22);
    const num = words
      .filter((w) => /^\d{3}$/.test(w.text) && w.page === s.page && w.y1 <= s.y0 + 4 && s.y0 - w.y0 < 22 && Math.abs((w.x0 + w.x1) / 2 - (s.x0 + (roman?.x1 ?? digit.x1)) / 2) < 25)
      .sort((a, b) => b.y0 - a.y0)[0];
    if (!num) continue;
    const cx = (num.x0 + num.x1) / 2;
    const inCol = (w) => Math.abs((w.x0 + w.x1) / 2 - cx) < 48;
    // Name row: start from the word nearest the column centre and grow across tight word gaps, so a
    // long neighbouring name that spills towards this column isn't picked up.
    const row = words
      .filter((w) => w.page === s.page && inCol(w) && w.y0 < num.y0 - 2 && num.y0 - w.y0 < 11 && !/^\d{3}$/.test(w.text))
      .sort((a, b) => a.x0 - b.x0);
    const mid = row.reduce((best, w, i) => (Math.abs((w.x0 + w.x1) / 2 - cx) < Math.abs((row[best].x0 + row[best].x1) / 2 - cx) ? i : best), 0);
    let lo = mid, hi = mid;
    while (lo > 0 && row[lo].x0 - row[lo - 1].x1 < 5) lo--;
    while (hi < row.length - 1 && row[hi + 1].x0 - row[hi].x1 < 5) hi++;
    const nameWords = row.length ? row.slice(lo, hi + 1) : [];
    const nameTop = Math.min(...nameWords.map((w) => w.y0), num.y0);
    const pigLine = words.filter((w) => w.page === s.page && inCol(w) && w.y0 > s.y1 - 1 && w.y0 - s.y1 < 6 && !/^\*+$/.test(w.text));
    const stars = words.find((w) => w.page === s.page && inCol(w) && /^\*+$/.test(w.text) && w.y0 > s.y0 && w.y0 - s.y0 < 25)?.text || null;
    const glyph = { x0: digit.x1 + 1, x1: (roman?.x0 ?? digit.x1 + 11) - 1, y0: s.y0, y1: s.y1 };
    tiles.push({
      num: num.text,
      name: nameWords.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).map((w) => w.text).join(' '),
      series: digit.text,
      lightfastness: roman?.text === 'n.r.' ? 'not rated' : roman?.text || null,
      stars,
      pigmentsRaw: pigLine.sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(' '),
      cx,
      nameTop,
      page: s.page,
      glyph,
      dark: await readGlyph(file, s.page, glyph),
    });
  }

  // Hexagons are a fixed size; crop a fixed-height band above each name (median of measured bands).
  const heights = tiles
    .map((t) => { const b = bandAbove({ page: t.page, y0: t.nameTop }, words, { cx: t.cx, colWidth: 50, maxHeight: 80 }); return b.y1 - b.y0; })
    .sort((a, b) => a - b);
  const hexH = Math.min(heights[Math.floor(heights.length / 2)], 50);

  const paints = [];
  for (const t of tiles) {
    const opacity = t.dark == null ? null : t.dark > 0.85 ? 'Opaque' : t.dark > 0.55 ? 'Semi-opaque' : 'Transparent';
    const box = { page: t.page, x0: t.cx - hexH * 0.55, x1: t.cx + hexH * 0.55, y0: t.nameTop - hexH, y1: t.nameTop - 1 };
    const buf = await cropBox(file, box, { dpi: DPI, inset: { left: 0.22, right: 0.22, top: 0.2, bottom: 0.2 } });
    let swatch = null;
    if (buf) {
      const f = path.join(outDir, `${t.num}-${slug(t.name)}.png`);
      await writeFile(f, buf);
      swatch = { file: f };
    }
    paints.push({
      brand: 'Sennelier',
      line: 'l’Aquarelle Artists’ Watercolor',
      name: t.name,
      code: t.num,
      pigments: parsePigments(t.pigmentsRaw),
      pigmentsRaw: t.pigmentsRaw || null,
      transparency: normTransparency(opacity),
      transparencyRaw: opacity && `${opacity} (chart symbol)`,
      granulation: granulating.has(t.num),
      granulationRaw: granulating.has(t.num) ? 'on official granulating-colours list' : 'not on granulating-colours list',
      staining: null,
      lightfastness: t.lightfastness,
      series: t.series,
      swatch,
      glyphDark: t.dark == null ? null : Math.round(t.dark * 100) / 100,
      sourceUrl: 'https://www.sennelier-colors.com/en/Aquarelle-petite-aquarelle_85.html',
    });
  }
  return paints;
}
