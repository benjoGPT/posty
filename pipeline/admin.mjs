// Builds the administrative reference layers (run once, or when upgrading):
//   npm run data:admin
//
// Outputs (committed, small):
//   pipeline/reference/councils.geojson         council polygons (ONS LAD 2021, ultra-generalised)
//   pipeline/reference/country-borders.geojson  England–Wales and England–Scotland land borders
//
// Sources (downloaded into raw/reference/ if missing):
//   - ONS Local Authority Districts (December 2021, UK, BUC) as TopoJSON,
//     published by the ONS data visualisation team: github.com/ONSvisual/topojson_boundaries
//   - ONS Local Authority Districts 2013 (GB, generalised) via github.com/martinjc/UK-GeoJSON,
//     used only for the national borders, which are far more detailed there and
//     have not changed since.
// Both: Source: Office for National Statistics licensed under the Open
// Government Licence v.3.0. Contains OS data © Crown copyright and database right.
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'raw/reference');
const REF = path.join(ROOT, 'pipeline/reference');
const GH = 'https://raw.githubusercontent.com';
const SOURCES = {
  lad2021: [`${GH}/ONSvisual/topojson_boundaries/master/geogLA2021UK.json`, 'geogLA2021UK.json'],
  lad2013: [`${GH}/martinjc/UK-GeoJSON/master/json/administrative/gb/lad.json`, 'martinjc-gb-lad.json'],
};

async function fetchOnce([url, name]) {
  const p = path.join(RAW, name);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(RAW, { recursive: true });
    console.log(`Downloading ${url}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  return fs.readFileSync(p, 'utf8');
}

const COUNTRY = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };

// 1. Councils (2021 codes and names).
{
  const topo = JSON.parse(await fetchOnce(SOURCES.lad2021));
  const out = await mapshaper.applyCommands(
    `-i lad.json -each "c=AREACD, name=AREANM, ctry=${JSON.stringify(COUNTRY).replace(/"/g, "'")}[AREACD[0]], delete AREACD, delete AREANM" -o format=geojson precision=0.0001 councils.json`,
    { 'lad.json': topo },
  );
  fs.writeFileSync(path.join(REF, 'councils.geojson'), out['councils.json']);
  console.log(`councils.geojson: ${JSON.parse(out['councils.json']).features.length} councils`);
}

// 2. National land borders, from the more detailed 2013 boundaries.
{
  const lad = JSON.parse(await fetchOnce(SOURCES.lad2013));
  const out = await mapshaper.applyCommands(
    '-i lad.json -each "ctry=LAD13CD[0]" -dissolve ctry -innerlines -simplify interval=15 -o format=geojson precision=0.00001 borders.json',
    { 'lad.json': lad },
  );
  const raw = JSON.parse(out['borders.json']);
  // Lines without attributes come back as a bare GeometryCollection.
  const geoms = raw.features ? raw.features.map((f) => f.geometry) : raw.geometries;
  const fc = { type: 'FeatureCollection', features: geoms.map((geometry) => ({ type: 'Feature', properties: { kind: 'country' }, geometry })) };
  fs.writeFileSync(path.join(REF, 'country-borders.geojson'), JSON.stringify(fc));
  console.log(`country-borders.geojson: ${fc.features.length} line features`);
}
