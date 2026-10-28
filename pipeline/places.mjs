// Nearby places from Overture Maps (https://overturemaps.org), for the detail areas.
//
//   npm run data:places          (run after data:build)
//
// Reads only the parts of Overture's GeoParquet files that overlap the detail
// areas (HTTP range requests against the public S3 bucket) and writes
// public/data/places/<AREA>.json plus public/data/places/meta.json:
//   postboxes  OpenStreetMap post boxes, with Royal Mail reference and collection times where mapped
//   stops      OpenStreetMap bus stops
//   stations   OpenStreetMap railway and bus stations
//   schools    OpenStreetMap school/college grounds, with phase from the mapped education level
//   gps        GP surgeries from Overture places (high-confidence entries with practice-like names)
//
// Licences: base theme (OpenStreetMap) ODbL 1.0 — © OpenStreetMap contributors;
// places theme CDLA Permissive 2.0 — © Overture Maps Foundation.
import fs from 'node:fs';
import path from 'node:path';
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { polygonIndex } from './lib/pip.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'public/data');
const BUCKET = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';

const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const detail = index.areas.filter((a) => a.detail);
if (!detail.length) throw new Error('No detail areas in public/data/index.json — run npm run data:build first.');
const BOX = detail.reduce((b, a) => [Math.min(b[0], a.b[0]), Math.min(b[1], a.b[1]), Math.max(b[2], a.b[2]), Math.max(b[3], a.b[3])], [180, 90, -180, -90]);

const areaFeatures = JSON.parse(fs.readFileSync(path.join(DATA, 'areas.geojson'), 'utf8')).features.filter((f) => !f.properties.label && f.properties.c && detail.some((a) => a.c === f.properties.c));
const areaAt = polygonIndex(areaFeatures);

async function listKeys(prefix, delimiter) {
  const keys = [];
  const prefixes = [];
  let token = '';
  do {
    const url = `${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}${delimiter ? '&delimiter=/' : ''}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const xml = await (await fetch(url)).text();
    keys.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]));
    prefixes.push(...[...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]).filter((p) => p !== prefix));
    token = /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? '';
  } while (token);
  return { keys, prefixes };
}

/** Rows of one Overture type whose bbox overlaps BOX, reading only matching row groups. */
async function readType(release, theme, type, columns, keep) {
  const { keys } = await listKeys(`release/${release}/theme=${theme}/type=${type}/`);
  const out = [];
  for (const key of keys.filter((k) => k.endsWith('.parquet'))) {
    const file = await asyncBufferFromUrl({ url: `${BUCKET}/${key}` });
    const md = await parquetMetadataAsync(file);
    const col = Object.fromEntries(md.row_groups[0].columns.map((c, i) => [c.meta_data.path_in_schema.join('.'), i]));
    const stat = (g, k) => md.row_groups[g].columns[col[k]].meta_data.statistics;
    let rowStart = 0;
    for (let g = 0; g < md.row_groups.length; g++) {
      const n = Number(md.row_groups[g].num_rows);
      const overlaps = !(stat(g, 'bbox.xmin').min_value > BOX[2] || stat(g, 'bbox.xmax').max_value < BOX[0] || stat(g, 'bbox.ymin').min_value > BOX[3] || stat(g, 'bbox.ymax').max_value < BOX[1]);
      if (overlaps) {
        const rows = await parquetReadObjects({ file, metadata: md, columns: [...columns, 'bbox'], rowStart, rowEnd: rowStart + n, compressors });
        for (const r of rows) {
          const b = r.bbox;
          const x = (b.xmin + b.xmax) / 2, y = (b.ymin + b.ymax) / 2;
          if (x < BOX[0] || x > BOX[2] || y < BOX[1] || y > BOX[3]) continue;
          if (keep(r)) out.push({ ...r, x, y });
        }
      }
      rowStart += n;
    }
  }
  console.log(`  ${theme}/${type}: ${out.length.toLocaleString()} features`);
  return out;
}

const tags = (r) => (r.source_tags instanceof Map ? Object.fromEntries(r.source_tags) : r.source_tags ?? {});
const nameOf = (r) => r.names?.primary ?? null;
const round = (v) => Math.round(v * 1e5) / 1e5;

const { prefixes } = await listKeys('release/', true);
const release = prefixes.map((p) => p.replace(/^release\/|\/$/g, '')).sort().at(-1);
console.log(`Overture release ${release}; area ${BOX.map((v) => v.toFixed(2)).join(', ')}`);

const infra = await readType(release, 'base', 'infrastructure', ['class', 'names', 'source_tags'], (r) => ['post_box', 'bus_stop', 'railway_station', 'bus_station'].includes(r.class));
const landUse = await readType(release, 'base', 'land_use', ['class', 'names', 'source_tags'], (r) => ['school', 'college', 'university'].includes(r.class) && nameOf(r));
// GP surgeries are spread across several Overture categories, alongside many
// lookalikes (dental surgeries, tree surgeons, private clinics), so match on
// GP-style names within the medical categories and exclude the lookalikes.
const GP_CATEGORIES = new Set(['primary_care_or_general_clinic', 'diagnostics_imaging_or_lab_service', 'outpatient_care_facility', 'medical_service', 'hospital']);
const GP_NAME = /\b(surgery|medical (practice|centre|center|group)|health ?cent(re|er)|family practice)\b/i;
const NOT_GP = /dental|dentist|vet|veterinar|eye|optic|physio|chiropod|podiat|herbal|aesthetic|cosmetic|hair|pharmac|hearing|osteopath|counsel|private|bariatric|weight|tree|foot|reporting|motor|therapy|imaging|scan|x-ray|laborator|cosmetic|plastic|laser|skin|vein|ivf|fertility/i;
const gpsRaw = await readType(release, 'places', 'place', ['basic_category', 'names', 'confidence', 'operating_status'], (r) =>
  GP_CATEGORIES.has(r.basic_category) && r.confidence >= 0.7 && (r.operating_status ?? 'open') === 'open' && GP_NAME.test(nameOf(r) ?? '') && !NOT_GP.test(nameOf(r)));

function phase(r) {
  if (r.class === 'university') return 'university';
  if (r.class === 'college') return 'college';
  const isced = String(tags(r)['isced:level'] ?? '');
  const name = nameOf(r);
  // Welsh: "Ysgol Gynradd" = primary school, "Ysgol Uwchradd" = secondary school.
  const primary = /(^|;)\s*1/.test(isced) || /primary|infant|junior|first school|c\.?e\.? school|gynradd/i.test(name);
  const secondary = /(^|;)\s*[23]/.test(isced) || /secondary|high school|academy|grammar|college|upper school|uwchradd/i.test(name);
  return primary && secondary ? 'all-through' : primary ? 'primary' : secondary ? 'secondary' : 'school';
}

const byArea = new Map(detail.map((a) => [a.c, { postboxes: [], stops: [], stations: [], schools: [], gps: [] }]));
const place = (r, kind, row) => {
  const i = areaAt(r.x, r.y);
  if (i < 0) return;
  byArea.get(areaFeatures[i].properties.c)[kind].push([round(r.x), round(r.y), ...row]);
};
for (const r of infra) {
  const t = tags(r);
  if (r.class === 'post_box') place(r, 'postboxes', [t.ref ?? null, t.collection_times ?? null]);
  else if (r.class === 'bus_stop') place(r, 'stops', [nameOf(r)]);
  else {
    if (['funicular', 'miniature'].includes(t.station) || t.railway === 'miniature') continue;
    // Heritage/tourist railways are kept but labelled, so they're not mistaken for National Rail.
    const heritage = t.usage === 'tourism' || t.heritage || t['railway:preserved'] === 'yes' || /heritage|preserv|steam|light railway|tramway/i.test(`${t.operator ?? ''} ${t.network ?? ''}`);
    place(r, 'stations', [nameOf(r), r.class === 'bus_station' ? 'bus' : heritage ? 'heritage' : 'rail']);
  }
}
// One point per school name (OSM often maps several grounds for one school).
const seenSchool = new Set();
for (const r of landUse) {
  const key = `${nameOf(r)}|${Math.round(r.x * 200)}|${Math.round(r.y * 200)}`;
  if (seenSchool.has(key)) continue;
  seenSchool.add(key);
  place(r, 'schools', [nameOf(r), phase(r)]);
}
// The same practice often appears several times (e.g. "Craven Arms Surgery" and
// "Craven Arms Medical Practice"); keep one per name and per ~100 m spot.
const seenGp = new Set();
for (const r of gpsRaw.sort((a, b) => b.confidence - a.confidence)) {
  const spot = `${Math.round(r.x * 1000)}|${Math.round(r.y * 1000)}`;
  if (seenGp.has(spot)) continue;
  seenGp.add(spot);
  const key = nameOf(r).toLowerCase();
  if (seenGp.has(key)) continue;
  seenGp.add(key);
  place(r, 'gps', [nameOf(r)]);
}

const dir = path.join(DATA, 'places');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const counts = { postboxes: 0, stops: 0, stations: 0, schools: 0, gps: 0 };
for (const [area, sets] of byArea) {
  for (const k of Object.keys(counts)) counts[k] += sets[k].length;
  fs.writeFileSync(path.join(dir, `${area}.json`), JSON.stringify(sets));
}
fs.writeFileSync(
  path.join(dir, 'meta.json'),
  JSON.stringify({
    source: `Overture Maps Foundation, release ${release}`,
    areas: detail.map((a) => a.c),
    counts,
    attribution: '© OpenStreetMap contributors (ODbL), © Overture Maps Foundation',
    notes: {
      postboxes: 'OpenStreetMap post boxes; references and collection times only where volunteers have mapped them.',
      schools: 'OpenStreetMap school grounds; phase from the mapped education level or the name.',
      gps: 'GP surgeries from Overture places (business listings), filtered to high-confidence practices. May be incomplete.',
    },
    generated: new Date().toISOString(),
  }),
);
console.log(`Wrote places for ${byArea.size} areas: ${Object.entries(counts).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', ')}`);
