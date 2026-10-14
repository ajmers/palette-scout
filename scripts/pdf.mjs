// Helpers for pulling text positions and swatch crops out of manufacturer colour-chart PDFs.
// Requires poppler (`brew install poppler`) for pdftotext / pdftoppm.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, exists, fetchCached } from './lib.mjs';

const run = promisify(execFile);

/** Download a PDF into the cache and return its local path. */
export async function cachedPdf(url, name) {
  const file = path.join(CACHE, 'pdf', name);
  if (!(await exists(file))) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, await fetchCached(url, { binary: true }));
  }
  return file;
}

export async function pdfText(file, { layout = true, page } = {}) {
  const args = [...(layout ? ['-layout'] : []), ...(page ? ['-f', page, '-l', page] : []), file, '-'];
  return (await run('pdftotext', args, { maxBuffer: 64 << 20 })).stdout;
}

/** Every word on every page with its bounding box in PDF points. */
export async function pdfWords(file) {
  const { stdout } = await run('pdftotext', ['-bbox', file, '-'], { maxBuffer: 64 << 20 });
  const words = [];
  let page = 0;
  for (const line of stdout.split('\n')) {
    if (line.includes('<page ')) page++;
    const m = line.match(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/);
    if (m) {
      const text = m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      words.push({ page, x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text });
    }
  }
  return words;
}

/** Group words into visual lines (same page, overlapping baseline). */
export function lines(words, tol = 2) {
  const sorted = [...words].sort((a, b) => a.page - b.page || a.y0 - b.y0 || a.x0 - b.x0);
  const out = [];
  for (const w of sorted) {
    const l = out.find((l) => l.page === w.page && Math.abs(l.y0 - w.y0) <= tol && w.x0 - l.x1 < 12 && w.x0 >= l.x0);
    if (l) {
      l.words.push(w);
      l.text += ' ' + w.text;
      l.x1 = Math.max(l.x1, w.x1);
      l.y1 = Math.max(l.y1, w.y1);
    } else out.push({ page: w.page, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, text: w.text, words: [w] });
  }
  return out;
}

/**
 * Find the empty vertical band directly above `anchor` inside a column of width `colWidth`
 * centred on `cx`. The band runs from the bottom of the nearest text above (ignoring words
 * matched by `ignore`, e.g. "NEW" stickers printed on swatches) down to the anchor's top.
 */
export function bandAbove(anchor, words, { cx, colWidth, ignore = /^$/, maxHeight = 200 }) {
  const left = cx - colWidth / 2;
  const right = cx + colWidth / 2;
  let top = Math.max(0, anchor.y0 - maxHeight);
  for (const w of words) {
    if (w.page !== anchor.page || w.y1 > anchor.y0 - 1 || ignore.test(w.text)) continue;
    if (w.x1 < left || w.x0 > right) continue;
    if (w.y1 > top) top = w.y1;
  }
  return { page: anchor.page, x0: left, x1: right, y0: top, y1: anchor.y0 };
}

const renders = new Map();
/** Render a PDF page to PNG once (cached) and return its path. */
export async function renderPage(file, page, dpi) {
  const key = `${file}#${page}@${dpi}`;
  if (!renders.has(key)) {
    renders.set(
      key,
      (async () => {
        const prefix = path.join(CACHE, 'pdf', `${path.basename(file, '.pdf')}-p${page}-${dpi}`);
        const png = `${prefix}.png`;
        if (!(await exists(png))) {
          await run('pdftoppm', ['-r', String(dpi), '-f', String(page), '-l', String(page), '-singlefile', '-png', file, prefix]);
        }
        return png;
      })(),
    );
  }
  return renders.get(key);
}

/**
 * Crop a box (PDF points) from a rendered page, shrinking it by `inset` (fraction per side,
 * or {x, y, top, bottom, left, right}) to stay clear of borders and labels.
 */
export async function cropBox(file, box, { dpi = 200, inset = 0.12 } = {}) {
  const png = await renderPage(file, box.page, dpi);
  const k = dpi / 72;
  const i = typeof inset === 'number' ? { left: inset, right: inset, top: inset, bottom: inset } : inset;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const meta = await sharp(png).metadata();
  const left = Math.max(0, Math.round((box.x0 + w * (i.left ?? 0)) * k));
  const top = Math.max(0, Math.round((box.y0 + h * (i.top ?? 0)) * k));
  const width = Math.min(meta.width - left, Math.round(w * (1 - (i.left ?? 0) - (i.right ?? 0)) * k));
  const height = Math.min(meta.height - top, Math.round(h * (1 - (i.top ?? 0) - (i.bottom ?? 0)) * k));
  if (width < 4 || height < 4) return null;
  return sharp(png).extract({ left, top, width, height }).png().toBuffer();
}
