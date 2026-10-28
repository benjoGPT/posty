// Move optional district details and statistics off the startup path. Idempotent.
import fs from 'node:fs';import path from 'node:path';
const data=path.resolve('public/data'),folder=path.join(data,'region-stats');fs.mkdirSync(folder,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(path.join(data,p),'utf8'));const write=(p,d)=>fs.writeFileSync(path.join(data,p),JSON.stringify(d));
const index=read('index.json'),community=read('community.json'),insights=read('insights.json');const all={};
for(const f of fs.readdirSync(folder))if(f.endsWith('.json'))all[f.slice(0,-5)]=read('region-stats/'+f);
function area(c){return c.match(/^[A-Z]+/)[0];}function record(c){return all[area(c)]??=( {community:{},insights:{},details:{}});}
if(!community.regionalShards){
 for(const r of Object.values(all))r.community={};
 for(const [code,v] of Object.entries(community.regions))if(/\d/.test(code))record(code).community[code]=v;
 for(const file of fs.readdirSync(path.join(data,'community/sectors'))){if(!file.endsWith('.json'))continue;for(const [code,v]of Object.entries(read('community/sectors/'+file)))record(code).community[code]=v;}
 community.regions=Object.fromEntries(Object.entries(community.regions).filter(([c])=>!/[0-9]/.test(c)));community.regionalShards=true;write('community.json',community);
}
if(!insights.regionalShards){
 for(const r of Object.values(all))r.insights={};
 for(const [code,v]of Object.entries(insights.groups))if(/\d/.test(code))record(code).insights[code]=v;
 insights.groups=Object.fromEntries(Object.entries(insights.groups).filter(([c])=>!/[0-9]/.test(c)));insights.regionalShards=true;write('insights.json',insights);
}
if(!index.regionalShards){
 for(const r of Object.values(all))r.details={};
 for(const d of index.districts){const {pp,adm}=d;record(d.c).details[d.c]={...(pp?{pp}:{}),...(adm?{adm}:{})};delete d.pp;delete d.adm;}
 index.regionalShards=true;write('index.json',index);
}
for(const [a,record]of Object.entries(all))write(`region-stats/${a}.json`,record);
const m=read('manifest.json');m.regionalShards=true;write('manifest.json',m);
console.log('Regional statistics:',Object.keys(all).length,'chunks');
