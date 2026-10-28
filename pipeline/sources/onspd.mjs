// Adapter for the ONS Postcode Directory (ONSPD), the recommended source.
// Accepts either the single UK CSV (Data/ONSPD_<MON>_<YEAR>_UK.csv) or the
// Data/multi_csv directory from the official download. Column names are
// matched by header so minor schema changes between releases are tolerated.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export const id = 'onspd';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function pickColumn(header, candidates, required = true) {
  for (const c of candidates) {
    const i = header.findIndex((h) => (c instanceof RegExp ? c.test(h) : h === c));
    if (i >= 0) return i;
  }
  if (required) throw new Error(`ONSPD: none of the columns ${candidates.join(', ')} found in header`);
  return -1;
}

function csvFiles(input) {
  const stat = fs.statSync(input);
  if (stat.isFile()) return [input];
  return fs.readdirSync(input).filter((f) => f.toLowerCase().endsWith('.csv')).sort().map((f) => path.join(input, f));
}

/** Guesses a human-readable release name such as "ONSPD February 2026" from the file name. */
function releaseFromName(input) {
  const months = { JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April', MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August', SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December' };
  const m = /ONSPD_([A-Z]{3})_(\d{4})/i.exec(input);
  return m && months[m[1].toUpperCase()] ? `ONSPD ${months[m[1].toUpperCase()]} ${m[2]}` : 'ONSPD';
}

/**
 * Streams ONSPD rows and calls onRecord(pc, lat, lng, extra) for each live
 * postcode with a usable grid reference. Returns import statistics.
 */
export async function load({ input, onRecord }) {
  if (!input) throw new Error('ONSPD source needs --input <ONSPD csv file or multi_csv directory>');
  const stats = { rows: 0, terminated: 0, noLocation: 0 };
  for (const file of csvFiles(input)) {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    let cols = null;
    for await (const line of rl) {
      if (!line) continue;
      const f = parseCsvLine(line);
      if (!cols) {
        const h = f.map((x) => x.trim().toLowerCase());
        cols = {
          pc: pickColumn(h, ['pcds', 'pcd', 'pcd7', 'pcd8']),
          lat: pickColumn(h, ['lat']),
          lng: pickColumn(h, ['long', 'lng', 'lon']),
          doterm: pickColumn(h, ['doterm']),
          grid: pickColumn(h, ['osgrdind', 'gridind'], false),
          ctry: pickColumn(h, [/^ctry(\d\dcd)?$/], false),
          lad: pickColumn(h, ['oslaua', /^lad\d\dcd$/], false),
        };
        continue;
      }
      stats.rows++;
      if (f[cols.doterm]?.trim()) { stats.terminated++; continue; }
      const lat = Number(f[cols.lat]);
      const lng = Number(f[cols.lng]);
      const grid = cols.grid >= 0 ? Number(f[cols.grid]) : null;
      // ONSPD uses lat 99.999999 / grid indicator 9 for postcodes without a grid reference.
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat > 90 || grid === 9) { stats.noLocation++; continue; }
      onRecord(f[cols.pc], lat, lng, { quality: grid, country: cols.ctry >= 0 ? f[cols.ctry] : null, lad: cols.lad >= 0 ? f[cols.lad] : null });
    }
  }
  return {
    stats,
    meta: {
      id,
      name: 'ONS Postcode Directory (ONSPD)',
      release: releaseFromName(input),
      url: 'https://geoportal.statistics.gov.uk/search?q=PRD_ONSPD',
      licence: 'Open Government Licence v3.0',
      attribution: [
        'Source: Office for National Statistics licensed under the Open Government Licence v.3.0',
        'Contains OS data © Crown copyright and database right',
        'Contains Royal Mail data © Royal Mail copyright and database right',
        'Contains GeoPlace data © Local Government Information House Limited copyright and database right',
      ],
      verified: true,
    },
  };
}
