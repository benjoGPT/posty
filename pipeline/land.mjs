// Extracts the United Kingdom land polygon from @geo-maps/countries-land-100m
// (OpenStreetMap-derived, ODbL) into pipeline/reference/uk-land.geojson.
// Approximate postcode boundaries are clipped to this so they stop at the coast.
// Run once (or when upgrading the coastline): npm run data:land
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = path.resolve('pipeline/reference/uk-land.geojson');

let src;
try {
  src = require.resolve('@geo-maps/countries-land-100m/map.geo.json');
} catch {
  console.error('Missing @geo-maps/countries-land-100m. Run `npm install` first.');
  process.exit(1);
}

const world = JSON.parse(fs.readFileSync(src, 'utf8'));
const uk = world.features.filter((f) => f.properties?.A3 === 'GBR');
if (uk.length !== 1) throw new Error(`Expected one GBR feature, found ${uk.length}`);

// Round to 5 decimal places (~1 m), plenty for a 100 m resolution coastline.
const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(5), +c[1].toFixed(5)] : c.map(round));
// Keep exterior rings only. The source cuts out inland water (rivers, lakes,
// meres) as holes; postcode geography covers those, and at 100 m resolution
// the holes turn into spurious straight-edged gaps in the boundaries.
const g = uk[0].geometry;
const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const feature = {
  type: 'Feature',
  properties: {
    name: 'United Kingdom',
    source: '@geo-maps/countries-land-100m 0.6.0 (OpenStreetMap contributors, ODbL 1.0), inland water holes removed',
  },
  geometry: { type: 'MultiPolygon', coordinates: polygons.map((p) => [round(p[0])]) },
};
fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features: [feature] }));
console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
