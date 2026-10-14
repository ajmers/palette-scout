import type { HueFamily, Paint, Transparency } from './types';

export type GranulationFilter = 'yes' | 'no' | 'unknown';
export type TransparencyFilter = Transparency | 'unknown';
export type PigmentMode = 'any' | 'all' | 'only';
export type SortKey = 'hue' | 'name' | 'brand' | 'lightness';

export interface Filters {
  q: string;
  /** Product lines, as `lineKey(paint)`. Empty = all. */
  lines: string[];
  hues: HueFamily[];
  transparency: TransparencyFilter[];
  granulation: GranulationFilter[];
  pigments: string[];
  pigmentMode: PigmentMode;
  singlePigment: boolean;
  hideShimmer: boolean;
  sort: SortKey;
}

export const EMPTY: Filters = {
  q: '',
  lines: [],
  hues: [],
  transparency: [],
  granulation: [],
  pigments: [],
  pigmentMode: 'any',
  singlePigment: false,
  hideShimmer: false,
  sort: 'hue',
};

export const HUES: HueFamily[] = ['yellow', 'orange', 'red', 'pink', 'magenta', 'violet', 'blue', 'turquoise', 'green', 'brown', 'grey', 'black', 'white'];
export const HUE_LABEL: Record<HueFamily, string> = {
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red',
  pink: 'Pink',
  magenta: 'Magenta',
  violet: 'Violet',
  blue: 'Blue',
  turquoise: 'Turquoise',
  green: 'Green',
  brown: 'Earth',
  grey: 'Grey',
  black: 'Black',
  white: 'White',
};
// Representative chip colours for the hue filter.
export const HUE_CHIP: Record<HueFamily, string> = {
  yellow: '#f2c623',
  orange: '#ee8a24',
  red: '#d4302b',
  pink: '#f2a7b8',
  magenta: '#c2266f',
  violet: '#6c3d9c',
  blue: '#2550a8',
  turquoise: '#1b9c9a',
  green: '#2f8a46',
  brown: '#8a5a32',
  grey: '#8d8d8d',
  black: '#222222',
  white: '#f7f5ef',
};

export const TRANSPARENCY: TransparencyFilter[] = ['transparent', 'semi-transparent', 'semi-opaque', 'opaque', 'unknown'];
export const TRANSPARENCY_LABEL: Record<TransparencyFilter, string> = {
  transparent: 'Transparent',
  'semi-transparent': 'Semi-transparent',
  'semi-opaque': 'Semi-opaque',
  opaque: 'Opaque',
  unknown: 'Not published',
};
export const GRANULATION: GranulationFilter[] = ['yes', 'no', 'unknown'];
export const GRANULATION_LABEL: Record<GranulationFilter, string> = {
  yes: 'Granulating',
  no: 'Non-granulating',
  unknown: 'Not published',
};

export const lineKey = (p: Paint) => `${p.brand} — ${p.line}`;
const granKey = (p: Paint): GranulationFilter => (p.granulation == null ? 'unknown' : p.granulation ? 'yes' : 'no');
const transKey = (p: Paint): TransparencyFilter => p.transparency ?? 'unknown';

type Group = 'lines' | 'hues' | 'transparency' | 'granulation' | 'pigments';

function normalise(s: string) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Does `p` pass every filter except the group named in `skip` (used for facet counts)? */
export function matches(p: Paint, f: Filters, skip?: Group): boolean {
  if (f.q) {
    const hay = normalise(`${p.name} ${p.brand} ${p.line} ${p.code ?? ''} ${p.pigments.join(' ')} ${p.pigmentsRaw ?? ''} ${p.pigmentNames ?? ''}`);
    if (!normalise(f.q).split(/\s+/).filter(Boolean).every((t) => hay.includes(t))) return false;
  }
  if (f.hideShimmer && p.shimmer) return false;
  if (f.singlePigment && p.pigments.length !== 1) return false;
  if (skip !== 'lines' && f.lines.length && !f.lines.includes(lineKey(p))) return false;
  if (skip !== 'hues' && f.hues.length && !(p.hue && f.hues.includes(p.hue))) return false;
  if (skip !== 'transparency' && f.transparency.length && !f.transparency.includes(transKey(p))) return false;
  if (skip !== 'granulation' && f.granulation.length && !f.granulation.includes(granKey(p))) return false;
  if (skip !== 'pigments' && f.pigments.length) {
    const has = (c: string) => p.pigments.includes(c);
    if (f.pigmentMode === 'any' && !f.pigments.some(has)) return false;
    if (f.pigmentMode === 'all' && !f.pigments.every(has)) return false;
    if (f.pigmentMode === 'only' && !(p.pigments.length && p.pigments.every((c) => f.pigments.includes(c)))) return false;
  }
  return true;
}

export interface Facets {
  lines: Map<string, number>;
  hues: Map<HueFamily, number>;
  transparency: Map<TransparencyFilter, number>;
  granulation: Map<GranulationFilter, number>;
  pigments: Map<string, number>;
}

/** Counts per option, each computed with all *other* filter groups applied. */
export function facets(paints: Paint[], f: Filters): Facets {
  const out: Facets = { lines: new Map(), hues: new Map(), transparency: new Map(), granulation: new Map(), pigments: new Map() };
  const inc = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const p of paints) {
    if (matches(p, f, 'lines')) inc(out.lines, lineKey(p));
    if (p.hue && matches(p, f, 'hues')) inc(out.hues, p.hue);
    if (matches(p, f, 'transparency')) inc(out.transparency, transKey(p));
    if (matches(p, f, 'granulation')) inc(out.granulation, granKey(p));
    if (matches(p, f, 'pigments')) for (const c of p.pigments) inc(out.pigments, c);
  }
  return out;
}

const HUE_ORDER = new Map(HUES.map((h, i) => [h, i]));
export function sortPaints(list: Paint[], key: SortKey): Paint[] {
  const byName = (a: Paint, b: Paint) => a.name.localeCompare(b.name) || a.brand.localeCompare(b.brand);
  const sorted = [...list];
  switch (key) {
    case 'name':
      return sorted.sort(byName);
    case 'brand':
      return sorted.sort((a, b) => a.brand.localeCompare(b.brand) || a.line.localeCompare(b.line) || byName(a, b));
    case 'lightness':
      return sorted.sort((a, b) => (b.lightness ?? 0) - (a.lightness ?? 0) || byName(a, b));
    case 'hue':
      // Group by family, then sweep the hue wheel and go light -> dark within a family.
      return sorted.sort(
        (a, b) =>
          (HUE_ORDER.get(a.hue!) ?? 99) - (HUE_ORDER.get(b.hue!) ?? 99) ||
          (a.hueAngle ?? 0) - (b.hueAngle ?? 0) ||
          (b.lightness ?? 0) - (a.lightness ?? 0),
      );
  }
}

// --- URL <-> filters ----------------------------------------------------------------------------

const LIST_KEYS = { lines: 'line', hues: 'hue', transparency: 't', granulation: 'g', pigments: 'pig' } as const;

export function toSearch(f: Filters): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  for (const [k, param] of Object.entries(LIST_KEYS)) {
    const v = f[k as keyof typeof LIST_KEYS] as string[];
    if (v.length) sp.set(param, v.join('~'));
  }
  if (f.pigmentMode !== 'any') sp.set('pm', f.pigmentMode);
  if (f.singlePigment) sp.set('single', '1');
  if (f.hideShimmer) sp.set('noshimmer', '1');
  if (f.sort !== 'hue') sp.set('sort', f.sort);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function fromSearch(search: string): Filters {
  const sp = new URLSearchParams(search);
  const list = (param: string) => (sp.get(param) ? sp.get(param)!.split('~').filter(Boolean) : []);
  return {
    q: sp.get('q') ?? '',
    lines: list(LIST_KEYS.lines),
    hues: list(LIST_KEYS.hues) as HueFamily[],
    transparency: list(LIST_KEYS.transparency) as TransparencyFilter[],
    granulation: list(LIST_KEYS.granulation) as GranulationFilter[],
    pigments: list(LIST_KEYS.pigments),
    pigmentMode: (['any', 'all', 'only'].includes(sp.get('pm') ?? '') ? sp.get('pm') : 'any') as PigmentMode,
    singlePigment: sp.get('single') === '1',
    hideShimmer: sp.get('noshimmer') === '1',
    sort: (['hue', 'name', 'brand', 'lightness'].includes(sp.get('sort') ?? '') ? sp.get('sort') : 'hue') as SortKey,
  };
}

export const activeCount = (f: Filters) =>
  (f.q ? 1 : 0) + f.lines.length + f.hues.length + f.transparency.length + f.granulation.length + f.pigments.length + (f.singlePigment ? 1 : 0) + (f.hideShimmer ? 1 : 0);
