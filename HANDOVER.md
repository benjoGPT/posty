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

## Expansion implemented 28 October 2026

The previously requested heat maps are implemented. See the dated continuation below and docs/DATA_SOURCES.md. EPC and planning have importers and honest unavailable notices, but need permitted exports before values can appear. Do not treat the historical network restrictions above as current: Nomis, Ofcom, Police.uk and ONS sources were downloaded successfully during this continuation.

## Licensing watch-outs (important for his Heartpost business)
- Land Registry price data's postcodes derive from Royal Mail data: **commercial use may need a Royal Mail licence.** Fine for this free map; flag before reusing in a paid product.
- OSM/Overture places are ODbL / CDLA — attribution is in the About dialog.
- Northern Ireland postcodes are deliberately excluded (different licence terms).
- Boundaries are *approximate* (Voronoi from points), clearly labelled as such. Don't claim they're official.

## Known untested / caveats
- Official-ONSPD Action run (above); postcodes.io-powered "About this postcode" fields (deprivation etc.) live; Streets/Bright/Dark basemap styles visually (tiles blocked in sandbox).
- Price coverage: medians from <5 sales hidden, <20 flagged; Scotland/NI grey.
- Places data (postbox times, GPs) is volunteer/business-listing data, can be incomplete; official NHS/DfE/NaPTAN lists would be better.

## Continuation: English deprivation and complete-year price change

Added `pipeline/insights.mjs` / `insights.py` and optional `public/data/insights.json`. Build runs after `data:build` in the existing Action. The main build writes ignored `raw/derived/current-postcodes.txt`; the official MHCLG IMD 2025 postcode join is filtered against it before aggregation. Client enrichment adds `im` (mean decile), `imn` (matched postcode count), `pg` (% median-sale change), `pgn` (two sale counts). Modes, always-visible key, details, legend and About were extended. IMD is English-only, postcode-weighted, with explicit cross-border caveats. Price change uses two complete years with >=20 sales each, currently 2024–2025, not the incomplete 2023 base suggested earlier. It is not individual property appreciation.

The original postcode-source warning is preserved. Population, recorded crime, broadband, access and flood overlays were added in the later continuation below. EPC still needs an authorised export. Do not substitute an IMD crime-domain score for recorded-crime rates.

Validation for this continuation: 7 tests pass, TypeScript passes, production static export passes, existing data verification passes. The managed preview launcher supplied Vite-style `--host` / `--strictPort` flags to Next.js and failed; the new controls have not been browser-verified in this environment. The new source matched 1,485,459 English postcode records against 1,745,685 current map-source records. The data provenance warning remains unchanged. No PR was created.


## Continuation: community layers, comparisons and grouped menu (28 October 2026)

Thirty new source-dated metrics: Census people/age, tenure, property types, overcrowding; Ofcom broadband availability; Police.uk recorded crime and trends; seven distances to mapped transport/services/green space. The colour picker is grouped by topic and shows definitions, periods and missing-data keys. Region details show collapsible topic groups. Compare pins two regions of the same level and shows new metrics alongside house prices, IMD and price change. New supermarkets/pharmacies/parks toggles and an England river/sea flood raster overlay are available. No addresses or house numbers were added.

`lib/metrics.ts` is the shared metric registry. Values load from `community.json` for areas/districts; `community/sectors/<area>.json` loads lazily beside geometry. Values attach as `mx_<id>` paint properties; missing values are grey. Keep zoom/data expression kinds stable. Original postcode source warning is preserved: official ONSPD was used only for statistical joins, not to rebuild the map.

Pipelines: `community.py` (Census, Ofcom, crime plus optional EPC/planning), `crime-coverage.py` (force-month coverage mask), `amenities.py` (OSM extras), `access.py` (median straight-line access), `shard-community.py` (lazy sectors). Python requirements in `pipeline/requirements-community.txt`. Run data:build first for current membership, then data:places, data:amenities, data:community. The existing Action does this; timeout 90 min, Python 3.12. The data step downloads a ~1.7 GB police archive, so allow time/disk.

Frozen source vintages: Census 2021, ONSPD August 2026 statistical join, Ofcom July 2025, police archive August 2026 (rolling 12 months plus prior 12). Police rows exclude BTP/NI; incomplete force histories mask affected regions, including Manchester and Gloucester. Rates use estimated 2021 residents, never current official postcode populations. Census totals are allocated by postcode shares, broadband is an unweighted mean of postcode availability percentages. Distances cover detail areas only, depend on incomplete mapped features and are not routing times. Flood is England river/sea only, zoom >=13, not surface-water/property-level advice.

EPC: `python3 pipeline/community.py --epc-csv /path/to/permitted.csv`, official uppercase column schema, latest certificate per property, last ten years, min ten matched homes. Planning: `--planning-csv` with reference,authority,postcode,submitted (ISO date), dedup authority/reference; last365days, observed matched counts only. Re-run access.py and shard-community.py after either import. Default imports do not retain previous optional EPC/planning values: supply exports again on every refresh. EPC official access needs GOV.UK One Login; national Planning Data application dataset had zero records when checked, so obtain council data. Neither is labelled live or complete.

Validation: npm test 12 pass (all 30 metric ramps in both themes validated against MapLibre schema), TypeScript passes, static export passes, geometry verification passes. Real Chrome live QA and deployment outcome are recorded below after publication. No PR requested or created.

Live Chrome validation after first deployment: rendered the recorded-crime map, searched SY1 and TF1, checked actual profile values, and compared all30 measures plus prices/IMD/growth. Browser found the options panel could exceed the viewport after a long definition: fixed with a scrollable desktop panel/sticky header, collapsible definitions, and hiding the colour key while options are open. Flood GetLegendGraphic returned image/png with CORS `*`; final overlay/menu smoke tests follow this fix. Vercel deployment of 91109ab succeeded.
