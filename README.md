# Postcode Explorer

An interactive map of UK postcodes. Zoom from postcode **areas** (SY) through
**districts** (SY1) and **sectors** (SY1 1) down to individual **postcodes**
(SY1 1AD). The level of detail changes automatically with zoom and adapts to how
dense the postcodes are (city centres switch later than the countryside).

Shropshire (plus the neighbouring SY, TF, WV and DY areas) has full detail. The
rest of Great Britain has areas and districts, and search works for any UK
postcode.

- **Stack:** Next.js (static export) · React · TypeScript · Tailwind CSS · MapLibre GL JS
- **Data:** ONS Postcode Directory → static, chunked files loaded on demand (no server, no database)
- **Search & admin details:** [postcodes.io](https://postcodes.io)
- **Basemap:** [OpenFreeMap](https://openfreemap.org) (free, no API key)

> Postcode boundaries shown are **approximations** derived from official postcode
> reference points; no open official boundary dataset exists. See
> [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Features

- Five zoom-driven levels (areas → districts → sectors → postcodes → close-up), with
  smooth cross-fades and a manual override: **Auto | Areas | Districts | Sectors | Individual**
- Search for full or partial postcodes, sectors, districts, areas or area names, case-
  and space-insensitive, with autocomplete. Clear messages for invalid, unknown,
  terminated and unreachable cases.
- Click any region or postcode for details: hierarchy, coordinates, positional quality,
  administrative geography, data source and release, copy and share buttons
- Desktop side panel, mobile draggable bottom sheet
- **Colour coding**: regions in four colours so neighbours never match, or shaded by postcode density, or outlines only
- **Map styles**: Light, Streets, Bright, Dark and Minimal (offline)
- **Find my nearest postcode** (device location), nearby postcodes, "Open in Google Maps"
- **Postcode quiz**: name the highlighted district or area, with score and best streak
- **Borders**: England/Wales/Scotland borders and council boundaries, plus a **“Where it is”** breakdown for every area and district (e.g. SY: 67% England, 33% Wales; 63% Shropshire, 21% Powys…)
- Recent searches; Home and "View entire UK" controls; legend; level indicator; installable as an app on phones
- Phone-friendly: compact top bar, draggable bottom sheets, large touch targets, no accidental iOS zoom
- Shareable URLs: `/?pc=SY1+1AD#map=16.5/52.7055/-2.7506`
- Works without the basemap or postcodes.io: falls back to an offline coastline map
  and local search

## Run it locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The repository includes a pre-built dataset in
`public/data` (see the note on data provenance below).

## Get the official data and rebuild

**Easiest: GitHub Actions (no setup).** In GitHub, open **Actions → “Build postcode
data from official ONSPD” → Run workflow**, choose your branch and press Run. It
finds the latest ONSPD on the ONS portal (or uses a download link you paste in),
rebuilds `public/data`, verifies and cross-checks it, and commits the result.
Vercel then redeploys automatically. Once built from the official file, the
“unofficial copy” notes disappear from the app.

**Or on your own computer:**

1. Download the latest **ONSPD** from the ONS Open Geography Portal:
   https://geoportal.statistics.gov.uk → search "ONS Postcode Directory" → newest
   release → Download. Unzip it.
2. Copy the UK CSV (e.g. `Data/ONSPD_FEB_2026_UK.csv`, ~1.3 GB) into `raw/`, which git ignores.
3. Build and check:

```bash
npm run data:build -- --source onspd --input raw/ONSPD_FEB_2026_UK.csv
```

```bash
npm run data:verify
```

```bash
npm run data:crosscheck -- --source onspd --input raw/ONSPD_FEB_2026_UK.csv
```

The cross-check compares the data with independent sources and writes
`docs/ACCURACY_REPORT.md` and `public/data/crosscheck.json` (shown in the app).

Options: `--detail SY,TF,WV,DY` (or `all`) sets which areas get sector and postcode
detail; `--include-ni` includes Northern Ireland (read the licensing note first).
Defaults live in `pipeline/config.json`.

One-off reference steps, only needed when upgrading those inputs:
`npm run data:land` (coastline), `npm run data:admin` (council and country
borders) and `npm run data:glyphs` (label fonts).

## Deploy

`npm run build` writes a fully static site to `out/`, including the data. Host it
anywhere that serves static files:

- **Vercel / Netlify / Cloudflare Pages:** connect the repo; build command
  `npm run build`, output directory `out`.
- **Any web server / S3 / R2:** upload the contents of `out/`.

Optional environment variables (set at build time):

| Variable | Default |
|---|---|
| `NEXT_PUBLIC_DATA_BASE_URL` | `/data` |
| `NEXT_PUBLIC_LOOKUP_API_URL` | `https://api.postcodes.io` |
| `NEXT_PUBLIC_BASEMAP_LIGHT` | `https://tiles.openfreemap.org/styles/positron` |
| `NEXT_PUBLIC_BASEMAP_DARK` | `https://tiles.openfreemap.org/styles/dark` |

Running costs: none for the site itself. OpenFreeMap and postcodes.io are free
public services; for heavy traffic, consider self-hosting postcodes.io (it's open
source) or a paid tile plan.

## Project layout

```
app/              Next.js entry (layout, page, global styles)
components/       UI: Explorer (state), SearchBox, LevelBar, DetailsPanel, PanelShell, MapControls, Legend, AboutDialog
config/app.ts     Region, basemap and service configuration
lib/
  data.ts         Data-access layer: index, lazy chunk loading, caching
  levels.ts       Zoom levels and density-adaptive thresholds
  mapController.ts  MapLibre wrapper: viewport loading, level switching, hover/click, selection
  mapLayers.ts    Layer styling and zoom cross-fades
  search.ts       Suggestions and resolution (local first, then postcodes.io)
  lookup.ts       postcodes.io client
  postcode.ts     Postcode parsing and normalisation
  url.ts          Shareable URL state
pipeline/         Data pipeline (Node): build, verify, source adapters, Voronoi boundaries, tests
public/data/      Generated dataset (manifest, index, boundaries, postcode points)
public/fonts/     Self-hosted label glyphs
docs/             Data sources and licensing, UK-wide expansion
```

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run data:verify
```

## Data provenance of the committed build

Check `public/data/manifest.json` → `source.verified`. A build made from the
official ONSPD download is marked verified. If it says `false`, the data came from
an unofficial copy and the app shows a warning banner; rebuild from ONSPD as
described above.

## Documentation

- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): sources, licences, attribution, limitations
- [docs/EXPANSION.md](docs/EXPANSION.md): adding regions, a national build, hosting, updates
- [docs/ACCURACY.md](docs/ACCURACY.md): independent accuracy checks and what they show
