import { useEffect, useRef } from 'react';
import { HUE_LABEL, TRANSPARENCY_LABEL, lightfastLabel } from '../filters';
import { pigmentName } from '../pigments';
import type { Paint } from '../types';
import { OpacityIcon } from './OpacityIcon';

interface Props {
  paint: Paint;
  onClose: () => void;
  onSamePigments: (p: Paint) => void;
  onPigment: (code: string) => void;
}

export function PaintDetail({ paint: p, onClose, onSamePigments, onPigment }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const granText = p.granulation == null ? 'Not published by the manufacturer' : p.granulation ? 'Granulating' : 'Non-granulating';

  return (
    <dialog
      ref={ref}
      className="detail"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="detail-title"
    >
      <div className="detail-inner">
        <button type="button" className="close" onClick={() => ref.current?.close()} aria-label="Close">
          ×
        </button>
        <div className="detail-swatch" style={{ background: p.hex ?? undefined }}>
          {p.swatch && <img src={p.swatch} alt={`${p.brand} ${p.name} swatch`} />}
        </div>
        <div className="detail-info">
          <p className="detail-brand">
            {p.brand} · {p.line}
          </p>
          <h2 id="detail-title">{p.name}</h2>
          {p.code && <p className="muted">No. {p.code}</p>}

          <dl>
            <dt>Pigments</dt>
            <dd>
              {p.pigments.length ? (
                <span className="pigment-tags">
                  {p.pigments.map((c) => (
                    <button key={c} type="button" className="tag" onClick={() => onPigment(c)} title="Show all paints with this pigment">
                      {c}
                      {pigmentName(c) && <span className="tag-sub"> {pigmentName(c)}</span>}
                    </button>
                  ))}
                </span>
              ) : (
                <span>{p.pigmentNames || p.pigmentsRaw || 'Not published'}</span>
              )}
              {p.pigmentNames && p.pigments.length > 0 && <div className="muted small">{p.pigmentNames}</div>}
            </dd>

            <dt>Transparency</dt>
            <dd>
              {p.transparency ? (
                <>
                  <OpacityIcon value={p.transparency} /> {TRANSPARENCY_LABEL[p.transparency]}
                </>
              ) : (
                'Not published'
              )}
              {p.transparencyRaw && <span className="muted small"> — label: “{p.transparencyRaw}”</span>}
            </dd>

            <dt>Granulation</dt>
            <dd>
              {granText}
              {p.granulationRaw && p.granulation != null && <span className="muted small"> — source: “{p.granulationRaw}”</span>}
            </dd>

            <dt>Hue</dt>
            <dd>
              {p.hex && <span className="hex-chip" style={{ background: p.hex }} />} {p.hue ? HUE_LABEL[p.hue] : '—'}
              {p.hex && (
                <span className="muted small">
                  {' '}
                  {p.hex} ({p.hexSource === 'official' ? 'published by the brand' : 'measured from swatch'})
                </span>
              )}
            </dd>

            {p.staining && (
              <>
                <dt>Staining</dt>
                <dd>{p.staining}</dd>
              </>
            )}
            <dt>Lightfastness</dt>
            <dd>
              {p.lightfast ? lightfastLabel(p.lightfast) : 'Not rated'}
              {p.lightfastness && <span className="muted small"> — label: “{p.lightfastness}”</span>}
              {p.brand === 'Winsor & Newton' && p.lightfastness && <div className="muted small">W&amp;N publish permanence (AA/A/B/C) rather than a lightfastness test.</div>}
            </dd>
            {p.series && (
              <>
                <dt>Series / price group</dt>
                <dd>{p.series}</dd>
              </>
            )}
          </dl>

          <div className="detail-actions">
            {p.pigments.length > 0 && (
              <button type="button" className="primary" onClick={() => onSamePigments(p)}>
                Same pigment{p.pigments.length > 1 ? 's' : ''} in other brands
              </button>
            )}
            <a href={p.sourceUrl} target="_blank" rel="noreferrer">
              Official source ↗
            </a>
          </div>
        </div>
      </div>
    </dialog>
  );
}
