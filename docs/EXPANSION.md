# Expanding beyond Shropshire

Nothing in the app is specific to Shropshire. The region is a configuration
choice in two places:

| Setting | File | Effect |
|---|---|---|
| `detailAreas` | `pipeline/config.json` (or `--detail`) | Which postcode areas get sector boundaries and individual postcode points |
| `homeRegion` | `config/app.ts` | Where the map opens and where the Home button returns |

Areas and districts are always built for the whole of Great Britain.

## Add more areas

```bash
npm run data:build -- --source onspd --input raw/ONSPD_FEB_2026_UK.csv --detail SY,TF,WV,DY,HR,LD,CW
npm run data:verify
```

## Build the whole country

```bash
npm run data:build -- --source onspd --input raw/ONSPD_FEB_2026_UK.csv --detail all
```

Measured on the full dataset (~1.75M GB postcodes) the pipeline runs in about
20 seconds and needs ~3 GB of RAM. Rough output sizes for `--detail all`:

- ~2,900 `units/<DISTRICT>.json` files, ~45 MB in total (~15 MB gzipped)
- ~120 `sectors/<AREA>.geojson` files, ~30–40 MB in total
- districts and areas unchanged (~9 MB)

The app loads only the files for what's on screen, so browser cost doesn't grow
with coverage. Limits in `lib/mapController.ts` (`MAX_UNIT_DISTRICTS`,
`MAX_DISTRICT_AREAS`) stop very wide views from loading too much.

## Hosting a national build

The output is plain static files, which any CDN serves well. For a national
build, keep the data out of git:

1. Upload `public/data/` to object storage with a CDN (Cloudflare R2, S3 +
   CloudFront, Bunny, etc.) with `Content-Type: application/json`, gzip/brotli
   compression and a long cache lifetime (version the folder, e.g. `/data/2026-02/`).
2. Set `NEXT_PUBLIC_DATA_BASE_URL=https://your-cdn/data/2026-02` at build time.
3. Allow CORS (`GET` from your site's origin) on the bucket.

## When to move to vector tiles

The chunked GeoJSON approach was chosen because the data splits naturally along
the postcode hierarchy, the pipeline is pure Node (no native tools such as
tippecanoe), and hosting needs nothing but static files. If you later need, say,
every postcode point visible at regional zoom levels, generate PMTiles with
tippecanoe from the same pipeline output and swap the GeoJSON sources in
`lib/mapLayers.ts` for a vector source. The search, levels and panels don't
depend on how the geometry is delivered.

## Updating the data (quarterly ONSPD releases)

1. Download the new ONSPD release (README → "Get the official data").
2. Re-run `npm run data:build` and `npm run data:verify`.
3. Check the log for warnings (areas without a name in
   `pipeline/reference/postcode-areas.json`, unclosed rings, lost shapes).
4. Commit or upload `public/data/`. The manifest records the release name and
   build date, and the app shows them in the details panel.
