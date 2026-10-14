// Holbein Artists' Watercolor (HWC) — two official PDFs from holbeinartistmaterials.com:
//   HWC.pdf     digital colour chart: swatches + property letters under each colour
//   HWCTDS.pdf  technical data sheet: pigments (Colour Index names) per reference number
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE, parsePigments, normTransparency, slug } from '../lib.mjs';
import { cachedPdf, pdfText, pdfWords, bandAbove, cropBox } from '../pdf.mjs';

const CHART = 'https://www.holbeinartistmaterials.com/wp-content/uploads/2020/12/HWC.pdf';
const TDS = 'https://www.holbeinartistmaterials.com/wp-content/uploads/2020/12/HWCTDS.pdf';

// Chart legend: T transparent, B semi-transparent, O opaque; N non-staining, K semi-staining,
// S staining; E easy lift, H hard lift; I intense; X granulating.
const OPACITY = { T: 'Transparent', B: 'Semi-Transparent', O: 'Opaque' };
const STAIN = { N: 'non-staining', K: 'semi-staining', S: 'staining' };

/** Reference number -> { name, pigments } from the technical data sheet. */
async function techData() {
  const text = await pdfText(await cachedPdf(TDS, 'holbein-hwc-tds.pdf'));
  const rows = new Map();
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(W\d{3}),\s*\d{3}\s+(.*)$/);
    if (m) {
      cur = { ref: m[1], text: m[2] };
      rows.set(m[1], cur);
    } else if (cur && line.trim()) cur.text += ' ' + line.trim();
  }
  const out = new Map();
  for (const { ref, text } of rows.values()) {
    // Name runs until the chemical-name column, which is separated by 2+ spaces in layout mode.
    const name = text.split(/\s{2,}/)[0].trim();
    out.set(ref, { name, pigments: parsePigments(text), discontinued: /\(D\)|DISC|renamed/i.test(name) });
  }
  return out;
}

export async function scrape() {
  const file = await cachedPdf(CHART, 'holbein-hwc.pdf');
  const words = await pdfWords(file);
  const tds = await techData();
  const outDir = path.join(CACHE, 'crops', 'holbein');
  await mkdir(outDir, { recursive: true });

  // Each tile starts with "W010 W210  A" (5ml ref, 15ml ref, series).
  const codes = words.filter((w) => /^W\d{3}$/.test(w.text) && !words.some((o) => o.page === w.page && Math.abs(o.y0 - w.y0) < 2 && /^W\d{3}$/.test(o.text) && o.x1 < w.x0 && w.x0 - o.x1 < 10));

  // Swatches have a uniform height; tiles in the top row have nothing above them to bound the band,
  // so crop every tile at the typical (median) height measured across the chart.
  const band = (w) => bandAbove(w, words, { cx: w.x0 + 52, colWidth: 104, maxHeight: 70 });
  const heights = codes.map((w) => { const b = band(w); return b.y1 - b.y0; }).sort((a, b) => a - b);
  const swatchHeight = heights[Math.floor(heights.length / 2)];

  const paints = [];
  for (const w of codes) {
    const inCol = (o) => o.page === w.page && o.x0 >= w.x0 - 3 && o.x0 < w.x0 + 95;
    const below = words.filter((o) => inCol(o) && o.y0 > w.y1 - 1 && o.y0 < w.y1 + 40).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const series = words.find((o) => o.page === w.page && Math.abs(o.y0 - w.y0) < 2 && /^[A-F]$/.test(o.text) && o.x0 > w.x1 && o.x0 < w.x0 + 110)?.text || null;
    // Property letters follow the permanency stars on the same line, e.g. "*** TNEIX" or "*** ENT".
    const starWord = below.find((o) => /^\*+$/.test(o.text));
    const stars = starWord?.text || null;
    const codeWord = starWord && below.find((o) => Math.abs(o.y0 - starWord.y0) < 2 && o.x0 > starWord.x1 && /^[TBONKSEHIX]{1,6}$/.test(o.text));
    const letters = codeWord?.text || '';
    const ref = w.text;
    const td = tds.get(ref);
    const chartName = below.filter((o) => o.y0 < (codeWord?.y0 ?? Infinity) - 1 && /^[A-Z’'#.\d()]+$/.test(o.text) && o.y0 - w.y1 < 12).map((o) => o.text).join(' ');
    const name = td?.name.replace(/\s*\((D|N|DISC.*)\)\s*/gi, ' ').trim() || chartName;

    let swatch = null;
    const box = { ...band(w), y0: w.y0 - swatchHeight };
    const buf = await cropBox(file, box, { dpi: 150, inset: { left: 0.02, right: 0.08, top: 0.12, bottom: 0.12 } });
    if (buf) {
      const f = path.join(outDir, `${ref}-${slug(name)}.png`);
      await writeFile(f, buf);
      swatch = { file: f };
    }

    const op = OPACITY[[...letters].find((c) => OPACITY[c])];
    paints.push({
      brand: 'Holbein',
      line: 'Artists’ Watercolor (HWC)',
      name,
      code: ref,
      pigments: td?.pigments || [],
      pigmentsRaw: td?.pigments.join(', ') || null,
      transparency: normTransparency(op),
      transparencyRaw: letters ? `${op || '?'} (${letters})` : null,
      granulation: letters ? letters.includes('X') : null,
      granulationRaw: letters ? (letters.includes('X') ? 'X = granulating' : 'no X on chart') : null,
      staining: STAIN[[...letters].find((c) => STAIN[c])] || null,
      lightfastness: stars,
      series,
      swatch,
      sourceUrl: 'https://holbeinartistmaterials.com/watercolors/artist-watercolor/',
    });
  }
  return paints;
}
