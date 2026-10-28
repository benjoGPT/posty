# Handover: Postcode Explorer ("posty")

Written for the next AI agent. The owner (Ben, @benjobuilds) is an experienced
intraday trader with **very basic coding knowledge** — explain steps plainly,
give exact click paths, and be honest about what is untested. He wants direct,
unbiased answers, not flattery.

## Where things are
- Repo: `benjoGPT/posty`. **Develop and push only on `claude/epic-franklin-lv8rwq`.** No PRs unless asked.
- Live: https://posty-teal.vercel.app (Vercel auto-deploys from that branch; production target).
- Commit trailer used so far: `Co-Authored-By: …` and `Claude-Session: https://claude.ai/code/session_012tSne3s64b1hcjtCQBMhcs`. Never put a model name in commits/PRs.
- Stack: Next.js 16 static export, React 19, TypeScript, Tailwind 4, MapLibre GL 5. No server, no database. Data = static chunked files in `public/data`.
- Commands: `npx tsc --noEmit`, `npm test` (5 pass), `npx next build` (outputs `out/`), `npm run data:verify`.
- Browser testing: Playwright + Chromium are preinstalled (`require('playwright')`); serve `out/` with `python3 -m http.server`. The sandbox can only reach npm, PyPI, raw.githubusercontent.com, Land Registry S3 and Overture S3. **Not** reachable: postcodes.io, Nomis (census), Ofcom, Environment Agency, police.uk, ONS geoportal, OpenFreeMap tiles (so the map shows the offline coastline basemap in tests).
- Docs: `README.md`, `docs/DATA_SOURCES.md` (licensing — read it), `docs/ACCURACY*.md`, `docs/EXPANSION.md`.

## Architecture in one minute
- `pipeline/` builds the data: `build.mjs` (Voronoi boundaries from postcode points → sectors/districts/areas, clipped to coast), `prices.mjs` (Land Registry), `places.mjs` (Overture/OSM), `admin.mjs` (councils/borders), `fetch-onspd.mjs` (official ONSPD for the GitHub Action). Enrichments are optional files in `raw/derived/` (gitignored) that `build.mjs` merges in.
- `lib/mapLayers.ts` = all MapLibre layers/paint. **Gotcha:** paint expressions must keep the same kind (zoom-only vs zoom+data) or MapLibre crashes. `lib/mapController.ts` = map lifecycle, data loading per area, popups. `lib/data.ts` = data client/types.
- `components/`: `Explorer.tsx` (page shell, prefs in localStorage `pc-prefs`), `LayersPanel.tsx` (colour modes, place toggles, borders), `Legend.tsx`, `ColourKey.tsx` (always-visible key, top right), `DetailsPanel.tsx` + `PanelSections.tsx` (panel content), `AboutDialog.tsx`.
- Colour modes today: `colours` (4-colour graph colouring), `density`, `prices`, `urban` (only appears once official ONSPD is built), `outline`.
- A colour mode = a number on each region's GeoJSON properties (`pm` price, `ur` urban share) + a stops ramp + entry in `fillColour/fillBase` (mapLayers.ts) + LayersPanel option + ColourKey/Legend entry. Add new heat maps the same way. Palettes were validated with the `dataviz` skill (sequential single-hue ramp, grey = no data).

## State right now
- Done & deployed: all map levels, search, colour modes (colours/density/prices), Wales/country borders, councils, house prices (Land Registry, last 3 yrs, England & Wales), nearby postboxes/stations/bus stops/schools/GPs for SY/TF/WV/DY, "About this postcode" panel, quiz, mobile layout, always-visible colour key, "Built by Benjo @benjobuilds" credit linking to https://benjobuilds.com (bottom-left).
- Data caching: `vercel.json` now serves `/data/*` with `max-age=0, must-revalidate` (stale copies previously hid new data). Tell the user to hard-refresh if something looks stale.
- **Postcode data is still an unofficial copy** (`uk-address-lookup` npm package, `manifest.source.verified=false`), so the legend says "unofficial ONS copy".

## Next steps for the owner (not done)
1. **Run the GitHub Action** to rebuild from official ONSPD: GitHub → repo → Actions → "Build postcode data from official ONSPD" → Run workflow (branch `claude/epic-franklin-lv8rwq`, leave inputs default). ~10–30 min. It has **never been run against the real ONS download** — if "Download ONSPD" fails, he needs to paste the ONSPD zip link from the ONS Open Geography Portal into the `onspd_url` box. If the commit step fails: Settings → Actions → General → Workflow permissions → Read and write. This also activates the Urban/rural colour mode and "new postcode" badges.
2. Then hard-refresh the live site.

## Requested but NOT built yet: more heat-map filters
Owner asked: crime rate, population, "and more", in the same style as the house-price / density colouring. Suggested order, with honest caveats:
| Filter | Source | Notes |
|---|---|---|
| **Deprivation (IMD)** | Gov.uk English IMD 2019/2025 by LSOA; Welsh WIMD; Scottish SIMD | Easiest win; ONSPD gives each postcode's LSOA. Postcode → LSOA → rank, aggregate to district. Note ranks are per-nation, not comparable across borders. |
| **Population / age** | ONS Census 2021 via Nomis (LSOA or output area) | Nomis is blocked from the sandbox → build it as a step in the GitHub Action. Show population *and* density per km² (we already have areas). |
| **Crime rate** | data.police.uk street-level crime (monthly CSV, OGL), per LSOA, divide by census population | Blocked from sandbox → Action step. Caveats to show in the UI: counts are by *where recorded*, city centres inflate rates (use per-resident rate and say so), police.uk excludes Scotland/NI/Greater Manchester gaps at times. |
| **Broadband** | Ofcom Connected Nations (needs free API key; store as a GitHub secret) | Per postcode; aggregate median speed or % gigabit. |
| **Flood risk** | Environment Agency (E), NRW (Wales) | Polygon data → point-in-polygon per postcode; heavier. |
| **EPC / energy rating, council tax band, % owner-occupied, average age** | EPC register (free API key), Census 2021 | Later. |
| **Price change %** | Already have price-by-year in `prices.json` | Cheap: add a "price growth since 2023" mode. |
Implementation pattern: new `pipeline/<thing>.mjs` that writes `raw/derived/<thing>.json`; merge into region props in `build.mjs` (see `mapProps`); add quantile stops like `priceStops` (prices use quantiles of district medians so each colour band holds a similar number of districts); extend `ColourMode`, `LayersPanel`, `ColourKey`, panel section in `PanelSections.tsx`, About dialog + `docs/DATA_SOURCES.md` (licence + caveats). Wire the new step into `.github/workflows/build-data.yml`.
Recommend telling the user to allow-list the missing hosts (Settings → environment network) *or* running fetch steps in the Action, since the sandbox can't download census/crime/broadband data.

## Licensing watch-outs (important for his Heartpost business)
- Land Registry price data's postcodes derive from Royal Mail data: **commercial use may need a Royal Mail licence.** Fine for this free map; flag before reusing in a paid product.
- OSM/Overture places are ODbL / CDLA — attribution is in the About dialog.
- Northern Ireland postcodes are deliberately excluded (different licence terms).
- Boundaries are *approximate* (Voronoi from points), clearly labelled as such. Don't claim they're official.

## Known untested / caveats
- Official-ONSPD Action run (above); postcodes.io-powered "About this postcode" fields (deprivation etc.) live; Streets/Bright/Dark basemap styles visually (tiles blocked in sandbox).
- Price coverage: medians from <5 sales hidden, <20 flagged; Scotland/NI grey.
- Places data (postbox times, GPs) is volunteer/business-listing data, can be incomplete; official NHS/DfE/NaPTAN lists would be better.
