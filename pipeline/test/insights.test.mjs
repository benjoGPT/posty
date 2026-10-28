import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const insights=JSON.parse(fs.readFileSync('public/data/insights.json','utf8'));
const index=JSON.parse(fs.readFileSync('public/data/index.json','utf8'));
for(const f of fs.readdirSync('public/data/region-stats')){const x=JSON.parse(fs.readFileSync('public/data/region-stats/'+f,'utf8'));Object.assign(insights.groups,x.insights);for(const r of index.districts)if(x.details[r.c])Object.assign(r,x.details[r.c]);}
test('IMD enrichment retains attribution, England-only scale and finite matched samples',()=>{
 assert.equal(insights.schema,1);assert.match(insights.imd.url,/^https:\/\/deprivation\.communities\.gov\.uk\//);assert.match(insights.imd.sha256,/^[a-f0-9]{64}$/);assert.ok(insights.imd.postcodes>500000);
 for(const g of Object.values(insights.groups)){if(g.im!==undefined){assert.ok(g.im>=1&&g.im<=10);assert.ok(Number.isInteger(g.imn)&&g.imn>0)}}
 assert.ok(insights.groups.SY1.im);assert.equal(insights.groups.CF?.im,undefined);assert.equal(insights.groups.EH?.im,undefined);
});
test('price change excludes incomplete years and low samples, preserving negative changes',()=>{
 const {baseYear,year}=insights.growth;assert.equal(year-baseYear,1);let falling=0,compared=0;
 for(const r of index.districts){const x=r.pp?.year?.[baseYear],y=r.pp?.year?.[year],g=insights.groups[r.c];if(x&&y&&x[0]>=20&&y[0]>=20){assert.ok(Math.abs(g.pg-(y[1]/x[1]-1)*100)<=0.005001);assert.deepEqual(g.pgn,[x[0],y[0]]);if(g.pg<0)falling++;compared++}else assert.equal(g?.pg,undefined)}
 assert.ok(compared>100);assert.ok(falling>0);
});
