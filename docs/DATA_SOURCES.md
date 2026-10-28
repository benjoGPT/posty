# Data sources, licensing and limitations

## Summary

| What | Source | Licence | Used for |
|---|---|---|---|
| Postcode reference points | **ONS Postcode Directory (ONSPD)** | Open Government Licence v3.0 | Postcode dots, the area → district → sector → unit hierarchy, counts, approximate boundaries |
| Postcode lookups | [postcodes.io](https://postcodes.io) (built on ONSPD) | Service: MIT; data: OGL v3 | Search outside local coverage, terminated postcodes, administrative details |
| Coastline | OpenStreetMap via `@geo-maps/countries-land-100m` | ODbL 1.0 | Clipping approximate boundaries at the coast; offline fallback basemap |
| Basemap | [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema) | Data ODbL (© OpenStreetMap contributors); free, no key, commercial use allowed | Background map |
| Area names | Royal Mail postcode area names, hand-compiled (`pipeline/reference/postcode-areas.json`) | Factual list | Labels such as "SY · Shrewsbury" |
| Label fonts | Noto Sans (via `@fontsource/noto-sans`) | SIL OFL 1.1 | Self-hosted map label glyphs (`public/fonts`) |

## Why ONSPD

- Published quarterly by the Office for National Statistics; it is the reference
  dataset that postcodes.io and most open postcode tools are built on.
- One record per postcode unit with a WGS84 latitude/longitude, introduction and
  termination dates, and a positional quality indicator (`osgrdind`).
- Includes terminated postcodes, so live and terminated records can be separated
  (the pipeline keeps live postcodes only; terminated ones are resolved via
  postcodes.io in search).

**Required attribution** (shown in the app's map attribution and About dialog):

- Source: Office for National Statistics licensed under the Open Government Licence v.3.0
- Contains OS data © Crown copyright and database right [year]
- Contains Royal Mail data © Royal Mail copyright and database right [year]
- Contains GeoPlace data © Local Government Information House Limited copyright and database right [year]

OS **Code-Point Open** contains the same GB grid references (eastings/northings in
British National Grid) and is a valid alternative; ONSPD was preferred because it
already carries WGS84 coordinates, termination dates and quality flags. A
Code-Point Open adapter can be added in `pipeline/sources/`.

## Northern Ireland (BT)

ONSPD includes BT postcodes, but their location data comes from Land & Property
Services (LPS) and **commercial reuse requires a separate licence from LPS**. The
pipeline therefore excludes BT postcodes by default (`includeNorthernIreland:
false` in `pipeline/config.json`). Search still resolves BT postcodes through
postcodes.io. Only enable `--include-ni` after checking the current ONSPD user
guide and your use case.

## Boundaries are approximate — and why

There is no open, official dataset of postcode boundary polygons. OS
**Code-Point with Polygons** exists but is a paid product whose licence does not
permit open redistribution, so it is not used.

Instead, boundaries are **derived from the official reference points**
(`pipeline/lib/voronoi.mjs`):

1. Every postcode point gets a Voronoi cell: the land closer to it than to any
   other postcode point (computed in a metric transverse Mercator projection).
2. Cells are dissolved into sectors, districts and areas by walking the Delaunay
   triangulation and keeping only edges between points of different codes.
3. Small detached groups of points (≤ 3 reference points, e.g. PO boxes placed at
   a sorting office) are drawn as part of the shape surrounding them. The points
   themselves keep their real codes.
4. Shapes are clipped to the UK coastline (inland water is not removed) and
   simplified.

The app labels these as **approximate** everywhere they appear. Measured agreement
(`npm run data:verify`, Feb 2026 data, SY/TF/WV/DY): about **98.5 %** of postcode
points lie inside their own sector shape and **99.3 %** inside their own district
shape. The rest sit near edges, at shared reference points, or are absorbed
outliers.

## Postcode points are not addresses

A dot is the postcode's reference coordinate (roughly the centre of its delivery
points), not a building or boundary. Several postcodes can share one coordinate
(large users, PO boxes); the app lists all of them when you click such a point.

## Postal geography ≠ administrative geography

The app never derives a post town or county from postcode codes. Specifically:

- SY and TF postcodes extend well beyond Shropshire (SY covers much of mid-Wales;
  SY14 is in Cheshire), and parts of Shropshire use other areas (Bridgnorth is
  WV15/WV16, Cleobury Mortimer is DY14). That is why the Shropshire build includes
  WV and DY detail.
- Administrative details (local authority, county, ward, parish, constituency)
  come from postcodes.io and are labelled as administrative.
- **Royal Mail post towns are not in any open dataset** (they are part of PAF,
  which is licensed). The app says so instead of guessing.

## Coverage of the current build

- Areas and districts: all of Great Britain.
- Sectors and individual postcodes: the areas in `detailAreas` (default
  `SY, TF, WV, DY`). Elsewhere the map keeps showing districts when zoomed in and
  shows a notice; search works UK-wide via postcodes.io.

## Data used for the committed build

See `public/data/manifest.json` → `source`. If `verified` is `false`, the build was
made from a non-official copy (the `uk-address-lookup` npm package, which states it
bundles ONSPD Feb 2026 but has an anonymous publisher and no source repository).
The app shows a warning banner in that case. Rebuild from the official ONSPD
download (see the README) before relying on the data.
