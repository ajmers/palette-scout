// White Nights (Nevskaya Palitra) — the official colour charts on nevskayapalitra.com/colors/. The
// current charts are flat JPEGs with no text layer, so their labels were transcribed into
// scripts/raw/white_nights_chart.json (see README). Swatches are cropped from the chart images, and
// for the pastel colours (only on the 2023 catalogue PDF) from the PDF page.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, RAW, fetchCached, parsePigments, normTransparency, slug } from '../lib.mjs';
import { cachedPdf, cropBox } from '../pdf.mjs';

const OPACITY = { O: 'Opaque', S: 'Semi-transparent', T: 'Transparent' };
const STAIN = { S: 'staining', H: 'semi-staining', N: 'non-staining' };
// Stay inside the swatch's grey frame.
const INSET = { left: 0.03, right: 0.03, top: 0.06, bottom: 0.06 };

export async function scrape() {
  const chart = JSON.parse(await readFile(path.join(RAW, 'white_nights_chart.json'), 'utf8'));
  const images = {};
  for (const [key, c] of Object.entries(chart.charts)) {
    if (c.url) images[key] = await fetchCached(c.url, { binary: true });
  }
  const pastel = chart.charts.pastel;
  const pdf = await cachedPdf(pastel.pdf, 'white-nights-catalogue.pdf');
  const outDir = path.join(CACHE, 'crops', 'white-nights');
  await mkdir(outDir, { recursive: true });

  const paints = [];
  for (const [src, x, y, code, name, stars, op, stain, flags, pigmentsRaw] of chart.colours) {
    const [w, h] = chart.charts[src].swatch;
    let buf;
    if (images[src]) {
      buf = await sharp(images[src])
        .extract({
          left: Math.round(x + w * INSET.left),
          top: Math.round(y + h * INSET.top),
          width: Math.round(w * (1 - INSET.left - INSET.right)),
          height: Math.round(h * (1 - INSET.top - INSET.bottom)),
        })
        .png()
        .toBuffer();
    } else {
      const toPt = 72 / pastel.dpi;
      const box = { page: pastel.page, x0: x * toPt, x1: (x + w) * toPt, y0: y * toPt, y1: (y + h) * toPt };
      buf = await cropBox(pdf, box, { dpi: pastel.dpi, inset: INSET });
    }
    let swatch = null;
    if (buf) {
      const f = path.join(outDir, `${code}-${slug(name)}.png`);
      await writeFile(f, buf);
      swatch = { file: f };
    }
    paints.push({
      brand: 'White Nights',
      line: 'Extra-Fine Artists’ Watercolours',
      name,
      code,
      pigments: parsePigments(pigmentsRaw),
      pigmentsRaw: pigmentsRaw || null,
      transparency: normTransparency(OPACITY[op]),
      transparencyRaw: `${OPACITY[op]} (chart symbol)`,
      granulation: flags.includes('G'),
      granulationRaw: flags.includes('G') ? 'G = granulating paints (colour chart)' : 'no G on colour chart',
      staining: STAIN[stain] || null,
      lightfastness: stars || null,
      series: null,
      natural: flags.includes('E'),
      swatch,
      sourceUrl: 'https://nevskayapalitra.com/katalog/paints/watercolours/white-nights/',
    });
  }
  return paints;
}
