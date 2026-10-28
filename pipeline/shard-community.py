"""Keep startup measures national and load sector statistics only when needed."""
import json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'public/data';p=DATA/'community.json';d=json.loads(p.read_text());full=d['regions'];shards={}
for code,values in full.items():
 if ' ' in code:shards.setdefault(re.match('[A-Z]+',code)[0],{})[code]=values
for area,values in shards.items():
 out=DATA/'community'/'sectors'/f'{area}.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(values,separators=(',',':')))
provenance={k:d.pop(k) for k in ['crime','geography'] if k in d};out=DATA/'community'/'provenance.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(provenance,separators=(',',':')))
d['regions']={c:v for c,v in full.items() if ' ' not in c};d['provenanceUrl']='community/provenance.json';d['sectorAreas']=sorted(shards);p.write_text(json.dumps(d,separators=(',',':')));print('Startup regions',len(d['regions']),'sector shards',len(shards),'bytes',p.stat().st_size)
