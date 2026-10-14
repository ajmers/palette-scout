import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FilterPanel } from './components/FilterPanel';
import { PaintCard } from './components/PaintCard';
import { PaintDetail } from './components/PaintDetail';
import { EMPTY, activeCount, facets as computeFacets, fromSearch, matches, sortPaints, toSearch, type Filters, type SortKey } from './filters';
import type { Paint, PaintData } from './types';

const BASE = import.meta.env.BASE_URL;

export default function App() {
  const [data, setData] = useState<PaintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => fromSearch(window.location.search));
  const [selected, setSelected] = useState<Paint | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetch(`${BASE}data/paints.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PaintData>;
      })
      .then((d) => setData({ ...d, paints: d.paints.map((p) => ({ ...p, swatch: p.swatch && BASE + p.swatch })) }))
      .catch((e) => setError(String(e)));
  }, []);

  // Keep the URL in sync so a filtered view can be bookmarked or shared.
  useEffect(() => {
    const url = window.location.pathname + toSearch(filters);
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, '', url);
  }, [filters]);

  const update = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const deferred = useDeferredValue(filters);

  const paints = useMemo(() => data?.paints ?? [], [data]);
  const results = useMemo(() => sortPaints(paints.filter((p) => matches(p, deferred)), deferred.sort), [paints, deferred]);
  const facetCounts = useMemo(() => computeFacets(paints, deferred), [paints, deferred]);
  const nActive = activeCount(filters);

  const samePigments = useCallback(
    (p: Paint) => {
      setSelected(null);
      setFilters({ ...EMPTY, sort: filters.sort, pigments: p.pigments, pigmentMode: 'only' });
      window.scrollTo({ top: 0 });
    },
    [filters.sort],
  );
  const byPigment = useCallback(
    (code: string) => {
      setSelected(null);
      setFilters({ ...EMPTY, sort: filters.sort, pigments: [code], pigmentMode: 'any' });
      window.scrollTo({ top: 0 });
    },
    [filters.sort],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Palette <span>Scout</span>
        </h1>
        <input
          className="search"
          type="search"
          placeholder="Search name, brand, pigment…"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          aria-label="Search paints"
        />
        <button type="button" className="filter-toggle" onClick={() => setPanelOpen(true)}>
          Filters{nActive ? ` (${nActive})` : ''}
        </button>
      </header>

      <div className="layout">
        <aside className={`panel${panelOpen ? ' open' : ''}`} aria-label="Filters">
          <div className="panel-head">
            <strong>Filters</strong>
            {nActive > 0 && (
              <button type="button" className="link" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>
                Clear all
              </button>
            )}
            <button type="button" className="close panel-close" onClick={() => setPanelOpen(false)} aria-label="Close filters">
              ×
            </button>
          </div>
          {data && <FilterPanel paints={paints} filters={filters} facets={facetCounts} onChange={update} />}
        </aside>
        {panelOpen && <div className="scrim" onClick={() => setPanelOpen(false)} />}

        <main>
          <div className="results-bar">
            <span>
              {data ? (
                <>
                  <strong>{results.length.toLocaleString()}</strong> of {paints.length.toLocaleString()} paints
                </>
              ) : error ? (
                <span className="error">Couldn’t load paint data ({error}). Run the data build — see README.</span>
              ) : (
                'Loading paints…'
              )}
            </span>
            <label className="sort">
              Sort
              <select value={filters.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
                <option value="hue">Colour</option>
                <option value="lightness">Light → dark</option>
                <option value="lightfast">Most lightfast</option>
                <option value="name">Name</option>
                <option value="brand">Brand</option>
              </select>
            </label>
          </div>

          {data && results.length === 0 && (
            <div className="empty">
              <p>No paints match these filters.</p>
              <button type="button" className="primary" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>
                Clear filters
              </button>
            </div>
          )}

          <div className="grid">
            {results.map((p) => (
              <PaintCard key={p.id} paint={p} onOpen={setSelected} />
            ))}
          </div>

          {data && (
            <footer className="foot">
              Swatches and properties are taken from each manufacturer’s official website, colour charts and technical sheets. Hue
              families are measured from the swatch (or the brand’s published hex), so treat them as a guide. Data built{' '}
              {new Date(data.generatedAt).toLocaleDateString()}.
            </footer>
          )}
        </main>
      </div>

      {selected && <PaintDetail paint={selected} onClose={() => setSelected(null)} onSamePigments={samePigments} onPigment={byPigment} />}
    </div>
  );
}
