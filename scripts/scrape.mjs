// Run one or more brand scrapers and write their raw results to .cache/brands/<brand>.json.
// Usage: node scripts/scrape.mjs [brand ...]   (no args = all brands)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BRANDS, CACHE } from './lib.mjs';


const wanted = process.argv.slice(2).length ? process.argv.slice(2) : BRANDS;
await mkdir(path.join(CACHE, 'brands'), { recursive: true });

for (const brand of wanted) {
  const t0 = Date.now();
  try {
    const { scrape } = await import(`./brands/${brand}.mjs`);
    const paints = await scrape();
    await writeFile(path.join(CACHE, 'brands', `${brand}.json`), JSON.stringify(paints, null, 2));
    const pct = (k) => Math.round((100 * paints.filter((p) => p[k] != null && (!Array.isArray(p[k]) || p[k].length)).length) / (paints.length || 1));
    console.log(
      `${brand.padEnd(14)} ${String(paints.length).padStart(4)} paints  ` +
        `pigments ${pct('pigments')}%  transparency ${pct('transparency')}%  granulation ${pct('granulation')}%  swatch ${pct('swatch')}%  ` +
        `(${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  } catch (err) {
    console.error(`${brand}: FAILED — ${err.stack || err}`);
    process.exitCode = 1;
  }
}
