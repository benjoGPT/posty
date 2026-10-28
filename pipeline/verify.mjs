// Sanity-checks a built dataset in public/data:
//  - every file referenced by the index exists and parses
//  - postcode counts agree between index, chunks and manifest
//  - unit coordinates fall inside the UK
//  - how often a postcode's reference point lies inside its own approximate
//    sector / district boundary (it will not always: boundaries are simplified,
//    clipped to a 100 m coastline, and points shared by several sectors are
//    assigned to the majority sector)
// Run: npm run data:verify
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'public/data');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

const manifest = read('manifest.json');
const index = read('index.json');
const UNIT_RE = /^[0-9][A-Z]{2}$/;
const UK = [-8.7, 49.8, 1.8, 60.9];

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeometry(pt, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}

check(index.areas.reduce((s, a) => s + a.n, 0) === manifest.counts.postcodes, 'area counts do not sum to manifest total');
check(index.districts.reduce((s, d) => s + d.n, 0) === manifest.counts.postcodes, 'district counts do not sum to manifest total');

let units = 0, inSector = 0, inDistrict = 0, outsideUK = 0;
for (const area of index.areas.filter((a) => a.detail)) {
  const sectors = read(`sectors/${area.c}.geojson`).features.filter((f) => !f.properties.label);
  const districts = read(`districts/${area.c}.geojson`).features.filter((f) => !f.properties.label);
  const sectorGeom = new Map(sectors.map((f) => [f.properties.c, f.geometry]));
  const districtGeom = new Map(districts.map((f) => [f.properties.c, f.geometry]));
  for (const d of index.districts.filter((x) => x.c.match(/^[A-Z]+/)[0] === area.c)) {
    const file = `units/${d.c}.json`;
    check(fs.existsSync(path.join(dir, file)), `missing ${file}`);
    if (!fs.existsSync(path.join(dir, file))) continue;
    const { u } = read(file);
    check(u.length === d.n, `${d.c}: index says ${d.n} postcodes, file has ${u.length}`);
    for (const [inward, lng, lat] of u) {
      units++;
      check(UNIT_RE.test(inward), `${d.c} ${inward}: malformed inward code`);
      if (lng < UK[0] || lng > UK[2] || lat < UK[1] || lat > UK[3]) outsideUK++;
      const sg = sectorGeom.get(`${d.c} ${inward[0]}`);
      if (sg && inGeometry([lng, lat], sg)) inSector++;
      const dg = districtGeom.get(d.c);
      if (dg && inGeometry([lng, lat], dg)) inDistrict++;
    }
  }
}
check(units === manifest.counts.detailPostcodes, `unit files hold ${units} postcodes, manifest says ${manifest.counts.detailPostcodes}`);
check(outsideUK === 0, `${outsideUK} postcode points outside the UK bounding box`);

const pct = (n) => `${((100 * n) / Math.max(units, 1)).toFixed(2)}%`;
console.log(`Source: ${manifest.source.name} — ${manifest.source.release}${manifest.source.verified ? '' : ' (UNVERIFIED SOURCE)'}`);
console.log(`Postcodes: ${manifest.counts.postcodes.toLocaleString()} (${manifest.counts.areas} areas, ${manifest.counts.districts} districts, ${manifest.counts.sectors} sectors)`);
console.log(`Detail areas: ${manifest.coverage.detailAreas.join(', ')} — ${units.toLocaleString()} postcode points checked`);
console.log(`  inside own approximate sector boundary:   ${pct(inSector)}`);
console.log(`  inside own approximate district boundary: ${pct(inDistrict)}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 50)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('All checks passed.');
