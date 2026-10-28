import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import zlib from 'node:zlib';import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'posty-load-'));test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
for(const [name,file]of Object.entries({data:'lib/data.ts',metrics:'lib/metrics.ts',postcode:'lib/postcode.ts',app:'config/app.ts',namedSearch:'lib/namedSearch.ts'})){
 let source=fs.readFileSync(file,'utf8').replace(/from ['"]\.\/([^'"]+)['"]/g,"from './$1.mjs'").replace("from '@/config/app'","from './app.mjs'");fs.writeFileSync(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {PostcodeData}=await import(pathToFileURL(path.join(dir,'data.mjs')));const names=await import(pathToFileURL(path.join(dir,'namedSearch.mjs')));
function rowsFor(query){const q=names.normaliseName(query);const keys=new Set([names.nameBucket(q),...q.split(' ').map(names.nameBucket)]);return [...keys].flatMap(k=>JSON.parse(zlib.gunzipSync(fs.readFileSync(`public/data/search/${k}.json.gz`))));}
test('named search finds actual GB streets, places and Welsh alternatives without mistaking them for postcode areas',()=>{
 for(const q of ['Shrewsbury','Birmingham','Caerdydd','St Ives']){const r=names.rankNamed(rowsFor(q),q);assert.ok(r.some(x=>x.kind==='place'),q);}
 assert.match(names.rankNamed(rowsFor('Shrewsbury'),'Shrewsbury')[0].subtitle,/^Town/);
 const results=names.rankNamed(rowsFor('High Street Shrewsbury'),'High Street Shrewsbury');assert.ok(results.some(r=>r.kind==='street'&&r.title==='High Street'&&r.subtitle.includes('Shrewsbury')));for(const r of results){assert.ok(r.lat>49&&r.lat<61);assert.ok(r.lng>-9&&r.lng<3);}
 assert.deepEqual(names.rankNamed(rowsFor('Shrewsbury'),'qzxnonexistentplace'),[]);
});
test('bootstrap is small and regional loading restores statistics, prices and administrative details',async()=>{
 const realFetch=globalThis.fetch;const requests=[];globalThis.fetch=async u=>{const p=new URL(u).pathname.replace('/data/','');requests.push(p);return new Response(fs.readFileSync('public/data/'+p),{status:200});};
 try{const d=new PostcodeData('https://example.test/data');await d.init();assert.ok(!requests.some(p=>p.startsWith('region-stats')||p.startsWith('search/')));const bytes=requests.reduce((s,p)=>s+fs.statSync('public/data/'+p).size,0);assert.ok(bytes<1_500_000,bytes);assert.equal(d.districts.get('SY1').pp,undefined);assert.equal(d.community.regions.SY1,undefined);
 const fc=await d.loadDistricts('SY');assert.ok(d.districts.get('SY1').pp.n36>=5);assert.ok(d.districts.get('SY1').adm.councils.length);assert.ok(d.community.regions.SY1.population>20000);assert.ok(d.insights.groups.SY1.im);assert.ok(fc.features.some(f=>f.properties.c==='SY1'&&f.properties.mx_crime_rate>0));const sectors=await d.loadSectors('SY');assert.ok(sectors.features.some(f=>f.properties.c==='SY1 1'&&f.properties.mx_population>0));assert.equal(requests.filter(p=>p==='region-stats/SY.json').length,1);
 const healthy=globalThis.fetch;globalThis.fetch=async u=>String(u).includes('region-stats/TF.json')?new Response('Unavailable',{status:503}):healthy(u);const fallback=await d.loadDistricts('TF');assert.ok(fallback.features.length>0);assert.ok(d.regionalFailures.has('TF')); 
 }finally{globalThis.fetch=realFetch;}
});
