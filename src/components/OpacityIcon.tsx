import type { Transparency } from '../types';

// The conventional paint-label square: empty = transparent, filled = opaque.
const FILL: Record<Transparency, number> = { transparent: 0, 'semi-transparent': 0.33, 'semi-opaque': 0.66, opaque: 1 };

export function OpacityIcon({ value, size = 12 }: { value: Transparency; size?: number }) {
  const f = FILL[value];
  return (
    <svg className="opacity-icon" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.75" y="0.75" width="10.5" height="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {f > 0 && <rect x="0.75" y={0.75 + 10.5 * (1 - f)} width="10.5" height={10.5 * f} fill="currentColor" />}
    </svg>
  );
}
