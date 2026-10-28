import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const{validateStyleMin}=require('@maplibre/maplibre-gl-style-spec');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');
const dir=fs.mkdtempSync(join(tmpdir(),'posty-paint-'));
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
for(const name of ['mapLayers','metrics','levels']){let s=fs.readFileSync(`lib/${name}.ts`,'utf8');s=s.replace(/from ['"]\.\/([^'"]+)['"]/g,"from './$1.mjs'");fs.writeFileSync(`${dir}/${name}.mjs`,compile(s));}
const layers=await import(pathToFileURL(`${dir}/mapLayers.mjs`));const defs=await import(pathToFileURL(`${dir}/metrics.mjs`));const data=JSON.parse(fs.readFileSync('public/data/community.json','utf8'));defs.setMetricDefinitions(data.metrics);
test('every metric paint expression passes the MapLibre style validator in both themes',()=>{
 for(const m of data.metrics)for(const theme of ['light','dark']){
  const style={version:8,sources:{regions:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'regions',type:'fill',source:'regions',paint:{'fill-color':layers.fillColour(`metric:${m.id}`,theme)}}]};
  const errors=validateStyleMin(style);assert.deepEqual(errors.map(e=>e.message),[],m.id+' '+theme);
 }
});
