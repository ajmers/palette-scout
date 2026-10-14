// Merge the per-brand scrape results into public/data/paints.json and produce local swatch
// thumbnails in public/swatches/. Run `node scripts/scrape.mjs` first.
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, ROOT, fetchCached, pool, slug, exists } from './lib.mjs';
import { BRANDS } from './scrape.mjs';

const OUT_DATA = path.join(ROOT, 'public', 'data', 'paints.json');
const OUT_SWATCH = path.join(ROOT, 'public', 'swatches');
const THUMB = 200;

const SHIMMER = /\b(iridescent|interference|metallic|pearl|duochrome|chameleon|spark|glitter|silver|gold(?! ochre| green|en)|copper|bronze|pewter|graphite|mica|coated)/i;

// --- colour maths -----------------------------------------------------------------------------

const toLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
const parseHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function oklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const H = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

// Iron oxides and natural earths. A paint made only of these reads as an "earth" to painters even
// when its swatch is a fairly saturated red-orange (burnt sienna, light red...).
const EARTH = /^(PBr\d+|PR10[12]|PY4[23]|PY119|PBk11|NBr\d+)$/;

/** Bucket a colour into the families a painter would filter by (OKLCH hue angles). */
export function hueFamily(rgb, pigments = []) {
  const { L, C, H } = oklch(rgb);
  if (C < 0.035 || (L < 0.22 && C < 0.06)) return L > 0.9 ? 'white' : L < 0.3 ? 'black' : 'grey';
  if (pigments.length && pigments.every((p) => EARTH.test(p)) && H >= 10 && H < 110) return 'brown';
  // Earths: warm hues that are dull for their lightness (siennas, umbers, ochres).
  if (H >= 20 && H < 105 && ((H < 45 && C < 0.1 && L < 0.6) || (H >= 45 && C < 0.13 && L < 0.65) || (H >= 45 && C < 0.08 && L < 0.78) || (H >= 45 && L < 0.45))) return 'brown';
  if (H >= 345 || H < 12) return L > 0.78 ? 'pink' : 'magenta';
  // Boundaries tuned on measured swatches: cadmium/pyrrole reds sit around 25-33deg, pyrrole and
  // cadmium oranges 35-85deg (light washes drift towards yellow), lemons and hansas 90-110deg.
  if (H < 34) return L > 0.8 && C < 0.12 ? 'pink' : 'red';
  if (H < 88) return 'orange';
  if (H < 115) return 'yellow';
  if (H < 165) return 'green';
  if (H < 220) return 'turquoise';
  if (H < 290) return 'blue';
  if (H < 330) return 'violet';
  return 'magenta';
}

/**
 * Representative paint colour from a swatch image: ignore bare paper, then average the pixels
 * between the 20th and 55th luminance percentile — the strong part of the wash without the
 * near-black edges some masstones show — in linear light.
 */
async function swatchColour(buf) {
  const { data, info } = await sharp(buf).flatten({ background: '#ffffff' }).resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
  const paper = (p) => { const { L, C } = oklch(p); return L > 0.93 && C < 0.03; };
  let pool_ = px.filter((p) => !paper(p));
  if (pool_.length < px.length * 0.08) pool_ = px; // white / very pale paints
  const lum = (p) => 0.2126 * toLin(p[0]) + 0.7152 * toLin(p[1]) + 0.0722 * toLin(p[2]);
  pool_.sort((a, b) => lum(a) - lum(b));
  const pick = pool_.slice(Math.floor(pool_.length * 0.2), Math.max(Math.floor(pool_.length * 0.55), 1));
  const avg = [0, 1, 2].map((c) => fromLin(pick.reduce((s, p) => s + toLin(p[c]), 0) / pick.length));
  return avg;
}

// --- swatch images ----------------------------------------------------------------------------

async function loadSwatch(sw) {
  if (!sw) return null;
  let buf = sw.file
    ? await readFile(sw.file)
    : await fetchCached(sw.url, { binary: true }).catch((err) => (sw.fallbackUrl ? fetchCached(sw.fallbackUrl, { binary: true }) : Promise.reject(err)));
  if (sw.crop) {
    const meta = await sharp(buf).metadata();
    const c = sw.crop;
    buf = await sharp(buf)
      .extract({
        left: Math.round(meta.width * c.left),
        top: Math.round(meta.height * c.top),
        width: Math.round(meta.width * (1 - c.left - c.right)),
        height: Math.round(meta.height * (1 - c.top - c.bottom)),
      })
      .toBuffer();
  }
  return buf;
}

// --- main -------------------------------------------------------------------------------------

const all = [];
for (const brand of BRANDS) {
  const f = path.join(CACHE, 'brands', `${brand}.json`);
  if (!(await exists(f))) {
    console.warn(`skipping ${brand}: no scrape output (run node scripts/scrape.mjs ${brand})`);
    continue;
  }
  all.push(...JSON.parse(await readFile(f, 'utf8')));
}

await rm(OUT_SWATCH, { recursive: true, force: true });
await mkdir(path.dirname(OUT_DATA), { recursive: true });

const ids = new Set();
const failures = [];
const paints = await pool(all, 8, async (p) => {
  let id = slug(`${p.brand} ${p.line} ${p.code || ''} ${p.name}`);
  while (ids.has(id)) id += '-x';
  ids.add(id);

  let swatchPath = null;
  let rgb = p.hex ? parseHex(p.hex) : null;
  let hexSource = p.hex ? 'official' : null;
  try {
    const buf = await loadSwatch(p.swatch);
    if (buf) {
      const dir = path.join(OUT_SWATCH, slug(p.brand));
      await mkdir(dir, { recursive: true });
      await sharp(buf).flatten({ background: '#ffffff' }).resize(THUMB, THUMB, { fit: 'cover' }).webp({ quality: 82 }).toFile(path.join(dir, `${id}.webp`));
      swatchPath = `swatches/${slug(p.brand)}/${id}.webp`;
      if (!rgb) {
        rgb = await swatchColour(buf);
        hexSource = 'swatch';
      }
    }
  } catch (err) {
    failures.push(`${p.brand} ${p.name}: ${err.message}`);
  }

  const shimmer = SHIMMER.test(`${p.name} ${p.pigmentsRaw || ''}`);
  return {
    id,
    brand: p.brand,
    line: p.line,
    name: p.name,
    code: p.code,
    pigments: p.pigments,
    pigmentsRaw: p.pigmentsRaw ?? null,
    pigmentNames: p.pigmentNames ?? null,
    transparency: p.transparency,
    transparencyRaw: p.transparencyRaw ?? null,
    granulation: p.granulation,
    granulationRaw: p.granulationRaw ?? null,
    staining: p.staining ?? null,
    lightfastness: p.lightfastness ?? null,
    series: p.series ?? null,
    hex: rgb ? hex(rgb) : null,
    hexSource,
    hue: rgb ? hueFamily(rgb, p.pigments) : null,
    hueAngle: rgb ? Math.round(oklch(rgb).H) : null,
    lightness: rgb ? Math.round(oklch(rgb).L * 100) / 100 : null,
    shimmer,
    swatch: swatchPath,
    sourceUrl: p.sourceUrl,
  };
});

paints.sort((a, b) => a.brand.localeCompare(b.brand) || a.line.localeCompare(b.line) || a.name.localeCompare(b.name));
await writeFile(OUT_DATA, JSON.stringify({ generatedAt: new Date().toISOString(), count: paints.length, paints }));

const by = {};
for (const p of paints) by[p.brand] = (by[p.brand] || 0) + 1;
console.log(`wrote ${paints.length} paints to ${path.relative(ROOT, OUT_DATA)}`, by);
const swatchFiles = (await readdir(OUT_SWATCH, { recursive: true })).filter((f) => f.endsWith('.webp')).length;
console.log(`${swatchFiles} swatch thumbnails in ${path.relative(ROOT, OUT_SWATCH)}`);
if (failures.length) console.warn(`${failures.length} swatch failures:\n  ` + failures.join('\n  '));
