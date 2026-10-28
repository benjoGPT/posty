import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const d=JSON.parse(fs.readFileSync('public/data/community.json','utf8'));
const provenance=JSON.parse(fs.readFileSync('public/data/community/provenance.json','utf8'));
const metrics=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync('lib/metrics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('source-described measures have ordered stops, finite values and honest coverage',()=>{
 assert.equal(d.schema,1);assert.ok(d.metrics.length>=30);assert.ok(fs.statSync('public/data/community.json').size<2_000_000);
 for(const m of d.metrics){assert.match(m.source,/^https:\/\//);assert.ok(m.period);assert.ok(m.note.length>50);assert.ok(m.stops.every((v,i)=>Number.isFinite(v)&&(i===0||v>m.stops[i-1])));}
 for(const r of Object.values(d.regions)){for(const v of Object.values(r))assert.ok(Number.isFinite(v));for(const key of ['owned','private_rent','social_rent','children','older','gigabit','crowded'])if(r[key]!==undefined)assert.ok(r[key]>=0&&r[key]<=100,key);}
 assert.ok(d.regions.SY1.population>20000);assert.ok(d.regions.CF10.population>0);assert.equal(d.regions.EH1.population,undefined);assert.equal(d.regions.M1.crime_rate,undefined);assert.equal(d.regions.M1.crime_count,undefined);assert.equal(d.regions.GL1.crime_count,undefined);assert.ok(d.regions.M1.gigabit>=0);
});
test('crime periods, force masks and resident-rate calculations reconcile',()=>{
 assert.equal(provenance.crime.months.length,24);assert.equal(provenance.crime.months.at(-1),'2026-08');assert.ok(provenance.crime.maskedRegions.includes('M1'));assert.ok(provenance.crime.maskedRegions.includes('GL1'));
 for(const c of ['SY1','TF1','CF10']){const r=d.regions[c];assert.ok(r.crime_count>0);assert.ok(Math.abs(r.crime_rate-r.crime_count/r.population*1000)<.002);}
 assert.ok(provenance.crime.sourceRows>1_000_000);assert.ok(provenance.crime.unlocatedRows>0);
});
test('sector metrics are lazy shards and unavailable imports are not live filters',()=>{
 assert.ok(!Object.keys(d.regions).some(c=>c.includes(' ')));const sector=JSON.parse(fs.readFileSync('public/data/community/sectors/SY.json','utf8'));assert.ok(sector['SY1 1'].population>0);assert.ok(sector['SY1 1'].green_distance>=0);
 assert.ok(d.availability.some(x=>x.id==='epc_score'&&x.status==='access-required'));assert.ok(d.availability.some(x=>x.id==='planning'&&x.status==='source-gap'));assert.ok(!d.metrics.some(m=>['epc_score','planning_count'].includes(m.id)&&m.status==='available'));
 const places=JSON.parse(fs.readFileSync('public/data/places/SY.json','utf8'));for(const k of ['parks','pharmacies','supermarkets'])assert.ok(places[k].length>0);
});
test('shared metric registry formats missing data and produces stable map ramps',()=>{
 metrics.setMetricDefinitions(d.metrics);for(const m of d.metrics){assert.equal(metrics.metricFor('metric:'+m.id).id,m.id);assert.equal(metrics.metricStops(m,'dark').length,m.stops.length);assert.equal(metrics.formatMetric(undefined,m),'No data');assert.ok(metrics.formatMetric(0,m).startsWith('0'));}
});
