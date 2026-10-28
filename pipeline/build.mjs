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
import { adjacency, colourGraph } from './lib/colour.mjs';
import { polygonIndex } from './lib/pip.mjs';
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
const ladList = [];
const introList = [];
const urbanList = [];
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
    ladList.push(extra?.lad ?? null);
    introList.push(extra?.intro ?? null);
    urbanList.push(extra?.urban ?? null);
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
// 2b. Administrative breakdown: which councils and countries each postcode
//     area/district covers. ONSPD carries each postcode's council code, which
//     is exact; otherwise postcodes are placed in generalised ONS council
//     boundaries (accurate except within a few hundred metres of a border).
// ---------------------------------------------------------------------------
const councils = JSON.parse(fs.readFileSync(path.join(ROOT, 'pipeline/reference/councils.geojson'), 'utf8')).features;
const councilName = new Map(councils.map((f) => [f.properties.c, f.properties.name]));
// Councils created after the 2021 boundaries (April 2023 reorganisation).
for (const [c, n] of Object.entries({ E06000063: 'Cumberland', E06000064: 'Westmorland and Furness', E06000065: 'North Yorkshire', E06000066: 'Somerset' })) {
  if (!councilName.has(c)) councilName.set(c, n);
}
const COUNTRY = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };
const locateCouncil = polygonIndex(councils);
const recordCouncil = new Array(pcs.length).fill(null);
let adminExact = 0, adminLocated = 0;
for (let i = 0; i < pcs.length; i++) {
  const code = ladList[i];
  if (code && /^[EWSN]0\d{7}$/.test(code)) { recordCouncil[i] = code; adminExact++; continue; }
  const idx = locateCouncil(lngs[i], lats[i]);
  if (idx >= 0) { recordCouncil[i] = councils[idx].properties.c; adminLocated++; }
}
const adminMethod = adminExact > adminLocated ? 'onspd' : 'boundaries';
log(`Councils: ${fmtPct(adminExact)} from ONSPD codes, ${fmtPct(adminLocated)} from boundaries, ${fmtPct(pcs.length - adminExact - adminLocated)} unplaced`);
function fmtPct(n) { return `${((100 * n) / pcs.length).toFixed(1)}%`; }

function tallyBy(groupOf, nGroups) {
  const councilsT = Array.from({ length: nGroups }, () => new Map());
  for (let i = 0; i < pcs.length; i++) {
    const c = recordCouncil[i];
    if (!c) continue;
    const t = councilsT[groupOf(i)];
    t.set(c, (t.get(c) ?? 0) + 1);
  }
  return councilsT.map((t) => {
    const countries = new Map();
    for (const [c, n] of t) countries.set(COUNTRY[c[0]], (countries.get(COUNTRY[c[0]]) ?? 0) + n);
    const sorted = [...t].sort((a, b) => b[1] - a[1]);
    return {
      councils: sorted.slice(0, 10).map(([c, n]) => [councilName.get(c) ?? c, n]),
      countries: [...countries].sort((a, b) => b[1] - a[1]),
    };
  });
}
const adminArea = tallyBy((i) => districtAreaId[sectorDistrict[recordSector[i]]], areaCodes.length);
const adminDistrict = tallyBy((i) => sectorDistrict[recordSector[i]], districtCodes.length);

// ---------------------------------------------------------------------------
// 2c. Optional enrichments
//   - house prices from raw/derived/prices.json (npm run data:prices)
//   - urban/rural mix and recently introduced postcodes, when the source
//     (official ONSPD) carries those fields
// ---------------------------------------------------------------------------
const pricesPath = path.join(ROOT, 'raw/derived/prices.json');
const prices = fs.existsSync(pricesPath) ? JSON.parse(fs.readFileSync(pricesPath, 'utf8')) : null;
if (prices) log(`House prices: ${prices.meta.source}, ${prices.meta.from36}–${prices.meta.latestMonth}`);
const priceOf = (code) => prices?.groups[code] ?? null;
// Medians from very few sales are noise: no map colour below this many sales (36 months).
const MIN_PRICE_SALES = 5;
// Colour steps at quantiles of district medians, so each band holds a similar
// number of districts (a fixed scale would put most of the country in 2–3 bands).
let priceStops = null;
if (prices) {
  const meds = Object.entries(prices.groups)
    .filter(([c, g]) => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(c) && g.n36 >= 20 && g.m36)
    .map(([, g]) => g.m36)
    .sort((a, b) => a - b);
  const q = (p) => Math.round(meds[Math.min(meds.length - 1, Math.floor(p * meds.length))] / 5000) * 5000;
  priceStops = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95].map(q);
  log(`Price colour steps (district medians, 5th–95th percentile): ${priceStops.map((v) => `£${v / 1000}k`).join(', ')}`);
}

const hasUrban = urbanList.some((u) => u !== null);
const latestIntro = introList.reduce((m, v) => (v && v > m ? v : m), 0);
// "New" = introduced in the 24 months up to the newest postcode in the release.
const newSince = latestIntro ? latestIntro - 200 : Infinity;
function extrasBy(groupOf, nGroups) {
  const urban = new Int32Array(nGroups), known = new Int32Array(nGroups), fresh = new Int32Array(nGroups);
  for (let i = 0; i < pcs.length; i++) {
    const g = groupOf(i);
    if (urbanList[i] !== null) { known[g]++; if (urbanList[i]) urban[g]++; }
    if (introList[i] && introList[i] > newSince) fresh[g]++;
  }
  return (g) => ({
    ...(hasUrban && known[g] ? { ur: Math.round((100 * urban[g]) / known[g]) / 100 } : {}),
    ...(latestIntro ? { nw: fresh[g] } : {}),
  });
}
const extrasArea = extrasBy((i) => districtAreaId[sectorDistrict[recordSector[i]]], areaCodes.length);
const extrasDistrict = extrasBy((i) => sectorDistrict[recordSector[i]], districtCodes.length);
const extrasSector = extrasBy((i) => recordSector[i], sectorCodes.length);
if (hasUrban || latestIntro) log(`Extras: urban/rural ${hasUrban ? 'yes' : 'no'}, introduction dates ${latestIntro ? `yes (new = after ${newSince})` : 'no'}`);

/** Small properties used for map colouring: median price (36 months) and urban share. */
const mapProps = (code, extras) => {
  const pp = priceOf(code);
  return { ...(pp?.m36 && pp.n36 >= MIN_PRICE_SALES ? { pm: pp.m36 } : {}), ...(extras.ur !== undefined ? { ur: extras.ur } : {}) };
};

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

// Map colours: neighbouring regions get different colours (colour index `k`).
const colourOf = {};
for (const [name, siteCode, n] of [
  ['areas', siteArea, areaCodes.length],
  ['districts', siteDistrict, districtCodes.length],
  ['sectors', siteSector, sectorCodes.length],
]) {
  const { colours, clashes, clashShare } = colourGraph(n, adjacency(tri, siteCode), config.mapColours);
  colourOf[name] = colours;
  log(`Coloured ${name} with ${config.mapColours} colours (${clashes} regions touch a same-coloured neighbour; ${(clashShare * 100).toFixed(2)}% of shared border)`);
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

async function finish(features, interval, precision = 0.00001) {
  const out = await mapshaper.applyCommands(
    [
      '-i polys.json',
      '-clip land.json',
      `-simplify interval=${interval} keep-shapes`,
      '-each "b=this.bounds.map(v => Math.round(v * 1e5) / 1e5), km2=Math.round(this.area / 1e4) / 100"',
      '-points inner + name=labels',
      `-o format=geojson precision=${precision} target=*`,
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
  features(levels.areas, areaCodes, (i) => ({ name: areaNames[areaCodes[i]] ?? null, n: countArea[i], nd: districtsPerArea[i], k: colourOf.areas[i], ...mapProps(areaCodes[i], extrasArea(i)) })),
  config.simplifyMetres.areas,
  0.0001,
);
log(`Areas: ${areasOut.polygons.length} polygons`);
const districtsOut = await finish(
  features(levels.districts, districtCodes, (i) => ({ a: districtArea[i], n: countDistrict[i], ns: sectorsPerDistrict[i], k: colourOf.districts[i], ...mapProps(districtCodes[i], extrasDistrict(i)) })),
  config.simplifyMetres.districts,
  0.0001,
);
log(`Districts: ${districtsOut.polygons.length} polygons`);
const sectorsOut = await finish(
  features(
    levels.sectors,
    sectorCodes,
    (i) => ({ d: sectorDistrictCode[i], a: districtArea[sectorDistrict[i]], n: countSector[i], k: colourOf.sectors[i], ...mapProps(sectorCodes[i], extrasSector(i)), ...(priceOf(sectorCodes[i]) ? { pp: priceOf(sectorCodes[i]) } : {}), ...extrasSector(i) }),
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

// Units: one compact file per district: [inward code, lng, lat, (positional quality)],
// plus optional per-postcode extras keyed by inward code: house sales `p`
// ([sales in 36 months, median price]) and introduction month `i` (YYYYMM).
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
  const extras = {};
  const p = {}, intro = {};
  for (const i of list) {
    const inward = pcs[i].split(' ')[1];
    const sold = prices?.units[pcs[i]];
    if (sold) p[inward] = sold;
    if (introList[i]) intro[inward] = introList[i];
  }
  if (Object.keys(p).length) extras.p = p;
  if (Object.keys(intro).length) extras.i = intro;
  writeJson(`units/${districtCodes[d]}.json`, { d: districtCodes[d], u: rows, ...extras });
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
    adm: adminArea[i],
    ...(priceOf(c) ? { pp: priceOf(c) } : {}),
    ...extrasArea(i),
  })),
  districts: districtCodes.map((c, i) => ({
    c,
    n: countDistrict[i],
    ns: sectorsPerDistrict[i],
    km2: distPoly.get(c)?.properties.km2 ?? null,
    b: distPoly.get(c)?.properties.b ?? finiteBox(boxDistrict[i]),
    l: distLabel.get(c)?.geometry.coordinates ?? meanPoint(boxDistrict[i]),
    adm: { ...adminDistrict[i], councils: adminDistrict[i].councils.slice(0, 6) },
    ...(priceOf(c) ? { pp: priceOf(c) } : {}),
    ...extrasDistrict(i),
  })),
});

// Simplified land outline for the fallback basemap.
const landOut = await mapshaper.applyCommands(
  `-i land.json -simplify interval=${config.simplifyMetres.land} keep-shapes -o format=geojson precision=0.0001`,
  { 'land.json': land },
);
fs.writeFileSync(path.join(outDir, 'land.geojson'), landOut['land.json']);

// Borders overlay: council boundaries (lines between councils), council name
// points and the national land borders.
{
  const councilFc = { type: 'FeatureCollection', features: councils };
  const out = await mapshaper.applyCommands(
    ['-i councils.json', '-innerlines + name=lines', '-target councils', '-points inner + name=labels', '-o format=geojson precision=0.0001 target=lines,labels'].join(' '),
    { 'councils.json': councilFc },
  );
  const linesRaw = JSON.parse(out['lines.json']);
  const lineGeoms = linesRaw.features ? linesRaw.features.map((f) => f.geometry) : linesRaw.geometries;
  const borders = JSON.parse(fs.readFileSync(path.join(ROOT, 'pipeline/reference/country-borders.geojson'), 'utf8')).features;
  writeJson('borders.geojson', { type: 'FeatureCollection', features: borders });
  writeJson('councils.geojson', {
    type: 'FeatureCollection',
    features: [
      ...lineGeoms.map((geometry) => ({ type: 'Feature', properties: { kind: 'council' }, geometry })),
      ...JSON.parse(out['labels.json']).features.map((f) => ({ type: 'Feature', properties: { kind: 'council-label', name: f.properties.name }, geometry: f.geometry })),
    ],
  });
}

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
  admin: {
    method: adminMethod,
    councils: 'ONS Local Authority Districts (December 2021), ultra-generalised; April 2023 changes in Cumbria, North Yorkshire and Somerset not shown on the map',
    borders: 'National borders from ONS Local Authority Districts (2013, generalised)',
    attribution: 'Source: Office for National Statistics licensed under the Open Government Licence v.3.0. Contains OS data © Crown copyright and database right',
  },
  prices: prices ? { ...prices.meta, stops: priceStops, minSales: MIN_PRICE_SALES } : null,
  extras: { urbanRural: hasUrban, introduced: latestIntro ? { newSince, latest: latestIntro } : null },
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
