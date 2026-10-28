// A content-addressed release keeps long-lived browser caches safe across updates.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve('public/data');const files=[];
function walk(dir,prefix=''){for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(!prefix&&item.name==='releases')continue;const relative=prefix+item.name;if(item.isDirectory())walk(path.join(dir,item.name),relative+'/');else files.push(relative);}}
walk(root);const hash=crypto.createHash('sha256');for(const f of files){hash.update(f);hash.update(fs.readFileSync(path.join(root,f)));}const version=hash.digest('hex').slice(0,16);const target=path.join(root,'releases',version);
if(!fs.existsSync(target)){fs.mkdirSync(target,{recursive:true});for(const f of files){const dest=path.join(target,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}}
process.stdout.write(version);
