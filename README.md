# Watercolour swatch finder

A single-page React app for browsing watercolour paints from the major manufacturers, using the swatches
and technical data each brand publishes on its own website. Paints can be filtered by **hue**,
**transparency**, **granulation**, **pigment** (Colour Index codes, with "any / all / only these" matching
and a single-pigment toggle) and **brand / range**, plus free-text search. Every filtered view is
reflected in the URL, so it can be bookmarked or shared. Clicking a paint shows all its properties, the
manufacturer's original wording, a link to the official source, and a one-click "same pigment(s) in other
brands" view.

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (relative paths, deployable anywhere)
```

The repo ships with the generated data (`public/data/paints.json`) and swatch thumbnails
(`public/swatches/`), so the app runs without re-scraping.

## What's in it

1,424 paints from 11 brands/ranges, captured October 2026:

| Brand | Range(s) | Paints | Source on the official site |
|---|---|---:|---|
| Winsor & Newton | Professional, Cotman | 163 | Product pages (spec table) on winsornewton.com |
| Daniel Smith | Extra Fine, PrimaTek, Luminescent | 271 | "Watercolor Pigment Characteristics" table + swatch gallery ¹ |
| M. Graham | Artists' Watercolor | 72 | One page per colour (sitemap) |
| Maimeri | Maimeri Blu | 90 | One page per colour on maimeri.it |
| Holbein | Artists' Watercolor (HWC) | 108 | Digital colour chart PDF + technical data sheet PDF |
| Schmincke | HORADAM® (incl. Supergranulating), AKADEMIE® | 229 | Colour chart on each product-line page |
| QoR (Golden) | QoR Watercolor | 101 | "Pigment data" table + colour pages |
| Van Gogh | Watercolour | 72 | Product variants on royaltalens.com ¹ + colour chart PDF |
| Rembrandt | Artists' Watercolour | 120 | Product variants on royaltalens.com ¹ + colour chart PDF |
| Sennelier | l'Aquarelle | 98 | Colour chart PDF + "granulating colours" list PDF |
| Rosa | ROSA Gallery | 100 | Official colour chart PDF ² |

¹ These sites block scripted requests. Their data was captured once from a normal browser session and
saved in `scripts/raw/` (see *Refreshing the data*).
² rosa.ua is behind a bot check, and its colour chart PDF has no text layer. The chart labels were
transcribed by hand into `scripts/raw/rosa_gallery_chart.json`. Swatches are cropped from the PDF itself.

### How each property is derived

- **Swatch**: the manufacturer's own painted swatch, either the product/swatch image or a crop from
  their colour chart PDF. Stored as 200 px WebP thumbnails in `public/swatches/`.
- **Pigments**: Colour Index codes as published, normalised (`P.B.15:3`, `PB 15:3` → `PB15:3`). Paints
  without CI codes (metallics, interference colours, Daniel Smith PrimaTek minerals) show the
  manufacturer's description instead.
- **Transparency**: each brand's scale mapped onto transparent / semi-transparent / semi-opaque /
  opaque. The original label is kept and shown in the detail view. For Sennelier and Rosa, the
  chart's opacity square is read from its pixels or from the chart symbol.
- **Granulation**: granulating / non-granulating / *not published*. Brand specifics:
  - W&N and M. Graham use one combined "granulation/staining" field. A colour not marked
    granulating there counts as non-granulating.
  - Holbein uses the `X` letter on its chart.
  - Royal Talens, Rosa and QoR use a `G` mark.
  - Sennelier publishes a separate list of its 36 granulating colours.
- **Hue**: a family (yellow, orange, red, pink, magenta, violet, blue, turquoise, green, earth, grey,
  black, white). It comes from the brand's published hex code where one exists (Royal Talens), and
  otherwise is measured from the swatch: the stronger part of the wash, in OKLCH. Paints made only of
  iron-oxide/earth pigments are filed under *earth*. Treat hue as a guide, since a wash spans a range.

### Known gaps

- **Maimeri does not publish granulation** anywhere on maimeri.it, so Maimeri Blu shows "not
  published" rather than a guess.
- Holbein's downloadable chart is the 108-colour HWC range. Newer Holbein specialty sets
  (luminous, nightfall, granulating) aren't on that chart.
- Sennelier's chart shows 98 of the 110 colours. The newer colours aren't on any official chart yet.
- Daniel Smith Interference Blue has no image in the official swatch gallery. Pyrrole Rubin (Holbein)
  has no opacity letter on the chart, and 8 W&N "Cadmium-Free" colours have
  no pigment code on their product pages.
- **Brands not included:** Da Vinci (site blocks automated access), White Nights / Nevskaya Palitra,
  Mijello Mission Gold, Lukas, Old Holland, Art Spectrum. Each would need a new scraper in
  `scripts/brands/`.

Swatch images and data belong to their manufacturers. This is a personal reference tool.

## Refreshing the data

Needs Node 22+ and poppler (`brew install poppler`) for the PDF charts.

```sh
npm run scrape            # all brands → .cache/brands/*.json (HTTP responses are cached in .cache/)
npm run scrape -- schmincke qor   # just some brands
npm run build:data        # → public/data/paints.json + public/swatches/
```

`scripts/brands/<brand>.mjs` holds one scraper per brand. Each returns paints in a common shape.
`scripts/build.mjs` downloads/crops swatches, computes colour and hue, and writes the JSON.
`scripts/pdf.mjs` has the helpers that locate and crop swatches in chart PDFs. Delete `.cache/http`
to force fresh downloads.

**Browser-captured inputs** (`scripts/raw/`): Daniel Smith and Royal Talens reject non-browser
clients. To refresh them, open the page in a normal browser session and export from the console:

- `ds_chars.json`: on danielsmith.com/daniel-smith-watercolor-pigment-characteristics-chart/,
  `FooTable.get('#footable_72641').rows.all.map(r => r.value)`.
- `ds_swatches.json` / `ds_img_index.json`: the `a.fusion-lightbox` entries from the four
  `/swatch-gallery/…-watercolors/` pages. The images go in `.cache/browser-images/daniel-smith/`.
- `rt_variants.json`: for each Van Gogh / Rembrandt tube and pan product on royaltalens.com, the
  `#variant-specs-<variantId>` block of each variant (opacity, pigments, colour number, hex).
- `rosa_gallery_chart.json`: transcribed from the ROSA Gallery colour chart PDF.

## Project layout

```
src/                 React app (Vite + TypeScript)
  App.tsx            data loading, URL state, layout
  filters.ts         filter model, facet counts, sorting, URL encoding
  pigments.ts        common names for Colour Index codes
  components/        FilterPanel, PaintCard, PaintDetail, OpacityIcon
scripts/             data pipeline (Node)
public/data/         generated paints.json
public/swatches/     generated swatch thumbnails
```
