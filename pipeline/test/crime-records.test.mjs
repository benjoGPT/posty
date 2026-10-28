import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'posty-crime-'));test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
for(const [name,file]of Object.entries({crime:'lib/crime.ts',data:'lib/data.ts',metrics:'lib/metrics.ts',postcode:'lib/postcode.ts',app:'config/app.ts'})){
 const source=fs.readFileSync(file,'utf8').replace(/from ['"]\.\/([^'"]+)['"]/g,"from './$1.mjs'").replace("from '@/config/app'","from './app.mjs'");fs.writeFileSync(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const crime=await import(pathToFileURL(path.join(dir,'crime.mjs')));
const scope={label:'test boundary',centre:[-2.5,52.5],box:[-3,52,-2,53],boundary:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-3,52],[-2,52],[-2,53],[-3,53],[-3,52]],[[-2.8,52.2],[-2.6,52.2],[-2.6,52.4],[-2.8,52.4],[-2.8,52.2]]]}}};
function record(id,lng=-2.5,lat=52.5,persistent_id=''){return {id,persistent_id,category:'burglary',month:'2026-08',location:{latitude:String(lat),longitude:String(lng),street:{id:1,name:'On or near High Street'}},context:'',outcome_status:null,location_type:'Force',location_subtype:''};}
test('crime records respect holes and boundaries, deduplicate persistent records and retain separate ASB incidents',()=>{
 const rows=[record(1),record(2,-2.5,52.5,'stable'),record(3,-2.5,52.5,'stable'),record(4,-2.7,52.3),record(5,-4,52.5),record(6,0,0),{...record(7),category:'anti-social-behaviour'},{...record(8),category:'anti-social-behaviour'}];
 const result=crime.filterRecords(rows,scope);assert.deepEqual(result.map(r=>r.id).sort((a,b)=>a-b),[1,2,7,8]);assert.ok(result.every(r=>!('time' in r)&&!('day' in r)));
 const p=new URL(crime.recordsUrl(scope,'2026-08')).searchParams;assert.equal(p.get('poly'),'52,-3:52,-2:53,-2:53,-3');assert.equal(p.get('lat'),null);assert.throws(()=>crime.recordsUrl(scope,'2026-13'));
});
test('coverage identifies wholly absent forces as well as cross-border missing months',()=>{
 const coverage=JSON.parse(fs.readFileSync('public/data/crime-coverage.json'));
 assert.deepEqual(crime.coverageGaps(coverage,'M',coverage.months.slice(-12)).map(g=>[g.force,g.months.length]),[['greater-manchester',12]]);
 for(const code of ['GL','HR','WR','NP'])assert.ok(crime.coverageGaps(coverage,code,['2026-08']).some(g=>g.force==='gloucestershire'),code);
 assert.deepEqual(crime.coverageGaps(coverage,'SY',['2026-08']),[]);
 assert.deepEqual(crime.coverageGaps(coverage,'GL',['2026-01']),[]);
});
test('Police API success, errors, cancellation and month mismatches stay distinct from no records',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify([record(1),record(2)]),{status:200});};
 try {
  assert.equal((await crime.crimeRecords(scope,'2026-08')).length,2);await crime.crimeRecords(scope,'2026-08');assert.equal(calls,1,'repeat requests use the bounded session cache');
  const c=new AbortController();c.abort();await assert.rejects(crime.crimeRecords(scope,'2026-08',c.signal),{name:'AbortError'});
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(crime.crimeRecords(scope,'2026-07'),/too many records/);
  globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(crime.crimeRecords(scope,'2026-06'),/busy/);
  globalThis.fetch=async()=>new Response('[]',{status:200});assert.deepEqual(await crime.crimeRecords(scope,'2026-05'),[]);
  globalThis.fetch=async()=>new Response(JSON.stringify([record(1)]),{status:200});await assert.rejects(crime.crimeRecords(scope,'2026-04'),/different month/);
 }finally{globalThis.fetch=original;}
});
