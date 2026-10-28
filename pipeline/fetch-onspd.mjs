// Downloads the ONS Postcode Directory and extracts its UK CSV.
//
//   node pipeline/fetch-onspd.mjs [download-url]
//
// With no URL, finds the newest "ONS Postcode Directory" item on the ONS Open
// Geography Portal (hosted on ArcGIS Online) and downloads that. Prints the
// path of the extracted CSV on the last line of output; inside GitHub Actions
// it also sets ONSPD_CSV in $GITHUB_ENV for later steps.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'raw');
const ARCGIS = 'https://www.arcgis.com/sharing/rest';

async function findLatest() {
  const q = encodeURIComponent('owner:ONSGeography_data title:"ONS Postcode Directory"');
  const r = await fetch(`${ARCGIS}/search?f=json&num=50&sortField=modified&sortOrder=desc&q=${q}`);
  if (!r.ok) throw new Error(`ArcGIS search failed: HTTP ${r.status}`);
  const { results = [] } = await r.json();
  // Release items are titled like "ONS Postcode Directory (February 2026)" and are zip downloads.
  const releases = results
    .filter((it) => /^ONS Postcode Directory \((January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\)(?: for the United Kingdom)?$/.test(it.title))
    .filter((it) => /CSV|Zip|File/i.test(it.type))
    .map((it) => ({ ...it, date: new Date(`1 ${it.title.match(/\((.*)\)/)[1]}`) }))
    .sort((a, b) => b.date - a.date);
  if (!releases.length) {
    throw new Error(`Couldn't find an ONSPD release automatically. Found: ${results.map((x) => `${x.title} [${x.type}]`).join('; ') || 'nothing'}. Pass the download URL instead.`);
  }
  console.log(`Latest release: ${releases[0].title} (item ${releases[0].id})`);
  return `${ARCGIS}/content/items/${releases[0].id}/data`;
}

const url = process.argv[2]?.trim() || (await findLatest());
fs.mkdirSync(RAW, { recursive: true });
const zip = path.join(RAW, 'onspd.zip');
console.log(`Downloading ${url}`);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
console.log(`Downloaded ${(fs.statSync(zip).size / 1e6).toFixed(0)} MB`);

const entries = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n');
const csv = entries.find((e) => /ONSPD_[A-Z]{3}_\d{4}_UK\.csv$/i.test(e));
let out;
if(csv){execFileSync('unzip',['-o','-j',zip,csv,'-d',RAW]);out=path.join(RAW,path.basename(csv));}
else {
 const names=entries.filter(e=>/\/multi_csv\/ONSPD_[A-Z]{3}_\d{4}_UK_.*\.csv$/i.test(e));
 if(!names.length)throw new Error('Official archive has no UK CSV or multi_csv directory');
 const release=names[0].match(/ONSPD_[A-Z]{3}_\d{4}/i)[0];const dest=path.join(RAW,release);fs.mkdirSync(dest,{recursive:true});
 execFileSync('unzip',['-o','-j',zip,...names,'-d',dest],{maxBuffer:1<<26});out=dest;
}
console.log(`Extracted ${path.relative(ROOT, out)}`);
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `ONSPD_CSV=${out}\n`);
console.log(out);
