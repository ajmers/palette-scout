// ROSA Gallery (Ukraine) — the official colour chart PDF. rosa.ua sits behind a bot check, and the
// chart's text is outlined, so its labels were transcribed into scripts/raw/rosa_gallery_chart.json
// (see README); swatches are cropped from the PDF on the chart's regular grid.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE, RAW, parsePigments, normTransparency, slug } from '../lib.mjs';
import { cachedPdf, cropBox } from '../pdf.mjs';

const OPACITY = { O: 'Opaque', S: 'Semi-opaque', T: 'Transparent' };

export async function scrape() {
  const chart = JSON.parse(await readFile(path.join(RAW, 'rosa_gallery_chart.json'), 'utf8'));
  const file = await cachedPdf(chart.pdf, 'rosa-gallery-chart.pdf');
  const outDir = path.join(CACHE, 'crops', 'rosa');
  await mkdir(outDir, { recursive: true });
  const toPt = 72 / chart.dpi; // grid was measured on a 200 dpi render

  const paints = [];
  for (const [col, row, code, name, op, flags, stars, pigmentsRaw] of chart.colours) {
    const [x0, x1] = chart.columns[col];
    const top = chart.rowTop + chart.rowPitch * row;
    const box = { page: 1, x0: x0 * toPt, x1: x1 * toPt, y0: top * toPt, y1: (top + chart.swatchHeight) * toPt };
    // Generous inset: new colours are outlined in red on the chart.
    const buf = await cropBox(file, box, { dpi: 200, inset: { left: 0.04, right: 0.04, top: 0.1, bottom: 0.1 } });
    let swatch = null;
    if (buf) {
      const f = path.join(outDir, `${code}-${slug(name)}.png`);
      await writeFile(f, buf);
      swatch = { file: f };
    }
    paints.push({
      brand: 'Rosa',
      line: 'ROSA Gallery Watercolour',
      name,
      code,
      pigments: parsePigments(pigmentsRaw),
      pigmentsRaw: pigmentsRaw || null,
      transparency: normTransparency(OPACITY[op]),
      transparencyRaw: `${OPACITY[op]} (chart symbol)`,
      granulation: flags.includes('G'),
      granulationRaw: flags.includes('G') ? 'G = granulation effect (colour chart)' : 'no G on colour chart',
      staining: null,
      lightfastness: stars || null,
      series: null,
      natural: flags.includes('N'),
      swatch,
      sourceUrl: 'https://rosa.ua/en/rosa-products/fine-art-paints/watercolours/watercolours-paint-tube-10ml-rosa-gallery/',
    });
  }
  return paints;
}
