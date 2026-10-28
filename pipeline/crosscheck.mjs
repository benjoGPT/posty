// Cross-checks the postcode dataset against independent sources.
//
//   npm run data:crosscheck -- --source onspd --input raw/ONSPD_FEB_2026_UK.csv
//
// Sources (downloaded once into raw/crosscheck/):
//  1. postcodes.io test seed: real ONSPD rows (live and terminated) from the
//     postcodes.io database, used by its test suite. Checks that live postcodes
//     are present with identical coordinates and terminated ones are absent.
//  2. dwyl/uk-postcodes-latitude-longitude-complete-csv: an independently
//     compiled list of UK postcode coordinates (October 2017). Checks agreement
//     of positions for postcodes present in both.
//  3. missinglink/uk-postcode-polygons: postcode district outlines from
//     Wikipedia. An independent estimate of district boundaries to compare our
//     approximate boundaries with.
//
// Writes docs/ACCURACY_REPORT.md with the measured results.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
import { normalisePostcode, splitPostcode } from './lib/postcode.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'raw/crosscheck');
const DATA = path.join(ROOT, 'public/data');
const GH = 'https://raw.githubusercontent.com';
const SOURCES = {
  seed: `${GH}/ideal-postcodes/postcodes.io/master/test/seed/seed.sql.gz`,
  dwyl: `${GH}/dwyl/uk-postcodes-latitude-longitude-complete-csv/master/ukpostcodes.csv.zip`,
  wiki: (area) => `${GH}/missinglink/uk-postcode-polygons/master/geojson/${area}.geojson`,
};

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), []),
);

async function cached(name, url) {
  const p = path.join(CACHE, name);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  return p;
}

// --- geometry helpers --------------------------------------------------------
const R = 6371008.8;
function metres(lat1, lng1, lat2, lng2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeom(pt, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}
function bbox(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
}
function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(2)}%` : 'n/a');
const fmt = (n) => n.toLocaleString('en-GB');
const m = (v) => (Number.isFinite(v) ? `${v < 10 ? v.toFixed(1) : Math.round(v)} m` : 'n/a');

// --- load our dataset ---------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const detailAreas = manifest.coverage.detailAreas;
const ours = new Map(); // postcode -> [lat, lng]
const sourceId = args.source ?? manifest.source.id;
if (args.input) {
  const adapter = await import(`./sources/${sourceId}.mjs`);
  await adapter.load({
    input: args.input,
    onRecord(raw, lat, lng) {
      const pc = normalisePostcode(raw);
      if (pc) ours.set(pc, [lat, lng]);
    },
  });
} else {
  // Without the source file, compare the published detail areas only.
  for (const f of fs.readdirSync(path.join(DATA, 'units'))) {
    const { d, u } = JSON.parse(fs.readFileSync(path.join(DATA, 'units', f), 'utf8'));
    for (const [inward, lng, lat] of u) ours.set(`${d} ${inward}`, [lat, lng]);
  }
}
const national = Boolean(args.input);
console.log(`Our dataset: ${fmt(ours.size)} postcodes (${national ? 'national, from source' : `detail areas ${detailAreas.join(', ')}`})`);
const lines = [];
const summary = { generated: new Date().toISOString().slice(0, 10), scope: national ? 'national' : 'detail' };
const out = (s = '') => { lines.push(s); console.log(s); };

// --- 1. postcodes.io seed -----------------------------------------------------
{
  const sql = zlib.gunzipSync(fs.readFileSync(await cached('postcodesio-seed.sql.gz', SOURCES.seed))).toString('utf8').split('\n');
  const start = sql.findIndex((l) => l.startsWith('COPY public.postcodes '));
  let live = 0, liveFound = 0, term = 0, termAbsent = 0;
  const diffs = [];
  const missing = [];
  for (let i = start + 1; i < sql.length && sql[i] !== '\\.'; i++) {
    const c = sql[i].split('\t');
    const pc = normalisePostcode(c[0]);
    if (!pc || c[7] === '\\N' || pc.startsWith('BT')) continue;
    if (!national && !detailAreas.includes(splitPostcode(pc).area)) continue;
    if (c[4] === '\\N') {
      live++;
      const o = ours.get(pc);
      if (o) { liveFound++; diffs.push(metres(o[0], o[1], +c[7], +c[8])); } else missing.push(pc);
    } else {
      term++;
      if (!ours.has(pc)) termAbsent++;
    }
  }
  diffs.sort((a, b) => a - b);
  let newest = '';
  for (let i = start + 1; i < sql.length && sql[i] !== '\\.'; i++) { const d = sql[i].split('\t')[3]; if (/^\d{6}$/.test(d) && d > newest) newest = d; }
  summary.seed = { live, liveFound, identical: diffs.filter((d) => d < 1).length, terminated: term, terminatedAbsent: termAbsent, seedNewestIntroduction: newest };
  out('## 1. Official ONSPD rows from the postcodes.io database (test seed)');
  out();
  if (!live && !term) out('No overlapping postcodes in the compared areas (the seed is mostly Aberdeen, AB). Run with `--input` for a national comparison.');
  else {
    out(`| Check | Result |`);
    out(`|---|---|`);
    out(`| Live postcodes in seed | ${fmt(live)} |`);
    out(`| … present in our data | ${fmt(liveFound)} (${pct(liveFound, live)}) |`);
    out(`| … identical position (< 1 m) | ${fmt(diffs.filter((d) => d < 1).length)} (${pct(diffs.filter((d) => d < 1).length, diffs.length)}) |`);
    out(`| … median / max position difference | ${m(percentile(diffs, 50))} / ${m(diffs[diffs.length - 1])} |`);
    out(`| Terminated postcodes in seed | ${fmt(term)} |`);
    out(`| … correctly absent from our live data | ${fmt(termAbsent)} (${pct(termAbsent, term)}) |`);
    if (missing.length) out(`\nLive in the seed but not in our data (likely terminated after the seed was made): ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? '…' : ''}`);
  }
  out();
}

// --- 2. dwyl coordinates (October 2017) -------------------------------------------
{
  const zip = await cached('dwyl-ukpostcodes.csv.zip', SOURCES.dwyl);
  const csv = execFileSync('unzip', ['-p', zip], { maxBuffer: 1 << 30 }).toString('utf8').split('\n');
  const byArea = new Map();
  const add = (key, d) => { if (!byArea.has(key)) byArea.set(key, { both: 0, onlyTheirs: 0, diffs: [], worst: [] }); const s = byArea.get(key); if (d === null) s.onlyTheirs++; else { s.both++; s.diffs.push(d.dist); s.worst.push(d); } };
  const seen = new Set();
  for (const line of csv.slice(1)) {
    const [, raw, la, ln] = line.split(',');
    const pc = raw && normalisePostcode(raw);
    const lat = +la, lng = +ln;
    if (!pc || !Number.isFinite(lat) || lat > 90 || pc.startsWith('BT')) continue;
    const area = splitPostcode(pc).area;
    if (!national && !detailAreas.includes(area)) continue;
    seen.add(pc);
    const o = ours.get(pc);
    const entry = o ? { pc, dist: metres(o[0], o[1], lat, lng) } : null;
    add(detailAreas.includes(area) ? area : 'Rest of GB', entry);
  }
  const onlyOurs = new Map();
  for (const pc of ours.keys()) {
    if (seen.has(pc) || pc.startsWith('BT')) continue;
    const a = splitPostcode(pc).area;
    const k = detailAreas.includes(a) ? a : 'Rest of GB';
    onlyOurs.set(k, (onlyOurs.get(k) ?? 0) + 1);
  }
  out('## 2. Independent coordinate list (dwyl, October 2017)');
  out();
  out('| Area | In both | Only in 2017 list | Only in ours | Median diff | 95th pct | > 100 m | > 1 km |');
  out('|---|---|---|---|---|---|---|---|');
  const worstAll = [];
  for (const [k, s] of [...byArea].sort(([a], [b]) => (a === 'Rest of GB' ? 1 : b === 'Rest of GB' ? -1 : a.localeCompare(b)))) {
    s.diffs.sort((a, b) => a - b);
    out(`| ${k} | ${fmt(s.both)} | ${fmt(s.onlyTheirs)} | ${fmt(onlyOurs.get(k) ?? 0)} | ${m(percentile(s.diffs, 50))} | ${m(percentile(s.diffs, 95))} | ${fmt(s.diffs.filter((d) => d > 100).length)} (${pct(s.diffs.filter((d) => d > 100).length, s.both)}) | ${fmt(s.diffs.filter((d) => d > 1000).length)} |`);
    if (k !== 'Rest of GB') worstAll.push(...s.worst);
  }
  worstAll.sort((a, b) => b.dist - a.dist);
  summary.dwyl = Object.fromEntries([...byArea].map(([k, st]) => [k, { both: st.both, medianM: +percentile(st.diffs, 50).toFixed(1), p95M: Math.round(percentile(st.diffs, 95)), over100m: st.diffs.filter((d) => d > 100).length }]));
  out();
  out(`Largest differences in the detail areas: ${worstAll.slice(0, 10).map((w) => `${w.pc} (${m(w.dist)})`).join(', ')}`);
  out();
}

// --- 3. Wikipedia district outlines -------------------------------------------------
{
  out('## 3. District boundaries vs Wikipedia outlines');
  out();
  summary.wiki = {};
  out('| Area | Postcode points inside own district: ours | … Wikipedia | Land area where both agree on the district |');
  out('|---|---|---|---|');
  for (const area of detailAreas) {
    const wiki = JSON.parse(fs.readFileSync(await cached(`wiki-${area}.geojson`, SOURCES.wiki(area)), 'utf8')).features
      .map((f) => ({ c: String(f.properties.name).toUpperCase().replace(/\s+/g, ''), g: f.geometry, b: bbox(f.geometry) }));
    const oursFc = JSON.parse(fs.readFileSync(path.join(DATA, 'districts', `${area}.geojson`), 'utf8')).features
      .filter((f) => !f.properties.label).map((f) => ({ c: f.properties.c, g: f.geometry, b: f.properties.b }));
    const locate = (list, pt) => list.find((f) => pt[0] >= f.b[0] && pt[0] <= f.b[2] && pt[1] >= f.b[1] && pt[1] <= f.b[3] && inGeom(pt, f.g))?.c ?? null;

    let pts = 0, inOurs = 0, inWiki = 0;
    for (const f of fs.readdirSync(path.join(DATA, 'units')).filter((x) => splitPostcode(`${x.replace('.json', '')} 1AA`).area === area)) {
      const { d, u } = JSON.parse(fs.readFileSync(path.join(DATA, 'units', f), 'utf8'));
      const og = oursFc.find((x) => x.c === d), wg = wiki.find((x) => x.c === d);
      for (const [, lng, lat] of u) {
        pts++;
        if (og && inGeom([lng, lat], og.g)) inOurs++;
        if (wg && inGeom([lng, lat], wg.g)) inWiki++;
      }
    }
    // Area agreement on a ~300 m grid over the area.
    const b = oursFc.reduce((a, f) => [Math.min(a[0], f.b[0]), Math.min(a[1], f.b[1]), Math.max(a[2], f.b[2]), Math.max(a[3], f.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const dLat = 300 / 111_320, dLng = 300 / (111_320 * Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180));
    let both = 0, agree = 0;
    for (let y = b[1]; y <= b[3]; y += dLat) for (let x = b[0]; x <= b[2]; x += dLng) {
      const a = locate(oursFc, [x, y]);
      if (!a) continue;
      const w = locate(wiki, [x, y]);
      if (!w) continue;
      both++;
      if (a === w) agree++;
    }
    out(`| ${area} | ${pct(inOurs, pts)} | ${pct(inWiki, pts)} | ${pct(agree, both)} |`);
    summary.wiki[area] = { pointsInOwnOurs: +((100 * inOurs) / pts).toFixed(2), pointsInOwnWikipedia: +((100 * inWiki) / pts).toFixed(2), landAgreement: +((100 * agree) / both).toFixed(2) };
  }
  out();
}

const report = [
  '# Accuracy report (generated)',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run data:crosscheck\` for: ${manifest.source.release}. See docs/ACCURACY.md for how to read it.`,
  '',
  ...lines,
].join('\n');
fs.writeFileSync(path.join(ROOT, 'docs/ACCURACY_REPORT.md'), report + '\n');
fs.writeFileSync(path.join(DATA, 'crosscheck.json'), JSON.stringify(summary));
console.log('Wrote docs/ACCURACY_REPORT.md');
