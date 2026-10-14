import { memo } from 'react';
import { ROMAN, TRANSPARENCY_LABEL, lightfastLabel } from '../filters';
import type { Paint } from '../types';
import { OpacityIcon } from './OpacityIcon';

export const PaintCard = memo(function PaintCard({ paint: p, onOpen }: { paint: Paint; onOpen: (p: Paint) => void }) {
  return (
    <button type="button" className="card" onClick={() => onOpen(p)}>
      <div className="swatch" style={{ background: p.hex ?? undefined }}>
        {p.swatch && <img src={p.swatch} alt="" loading="lazy" decoding="async" width={200} height={200} />}
      </div>
      <div className="card-body">
        <div className="card-name">{p.name}</div>
        <div className="card-brand">
          {p.brand}
          <span className="card-line"> · {p.line}</span>
        </div>
        <div className="card-meta">
          {p.transparency && (
            <span className="badge" title={TRANSPARENCY_LABEL[p.transparency]}>
              <OpacityIcon value={p.transparency} />
            </span>
          )}
          {p.lightfast && (
            <span className={`badge lf lf-${p.lightfast}`} title={`Lightfastness ${lightfastLabel(p.lightfast)}`}>
              {ROMAN[p.lightfast]}
            </span>
          )}
          {p.granulation && (
            <span className="badge gran" title="Granulating">
              G
            </span>
          )}
          <span className="card-pigments">{p.pigments.length ? p.pigments.join(' ') : p.pigmentNames || p.pigmentsRaw || ''}</span>
        </div>
      </div>
    </button>
  );
});
