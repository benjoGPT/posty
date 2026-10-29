"""Build searchable England and Wales county/council and built-up-area profiles.

Official inputs: ONSPD August 2026 geography, ONS April 2024 BUA names and
Nomis Census 2021 bulk tables. Census counts are allocated from LSOAs by the
share of active postcodes in each target geography. This is explicit in the UI.
"""
import collections,csv,gzip,io,json,math,pathlib,shutil,time,urllib.parse,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent; RAW=ROOT/'raw/dashboard'; OUT=ROOT/'public/data/profiles'; RAW.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
UA={'User-Agent':'Postcode Atlas data builder (Open Government Licence reuse)'}
def fetch(url,path,timeout=300):
 path=pathlib.Path(path)
 if path.exists() and path.stat().st_size>100:return path
 tmp=path.with_suffix(path.suffix+'.part');req=urllib.request.Request(url,headers=UA)
 for attempt in range(4):
  try:
   with urllib.request.urlopen(req,timeout=timeout) as src,tmp.open('wb') as dst:shutil.copyfileobj(src,dst)
   tmp.replace(path);return path
  except Exception:
   tmp.unlink(missing_ok=True)
   if attempt==3:raise
   time.sleep(2**attempt)
def zip_rows(path,predicate):
 with zipfile.ZipFile(path) as z:
  for name in z.namelist():
   if predicate(name):
    with z.open(name) as f:yield from csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig'))
def f(v):
 try:return float(v or 0)
 except:return 0.
def first(row,*names):
 for n in names:
  if row.get(n):return row[n]
 return ''

archive=fetch('https://www.arcgis.com/sharing/rest/content/items/9e5a92a3cfb14dc7ad43d6ea7a7b8c7f/data',RAW/'onspd.zip')
councils={x['properties']['c']:x['properties'] for x in json.load(open(ROOT/'pipeline/reference/councils.geojson'))['features']}
bua_url='https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/BUA_APR_2024_EW_NC/FeatureServer/0/query?'+urllib.parse.urlencode({'where':'1=1','outFields':'*','returnGeometry':'false','f':'json','resultRecordCount':10000})
bua_json=json.load(urllib.request.urlopen(urllib.request.Request(bua_url,headers=UA),timeout=120))
bua_names={first(x['attributes'],'BUA24CD','BUA24CDH'):first(x['attributes'],'BUA24NM','BUA24NMW') for x in bua_json.get('features',[]) if first(x['attributes'],'BUA24CD','BUA24CDH')}
if len(bua_names)<5000:raise ValueError(f'Incomplete BUA names lookup: {len(bua_names)}')
members=collections.defaultdict(collections.Counter); meta=collections.defaultdict(lambda:[0,0.,0.,'']); lsoa_all=collections.Counter(); pc_geog={}
country={'E':'England','W':'Wales','S':'Scotland'}
source_rows=0
for row in zip_rows(archive,lambda n:'/multi_csv/' in n and n.endswith('.csv')):
 if row.get('doterm'):continue
 pc=''.join(row.get('pcds','').upper().split());lsoa=first(row,'lsoa21cd');
 if not pc or not lsoa.startswith(('E01','W01')):continue
 try:lat=float(row['lat']);lng=float(row['long'])
 except:continue
 lad=first(row,'lad25cd','lad24cd','oslaua');bua=first(row,'bua24cd','bua22cd')
 targets=[]
 if lad in councils:targets.append(('county',lad))
 if bua in bua_names:targets.append(('town',bua))
 if not targets:continue
 lsoa_all[lsoa]+=1;source_rows+=1
 pg={'country':country.get(lsoa[0],'')}
 for kind,code in targets:
  key=f'{kind}:{code}';members[key][lsoa]+=1;m=meta[key];m[0]+=1;m[1]+=lat;m[2]+=lng
  if kind=='county':pg['county']=code
  else:pg['town']=code
 pc_geog[pc]=pg
print('Active England/Wales postcodes:',source_rows,'geographies:',len(members),flush=True)
with gzip.open(RAW/'postcode-geography.json.gz','wt',encoding='utf-8') as z:json.dump(pc_geog,z,separators=(',',':'))

codes=['ts001','ts007a','ts044','ts045','ts054','ts066','ts067','ts037','ts038']
tables={}
for code in codes:
 path=fetch(f'https://www.nomisweb.co.uk/output/census/2021/census2021-{code}.zip',RAW/f'{code}.zip')
 tables[code]={r['geography code']:r for r in zip_rows(path,lambda n:n.endswith('-lsoa.csv'))}
 print(code,len(tables[code]),flush=True)
def direct(row,needle):
 needle=needle.lower();return sum(f(v) for k,v in row.items() if k.lower().endswith(needle))
def contains(row,*needles):
 ns=[n.lower() for n in needles];return sum(f(v) for k,v in row.items() if all(n in k.lower() for n in ns))
facts={}
for lsoa in lsoa_all:
 if any(lsoa not in tables[c] for c in codes):continue
 t=collections.Counter();r=tables['ts001'][lsoa];t['population']=next((f(v) for k,v in r.items() if k.endswith('Total; measures: Value')),0)
 r=tables['ts007a'][lsoa]
 for k,v in r.items():
  if not k.startswith('Age: Aged'):continue
  import re
  m=re.search(r'\d+',k)
  if not m:continue
  age=int(m.group());n=f(v);t['age_total']+=n
  if age<=10:t['children_n']+=n
  if age>=65:t['older_n']+=n
 r=tables['ts054'][lsoa];t['tenure_total']=direct(r,'total: all households');t['owned_n']=direct(r,': owned')+direct(r,': shared ownership');t['private_rent_n']=direct(r,': private rented')+direct(r,': lives rent free');t['social_rent_n']=direct(r,': social rented')
 r=tables['ts044'][lsoa];t['home_total']=direct(r,'total: all households');t['detached_n']=direct(r,': detached');t['flats_n']=contains(r,'accommodation type:','flat, maisonette or apartment')
 r=tables['ts045'][lsoa];t['car_total']=next((f(v) for k,v in r.items() if 'total: all households' in k.lower()),0);t['no_car_n']=contains(r,'no cars or vans in household')
 r=tables['ts037'][lsoa];t['health_total']=next((f(v) for k,v in r.items() if 'total: all usual residents' in k.lower()),0);t['good_health_n']=direct(r,': very good health')+direct(r,': good health')
 r=tables['ts038'][lsoa];t['disability_total']=next((f(v) for k,v in r.items() if 'total: all usual residents' in k.lower()),0);t['disabled_n']=direct(r,': disabled under the equality act')
 r=tables['ts066'][lsoa];t['activity_total']=next((f(v) for k,v in r.items() if 'total: all usual residents aged 16 years and over' in k.lower()),0);t['employed_n']=direct(r,': in employment');t['unemployed_n']=direct(r,': unemployed')
 r=tables['ts067'][lsoa];t['qualification_total']=next((f(v) for k,v in r.items() if 'total: all usual residents aged 16 years and over' in k.lower()),0);t['degree_n']=contains(r,'level 4 qualifications or above')
 facts[lsoa]=t

profiles=[]
for key,counts in members.items():
 kind,code=key.split(':',1);tot=collections.Counter();known=0
 for lsoa,npc in counts.items():
  if lsoa not in facts:continue
  w=npc/lsoa_all[lsoa];known+=npc
  for k,v in facts[lsoa].items():tot[k]+=v*w
 if known/sum(counts.values())<.98 or tot['population']<=0:continue
 def pct(n,d):return round(100*tot[n]/tot[d],1) if tot[d] else None
 metrics={'population':round(tot['population']),'children':pct('children_n','age_total'),'older':pct('older_n','age_total'),'owned':pct('owned_n','tenure_total'),'private_rent':pct('private_rent_n','tenure_total'),'social_rent':pct('social_rent_n','tenure_total'),'detached':pct('detached_n','home_total'),'flats':pct('flats_n','home_total'),'no_car':pct('no_car_n','car_total'),'good_health':pct('good_health_n','health_total'),'disabled':pct('disabled_n','disability_total'),'employed':pct('employed_n','activity_total'),'unemployed':pct('unemployed_n','activity_total'),'degree':pct('degree_n','qualification_total')}
 metrics={k:v for k,v in metrics.items() if v is not None};metrics['working_age']=round(100-metrics.get('children',0)-metrics.get('older',0),1);metrics['other_tenure']=round(max(0,100-metrics.get('owned',0)-metrics.get('private_rent',0)-metrics.get('social_rent',0)),1)
 m=meta[key];props=councils.get(code,{}) if kind=='county' else {'name':bua_names[code],'ctry':'England' if code.startswith('E') else 'Wales'}
 profiles.append({'code':code,'kind':kind,'name':props.get('name') or props.get('BUA24NM'),'country':props.get('ctry') or ('England' if code.startswith('E') else 'Wales'),'lat':round(m[1]/m[0],5),'lng':round(m[2]/m[0],5),'postcodes':m[0],'population':metrics['population'],'metrics':metrics,'sourcePeriods':{'census':'2021','geography':'ONSPD August 2026 / BUA April 2024'}})
profiles.sort(key=lambda p:(p['kind'],p['name'],p['code']))
(OUT/'geography').mkdir(exist_ok=True)
for i in range(32):
 rows=[p for p in profiles if sum(map(ord,p['code']))%32==i]
 (OUT/'geography'/f'{i}.json').write_text(json.dumps(rows,separators=(',',':')))
index=[{k:p[k] for k in ('code','kind','name','country','lat','lng','population')} for p in profiles]
(OUT/'index.json').write_text(json.dumps(index,separators=(',',':')))
(OUT/'meta.json').write_text(json.dumps({'generated':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'profiles':len(profiles),'counties':sum(p['kind']=='county' for p in profiles),'towns':sum(p['kind']=='town' for p in profiles),'sourcePostcodes':source_rows,'sources':['ONS Postcode Directory August 2026','ONS Built-up Areas April 2024 names and codes','Census 2021 bulk tables via Nomis'],'method':'LSOA Census counts allocated by each target geography share of active postcodes in that LSOA. At least 98% table coverage required.'},indent=2))
print('Profiles:',len(profiles),'county/council:',sum(p['kind']=='county' for p in profiles),'town:',sum(p['kind']=='town' for p in profiles),flush=True)
