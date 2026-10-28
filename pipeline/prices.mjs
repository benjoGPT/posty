// House prices from HM Land Registry Price Paid Data (England and Wales).
//
//   npm run data:prices
//
// Downloads the yearly Price Paid files covering the last three years into
// raw/prices/ (once), and writes raw/derived/prices.json with:
//   - per postcode: number of sales and median price (last 36 months)
//   - per sector / district / area: median price and sales for the last 12
//     and 36 months, by property type, and the median for each year
// `npm run data:build` merges it into the published data when present.
//
// Only standard sales (PPD category A) are used; repossessions, buy-to-lets
// bought by companies and other "additional price paid" entries are excluded.
//
// Licence: Contains HM Land Registry data © Crown copyright and database right,
// licensed under the Open Government Licence v3.0. Land Registry notes the
// address fields (including postcodes) are derived from Royal Mail data; their
// commercial use needs a licence from Royal Mail.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { normalisePostcode, splitPostcode } from './lib/postcode.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'raw/prices');
const OUT = path.join(ROOT, 'raw/derived/prices.json');
const BASE = 'https://s3.eu-west-1.amazonaws.com/prod2.publicdata.landregistry.gov.uk';
const TYPES = { D: 'detached', S: 'semi', T: 'terraced', F: 'flat' };

async function download(year) {
  const p = path.join(RAW, `pp-${year}.csv`);
  const head = await fetch(`${BASE}/pp-${year}.csv`, { method: 'HEAD' });
  if (!head.ok) return null;
  const size = Number(head.headers.get('content-length'));
  if (fs.existsSync(p) && fs.statSync(p).size === size) return p;
  fs.mkdirSync(RAW, { recursive: true });
  console.log(`Downloading pp-${year}.csv (${(size / 1e6).toFixed(0)} MB)`);
  const r = await fetch(`${BASE}/pp-${year}.csv`);
  if (!r.ok || !r.body) throw new Error(`Download failed: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(p));
  return p;
}

function parseLine(line) {
  // Fields are all double-quoted with no embedded quotes in practice; split defensively.
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1);
      out.push(line.slice(i + 1, end));
      i = end + 2;
    } else {
      const end = line.indexOf(',', i);
      out.push(line.slice(i, end === -1 ? undefined : end));
      i = end === -1 ? line.length : end + 1;
    }
  }
  return out;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = Float64Array.from(xs).sort();
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

const thisYear = new Date().getUTCFullYear();
const files = [];
for (let y = thisYear - 3; y <= thisYear; y++) {
  const p = await download(y);
  if (p) files.push({ year: y, path: p });
}
if (!files.length) throw new Error('No Price Paid files could be downloaded.');

// Pass 1: read sales (price, yyyymm, type, postcode).
const sales = [];
let latest = 0;
let skipped = 0;
for (const { path: p } of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(p), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const f = parseLine(line);
    // 0 id, 1 price, 2 date, 3 postcode, 4 type, 5 new build, 6 tenure, ..., 14 PPD category, 15 record status
    if (f[14] !== 'A' || f[15] === 'D') { skipped++; continue; }
    const pc = normalisePostcode(f[3]);
    const price = Number(f[1]);
    if (!pc || !(price > 0)) { skipped++; continue; }
    const ym = Number(f[2].slice(0, 4)) * 100 + Number(f[2].slice(5, 7));
    if (ym > latest) latest = ym;
    sales.push({ pc, price, ym, type: f[4] });
  }
  console.log(`Read ${path.basename(p)} (${sales.length.toLocaleString()} sales so far)`);
}

const monthsBefore = (ym, n) => {
  let y = Math.floor(ym / 100), m = (ym % 100) - n;
  while (m <= 0) { m += 12; y--; }
  return y * 100 + m;
};
const from12 = monthsBefore(latest, 11);
const from36 = monthsBefore(latest, 35);

// Pass 2: aggregate.
const units = new Map();
const groups = new Map();
const group = (code) => {
  let g = groups.get(code);
  if (!g) groups.set(code, (g = { p12: [], p36: [], byType: {}, byYear: {} }));
  return g;
};
for (const s of sales) {
  if (s.ym < from36) continue;
  const { area, district, sector } = splitPostcode(s.pc);
  if (!units.has(s.pc)) units.set(s.pc, []);
  units.get(s.pc).push(s.price);
  for (const code of [area, district, sector]) {
    const g = group(code);
    g.p36.push(s.price);
    if (s.ym >= from12) g.p12.push(s.price);
    if (TYPES[s.type]) (g.byType[s.type] ??= []).push(s.price);
    (g.byYear[Math.floor(s.ym / 100)] ??= []).push(s.price);
  }
}

const out = {
  meta: {
    source: 'HM Land Registry Price Paid Data',
    licence: 'Open Government Licence v3.0',
    attribution: 'Contains HM Land Registry data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.',
    note: 'Standard sales only (PPD category A). England and Wales only.',
    latestMonth: latest,
    from12,
    from36,
    files: files.map((f) => path.basename(f.path)),
    generated: new Date().toISOString(),
  },
  units: Object.fromEntries([...units].map(([pc, ps]) => [pc, [ps.length, median(ps)]])),
  groups: Object.fromEntries(
    [...groups].map(([code, g]) => [
      code,
      {
        n12: g.p12.length,
        m12: median(g.p12),
        n36: g.p36.length,
        m36: median(g.p36),
        type: Object.fromEntries(Object.entries(g.byType).map(([t, ps]) => [t, [ps.length, median(ps)]])),
        year: Object.fromEntries(Object.entries(g.byYear).map(([y, ps]) => [y, [ps.length, median(ps)]])),
      },
    ]),
  ),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${units.size.toLocaleString()} postcodes, ${groups.size.toLocaleString()} areas/districts/sectors; window ${from36}–${latest}; skipped ${skipped.toLocaleString()} non-standard rows`);
