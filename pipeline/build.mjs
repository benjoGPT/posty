// Postcode data pipeline.
//
//   npm run data:build -- --source onspd --input ./raw/ONSPD_FEB_2026_UK.csv
//
// Reads a postcode point dataset, derives the area/district/sector/unit
// hierarchy, builds approximate boundaries (see lib/voronoi.mjs) and writes
// static, chunked files that the web app loads on demand:
//
//   public/data/manifest.json          build metadata, sources, attribution, coverage
//   public/data/index.json             every area and district (bbox, label point, counts)
//   public/data/areas.geojson          national postcode area boundaries + label points
//   public/data/districts/<AREA>.geojson  district boundaries + labels, one file per area
//   public/data/sectors/<AREA>.geojson    sector boundaries + labels (detail areas only)
//   public/data/units/<DISTRICT>.json     postcode unit reference points (detail areas only)
//   public/data/land.geojson           simplified UK outline for the offline fallback basemap
//
// Options (defaults in pipeline/config.json):
//   --source onspd|uk-address-lookup   input adapter (onspd is the official source)
//   --input <path>                     source file or directory
//   --detail SY,TF,...|all             areas that get sector + unit detail
//   --include-ni                       include BT postcodes (see docs/DATA_SOURCES.md before enabling)
//   --out <dir>                        output directory (default public/data)

import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { normalisePostcode, splitPostcode, compareCodes } from './lib/postcode.mjs';
import { absorbFragments, buildSites, triangulate, dissolve, toLngLat } from './lib/voronoi.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'pipeline/config.json'), 'utf8'));
const areaNames = JSON.parse(fs.readFileSync(path.join(ROOT, 'pipeline/reference/postcode-areas.json'), 'utf8')).areas;
const LAND = path.join(ROOT, 'pipeline/reference/uk-land.geojson');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const sourceId = args.source ?? 'onspd';
const outDir = path.resolve(args.out ?? path.join(ROOT, 'public/data'));
const includeNI = Boolean(args['include-ni'] ?? config.includeNorthernIreland);
const detailArg = args.detail ?? config.detailAreas.join(',');
const detailAll = detailArg === 'all';
const detailSet = new Set(detailAll ? [] : String(detailArg).toUpperCase().split(',').map((s) => s.trim()).filter(Boolean));
const isDetail = (area) => detailAll || detailSet.has(area);

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`);

// ---------------------------------------------------------------------------
// 1. Load records
// ---------------------------------------------------------------------------
const adapter = await import(`./sources/${sourceId}.mjs`).catch(() => {
  throw new Error(`Unknown --source "${sourceId}". Available: ${fs.readdirSync(path.join(ROOT, 'pipeline/sources')).map((f) => f.replace('.mjs', '')).join(', ')}`);
});

const pcs = [];
const lngList = [];
const latList = [];
const qualityList = [];
const seen = new Set();
const skipped = { invalid: 0, duplicate: 0, northernIreland: 0 };

log(`Loading ${sourceId} from ${args.input ?? '(default)'}`);
const { stats: sourceStats, meta: sourceMeta } = await adapter.load({
  input: args.input,
  onRecord(raw, lat, lng, extra) {
    const pc = normalisePostcode(raw);
    if (!pc) { skipped.invalid++; return; }
    if (seen.has(pc)) { skipped.duplicate++; return; }
    if (!includeNI && pc.startsWith('BT')) { skipped.northernIreland++; return; }
    seen.add(pc);
    pcs.push(pc);
    lngList.push(lng);
    latList.push(lat);
    qualityList.push(extra?.quality ?? null);
  },
});
seen.clear();
log(`Loaded ${pcs.length.toLocaleString()} live postcodes with coordinates (${JSON.stringify({ ...sourceStats, ...skipped })})`);

// ---------------------------------------------------------------------------
// 2. Hierarchy
// ---------------------------------------------------------------------------
const sectorIds = new Map();
const sectorCodes = [];
const sectorDistrictCode = [];
const recordSector = new Int32Array(pcs.length);
for (let i = 0; i < pcs.length; i++) {
  const { sector, district } = splitPostcode(pcs[i]);
  let id = sectorIds.get(sector);
  if (id === undefined) {
    id = sectorCodes.length;
    sectorIds.set(sector, id);
    sectorCodes.push(sector);
    sectorDistrictCode.push(district);
  }
  recordSector[i] = id;
}
const districtCodes = [...new Set(sectorDistrictCode)].sort(compareCodes);
const districtIds = new Map(districtCodes.map((c, i) => [c, i]));
const districtArea = districtCodes.map((d) => d.match(/^[A-Z]+/)[0]);
const areaCodes = [...new Set(districtArea)].sort(compareCodes);
const areaIds = new Map(areaCodes.map((c, i) => [c, i]));
const sectorDistrict = Int32Array.from(sectorDistrictCode, (d) => districtIds.get(d));
const districtAreaId = Int32Array.from(districtArea, (a) => areaIds.get(a));
log(`${areaCodes.length} areas, ${districtCodes.length} districts, ${sectorCodes.length} sectors`);

const missingNames = areaCodes.filter((a) => !areaNames[a]);
if (missingNames.length) console.warn(`  ! No reference name for areas: ${missingNames.join(', ')}`);

// Postcode counts and point extents per code (fallbacks when a polygon is lost to coastline clipping).
const lngs = Float64Array.from(lngList);
const lats = Float64Array.from(latList);
lngList.length = latList.length = 0;
const countSector = new Int32Array(sectorCodes.length);
const countDistrict = new Int32Array(districtCodes.length);
const countArea = new Int32Array(areaCodes.length);
const sectorsPerDistrict = new Int32Array(districtCodes.length);
const districtsPerArea = new Int32Array(areaCodes.length);
for (let s = 0; s < sectorCodes.length; s++) sectorsPerDistrict[sectorDistrict[s]]++;
for (let d = 0; d < districtCodes.length; d++) districtsPerArea[districtAreaId[d]]++;
const pointBox = (n) => Array.from({ length: n }, () => [Infinity, Infinity, -Infinity, -Infinity]);
const boxDistrict = pointBox(districtCodes.length);
const boxArea = pointBox(areaCodes.length);
const boxSector = pointBox(sectorCodes.length);
const extend = (b, lng, lat) => {
  if (lng < b[0]) b[0] = lng;
  if (lat < b[1]) b[1] = lat;
  if (lng > b[2]) b[2] = lng;
  if (lat > b[3]) b[3] = lat;
};
for (let i = 0; i < pcs.length; i++) {
  const s = recordSector[i];
  const d = sectorDistrict[s];
  const a = districtAreaId[d];
  countSector[s]++; countDistrict[d]++; countArea[a]++;
  extend(boxSector[s], lngs[i], lats[i]);
  extend(boxDistrict[d], lngs[i], lats[i]);
  extend(boxArea[a], lngs[i], lats[i]);
}

// ---------------------------------------------------------------------------
// 3. Voronoi + dissolve
// ---------------------------------------------------------------------------
const sites = buildSites(lngs, lats, recordSector);
log(`${sites.x.length.toLocaleString()} distinct reference points (${sites.mixed} shared by more than one sector)`);
const tri = triangulate(sites.x, sites.y);
log(`Triangulated (${(tri.delaunay.triangles.length / 3).toLocaleString()} triangles)`);

// Fragments are absorbed at sector level; districts and areas are derived
// from the cleaned sectors so the three levels still nest exactly.
const { codes: siteSector, absorbed } = absorbFragments(tri, sites.sector, config.absorbFragmentsUpTo);
log(`Absorbed ${absorbed.toLocaleString()} outlying reference points into surrounding boundaries`);
const siteArea = Int32Array.from(siteSector, (s) => districtAreaId[sectorDistrict[s]]);
const siteDistrict = Int32Array.from(siteSector, (s) => sectorDistrict[s]);
const siteSectorDetail = Int32Array.from(siteSector, (s, i) => (isDetail(areaCodes[siteArea[i]]) ? s : -1));

const levels = {};
for (const [name, siteCode, n] of [
  ['areas', siteArea, areaCodes.length],
  ['districts', siteDistrict, districtCodes.length],
  ['sectors', siteSectorDetail, sectorCodes.length],
]) {
  const { polygons, brokenRings } = dissolve(tri, siteCode, n);
  levels[name] = polygons;
  log(`Dissolved ${name}${brokenRings ? ` (${brokenRings} unclosed rings dropped)` : ''}`);
}

// ---------------------------------------------------------------------------
// 4. Clip to the coastline, simplify, compute labels (mapshaper)
// ---------------------------------------------------------------------------
const land = JSON.parse(fs.readFileSync(LAND, 'utf8'));
if (!includeNI) {
  // Without BT postcodes, Northern Ireland's land would be claimed by the
  // nearest Scottish postcodes. Drop land parts whose centre lies in NI.
  const inNI = ([lng, lat]) => lng > -8.3 && lng < -5.35 && lat > 53.95 && lat < 55.4;
  const centre = (ring) => ring.reduce((s, [x, y]) => [s[0] + x / ring.length, s[1] + y / ring.length], [0, 0]);
  for (const f of land.features) {
    f.geometry.coordinates = f.geometry.coordinates.filter((poly) => !inNI(centre(poly[0])));
  }
}

async function finish(features, interval) {
  const out = await mapshaper.applyCommands(
    [
      '-i polys.json',
      '-clip land.json',
      `-simplify interval=${interval} keep-shapes`,
      '-each "b=this.bounds.map(v => Math.round(v * 1e5) / 1e5), km2=Math.round(this.area / 1e4) / 100"',
      '-points inner + name=labels',
      '-o format=geojson precision=0.00001 target=*',
    ].join(' '),
    { 'polys.json': { type: 'FeatureCollection', features }, 'land.json': land },
  );
  const polygons = JSON.parse(out['polys.json']).features;
  const lost = polygons.filter((f) => !f.geometry).map((f) => f.properties.c);
  if (lost.length) console.warn(`  ! ${lost.length} shapes have no land area after coastline clipping (kept in the index with a point-based extent): ${lost.join(', ')}`);
  return {
    polygons: polygons.filter((f) => f.geometry),
    labels: JSON.parse(out['labels.json']).features.filter((f) => f.geometry),
  };
}

function features(polygons, codes, props, include = () => true) {
  const out = [];
  polygons.forEach((p, i) => {
    if (p && p.length && include(i)) out.push({ type: 'Feature', properties: { c: codes[i], ...props(i) }, geometry: toLngLat(p) });
  });
  return out;
}

const areasOut = await finish(
  features(levels.areas, areaCodes, (i) => ({ name: areaNames[areaCodes[i]] ?? null, n: countArea[i], nd: districtsPerArea[i] })),
  config.simplifyMetres.areas,
);
log(`Areas: ${areasOut.polygons.length} polygons`);
const districtsOut = await finish(
  features(levels.districts, districtCodes, (i) => ({ a: districtArea[i], n: countDistrict[i], ns: sectorsPerDistrict[i] })),
  config.simplifyMetres.districts,
);
log(`Districts: ${districtsOut.polygons.length} polygons`);
const sectorsOut = await finish(
  features(
    levels.sectors,
    sectorCodes,
    (i) => ({ d: sectorDistrictCode[i], a: districtArea[sectorDistrict[i]], n: countSector[i] }),
    (i) => isDetail(districtArea[sectorDistrict[i]]),
  ),
  config.simplifyMetres.sectors,
);
log(`Sectors: ${sectorsOut.polygons.length} polygons`);

// ---------------------------------------------------------------------------
// 5. Write output
// ---------------------------------------------------------------------------
for (const sub of ['districts', 'sectors', 'units']) fs.rmSync(path.join(outDir, sub), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const writeJson = (rel, data) => {
  const p = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
};
const labelFeature = (f) => ({
  type: 'Feature',
  properties: { c: f.properties.c, n: f.properties.n, ...(f.properties.name ? { name: f.properties.name } : {}), label: true },
  geometry: f.geometry,
});
const byCode = (list) => new Map(list.map((f) => [f.properties.c, f]));
const roundPt = (p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
const finiteBox = (b) => b.map((v) => Math.round(v * 1e5) / 1e5);

writeJson('areas.geojson', { type: 'FeatureCollection', features: [...areasOut.polygons, ...areasOut.labels.map(labelFeature)] });

const groupByArea = (list, key) => {
  const g = new Map();
  for (const f of list) {
    const a = f.properties[key];
    if (!g.has(a)) g.set(a, []);
    g.get(a).push(f);
  }
  return g;
};
for (const [area, polys] of groupByArea(districtsOut.polygons, 'a')) {
  const labels = districtsOut.labels.filter((f) => f.properties.a === area).map(labelFeature);
  writeJson(`districts/${area}.geojson`, { type: 'FeatureCollection', features: [...polys, ...labels] });
}
for (const [area, polys] of groupByArea(sectorsOut.polygons, 'a')) {
  const labels = sectorsOut.labels.filter((f) => f.properties.a === area).map(labelFeature);
  writeJson(`sectors/${area}.geojson`, { type: 'FeatureCollection', features: [...polys, ...labels] });
}

// Units: one compact file per district: [inward code, lng, lat, (positional quality)]
const unitsByDistrict = new Map();
for (let i = 0; i < pcs.length; i++) {
  const d = sectorDistrict[recordSector[i]];
  if (!isDetail(districtArea[d])) continue;
  if (!unitsByDistrict.has(d)) unitsByDistrict.set(d, []);
  unitsByDistrict.get(d).push(i);
}
let unitCount = 0;
for (const [d, list] of unitsByDistrict) {
  list.sort((a, b) => compareCodes(pcs[a], pcs[b]));
  const rows = list.map((i) => {
    const row = [pcs[i].split(' ')[1], lngs[i], lats[i]];
    if (qualityList[i] !== null) row.push(qualityList[i]);
    return row;
  });
  unitCount += rows.length;
  writeJson(`units/${districtCodes[d]}.json`, { d: districtCodes[d], u: rows });
}

const areaPoly = byCode(areasOut.polygons), areaLabel = byCode(areasOut.labels);
const distPoly = byCode(districtsOut.polygons), distLabel = byCode(districtsOut.labels);
const meanPoint = (box) => roundPt([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
writeJson('index.json', {
  areas: areaCodes.map((c, i) => ({
    c,
    name: areaNames[c] ?? null,
    n: countArea[i],
    nd: districtsPerArea[i],
    km2: areaPoly.get(c)?.properties.km2 ?? null,
    b: areaPoly.get(c)?.properties.b ?? finiteBox(boxArea[i]),
    l: areaLabel.get(c)?.geometry.coordinates ?? meanPoint(boxArea[i]),
    detail: isDetail(c),
  })),
  districts: districtCodes.map((c, i) => ({
    c,
    n: countDistrict[i],
    ns: sectorsPerDistrict[i],
    km2: distPoly.get(c)?.properties.km2 ?? null,
    b: distPoly.get(c)?.properties.b ?? finiteBox(boxDistrict[i]),
    l: distLabel.get(c)?.geometry.coordinates ?? meanPoint(boxDistrict[i]),
  })),
});

// Simplified land outline for the fallback basemap.
const landOut = await mapshaper.applyCommands(
  `-i land.json -simplify interval=${config.simplifyMetres.land} keep-shapes -o format=geojson precision=0.0001`,
  { 'land.json': land },
);
fs.writeFileSync(path.join(outDir, 'land.geojson'), landOut['land.json']);

const detailAreas = areaCodes.filter(isDetail);
writeJson('manifest.json', {
  schema: 1,
  generatedAt: new Date().toISOString(),
  source: sourceMeta,
  boundaries: {
    method: 'voronoi-dissolve',
    description:
      'Boundaries are approximations derived from postcode reference points: each postcode is given the land closer to its reference point than to any other, and those cells are merged into sectors, districts and areas, then clipped to the coastline. Small detached groups of outlying points (up to ' + config.absorbFragmentsUpTo + ') are drawn as part of the shape around them. They are not official Royal Mail or Ordnance Survey boundaries.',
    coastline: 'OpenStreetMap contributors via @geo-maps/countries-land-100m (ODbL 1.0), ~100 m resolution',
    absorbedOutliers: absorbed,
    absorbFragmentsUpTo: config.absorbFragmentsUpTo,
    simplifyMetres: config.simplifyMetres,
  },
  coverage: {
    outline: 'all',
    detailAreas,
    includesNorthernIreland: includeNI,
    note: includeNI
      ? null
      : 'Northern Ireland (BT) postcodes are excluded from the map because their reuse terms differ (see docs). Search still resolves them via postcodes.io.',
  },
  counts: {
    postcodes: pcs.length,
    areas: areaCodes.length,
    districts: districtCodes.length,
    sectors: sectorCodes.length,
    detailPostcodes: unitCount,
    detailSectors: sectorsOut.polygons.length,
    sharedReferencePoints: sites.mixed,
    skipped: { ...sourceStats, ...skipped },
  },
});

log(`Done. Detail areas: ${detailAreas.join(', ') || 'none'} (${unitCount.toLocaleString()} postcodes). Output: ${path.relative(ROOT, outDir)}`);
