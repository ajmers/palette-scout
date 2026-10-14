export type Transparency = 'transparent' | 'semi-transparent' | 'semi-opaque' | 'opaque';

export type HueFamily =
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'magenta'
  | 'violet'
  | 'blue'
  | 'turquoise'
  | 'green'
  | 'brown'
  | 'grey'
  | 'black'
  | 'white';

export interface Paint {
  id: string;
  brand: string;
  line: string;
  name: string;
  code: string | null;
  /** Colour Index generic names, normalised (e.g. "PB15:3"). */
  pigments: string[];
  pigmentsRaw: string | null;
  pigmentNames: string | null;
  transparency: Transparency | null;
  transparencyRaw: string | null;
  /** null = the manufacturer doesn't publish it. */
  granulation: boolean | null;
  granulationRaw: string | null;
  staining: string | null;
  lightfastness: string | null;
  series: string | null;
  hex: string | null;
  /** "official" = published by the brand, "swatch" = measured from the swatch image. */
  hexSource: 'official' | 'swatch' | null;
  hue: HueFamily | null;
  hueAngle: number | null;
  lightness: number | null;
  shimmer: boolean;
  swatch: string | null;
  sourceUrl: string;
}

export interface PaintData {
  generatedAt: string;
  count: number;
  paints: Paint[];
}
