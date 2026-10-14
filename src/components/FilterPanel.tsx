import { useMemo, useState, type ReactNode } from 'react';
import {
  GRANULATION,
  GRANULATION_LABEL,
  HUES,
  HUE_CHIP,
  HUE_LABEL,
  TRANSPARENCY,
  TRANSPARENCY_LABEL,
  type Facets,
  type Filters,
  type PigmentMode,
} from '../filters';
import { comparePigments, pigmentName } from '../pigments';
import type { Paint } from '../types';
import { OpacityIcon } from './OpacityIcon';

interface Props {
  paints: Paint[];
  filters: Filters;
  facets: Facets;
  onChange: (patch: Partial<Filters>) => void;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterPanel({ paints, filters: f, facets, onChange }: Props) {
  // Brand -> its product lines, in a stable order.
  const brands = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of paints) {
      if (!m.has(p.brand)) m.set(p.brand, new Set());
      m.get(p.brand)!.add(p.line);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([brand, lines]) => ({ brand, lines: [...lines].sort() }));
  }, [paints]);

  return (
    <div className="filters">
      <Section title="Hue">
        <div className="hue-grid">
          {HUES.map((h) => {
            const n = facets.hues.get(h) ?? 0;
            const on = f.hues.includes(h);
            return (
              <button
                key={h}
                type="button"
                className={`hue-chip${on ? ' on' : ''}`}
                aria-pressed={on}
                disabled={!n && !on}
                onClick={() => onChange({ hues: toggle(f.hues, h) })}
                title={`${HUE_LABEL[h]} (${n})`}
              >
                <span className="dot" style={{ background: HUE_CHIP[h] }} />
                <span className="label">{HUE_LABEL[h]}</span>
                <span className="count">{n}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Transparency">
        <div className="chip-list">
          {TRANSPARENCY.map((t) => (
            <Chip
              key={t}
              on={f.transparency.includes(t)}
              count={facets.transparency.get(t) ?? 0}
              onClick={() => onChange({ transparency: toggle(f.transparency, t) })}
            >
              {t !== 'unknown' && <OpacityIcon value={t} />}
              {TRANSPARENCY_LABEL[t]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Granulation">
        <div className="chip-list">
          {GRANULATION.map((g) => (
            <Chip
              key={g}
              on={f.granulation.includes(g)}
              count={facets.granulation.get(g) ?? 0}
              onClick={() => onChange({ granulation: toggle(f.granulation, g) })}
            >
              {GRANULATION_LABEL[g]}
            </Chip>
          ))}
        </div>
      </Section>

      <PigmentSection filters={f} counts={facets.pigments} onChange={onChange} />

      <Section title="Brand & range">
        {brands.map(({ brand, lines }) => {
          const keys = lines.map((l) => `${brand} — ${l}`);
          const allOn = keys.every((k) => f.lines.includes(k));
          const someOn = keys.some((k) => f.lines.includes(k));
          return (
            <div key={brand} className="brand-group">
              <label className="check brand">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn && !allOn;
                  }}
                  onChange={() => onChange({ lines: allOn ? f.lines.filter((k) => !keys.includes(k)) : [...new Set([...f.lines, ...keys])] })}
                />
                <span>{brand}</span>
                <span className="count">{keys.reduce((s, k) => s + (facets.lines.get(k) ?? 0), 0)}</span>
              </label>
              {lines.length > 1 &&
                lines.map((l) => {
                  const k = `${brand} — ${l}`;
                  return (
                    <label key={k} className="check line">
                      <input type="checkbox" checked={f.lines.includes(k)} onChange={() => onChange({ lines: toggle(f.lines, k) })} />
                      <span>{l}</span>
                      <span className="count">{facets.lines.get(k) ?? 0}</span>
                    </label>
                  );
                })}
            </div>
          );
        })}
      </Section>

      <Section title="Other">
        <label className="check">
          <input type="checkbox" checked={f.hideShimmer} onChange={(e) => onChange({ hideShimmer: e.target.checked })} />
          <span>Hide metallic / iridescent / interference</span>
        </label>
      </Section>
    </div>
  );
}

function PigmentSection({ filters: f, counts, onChange }: { filters: Filters; counts: Map<string, number>; onChange: Props['onChange'] }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const options = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    const codes = new Set([...counts.keys(), ...f.pigments]);
    return [...codes]
      .filter((c) => !q || c.toLowerCase().includes(q) || (pigmentName(c) ?? '').toLowerCase().replace(/\s+/g, '').includes(q))
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || comparePigments(a, b));
  }, [counts, f.pigments, query]);
  const visible = showAll || query ? options : options.slice(0, 24);

  return (
    <Section title="Pigments">
      {f.pigments.length > 0 && (
        <div className="selected-pigments">
          {f.pigments.map((c) => (
            <button key={c} type="button" className="tag removable" onClick={() => onChange({ pigments: f.pigments.filter((x) => x !== c) })} title="Remove">
              {c} ×
            </button>
          ))}
          {f.pigments.length > 0 && (
            <select value={f.pigmentMode} onChange={(e) => onChange({ pigmentMode: e.target.value as PigmentMode })} aria-label="Pigment match mode">
              <option value="any">contains any of these</option>
              <option value="all">contains all of these</option>
              <option value="only">made only from these</option>
            </select>
          )}
        </div>
      )}
      <input className="pigment-search" type="search" placeholder="Find pigment: PB29, ultramarine…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={f.singlePigment} onChange={(e) => onChange({ singlePigment: e.target.checked })} />
        <span>Single-pigment paints only</span>
      </label>
      <div className="pigment-list">
        {visible.map((c) => (
          <label key={c} className="check pigment">
            <input type="checkbox" checked={f.pigments.includes(c)} onChange={() => onChange({ pigments: f.pigments.includes(c) ? f.pigments.filter((x) => x !== c) : [...f.pigments, c] })} />
            <span className="code">{c}</span>
            <span className="pname">{pigmentName(c) ?? ''}</span>
            <span className="count">{counts.get(c) ?? 0}</span>
          </label>
        ))}
        {!visible.length && <p className="muted">No pigment matches “{query}”.</p>}
      </div>
      {!query && options.length > 24 && (
        <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${options.length} pigments`}
        </button>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="filter-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Chip({ on, count, onClick, children }: { on: boolean; count: number; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} disabled={!count && !on} onClick={onClick}>
      {children}
      <span className="count">{count}</span>
    </button>
  );
}
