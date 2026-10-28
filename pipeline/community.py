"""Build source-dated community measures. No nearest-postcode assignment or zero-filled gaps."""
import argparse,collections,csv,datetime,hashlib,io,json,math,pathlib,re,shutil,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent;RAW=ROOT/'raw';DATA=ROOT/'public/data'
p=argparse.ArgumentParser();p.add_argument('--crime-month',default='2026-08');p.add_argument('--skip-crime',action='store_true');p.add_argument('--epc-csv');p.add_argument('--planning-csv');a=p.parse_args()
def fetch(url,path,timeout=180):
 path=pathlib.Path(path)
 if not path.exists():
  path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.part')
  with urllib.request.urlopen(url,timeout=timeout) as src,tmp.open('wb') as dst:shutil.copyfileobj(src,dst)
  tmp.replace(path)
 return path

def codes(pc):
 pc=re.sub(r'\s','',pc.upper());d=pc[:-3];m=re.match(r'^[A-Z]{1,2}',d)
 return (m[0],d,d+' '+pc[-3]) if m and re.fullmatch(r'[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}',pc) else ()
def rows_zip(path,part):
 z=zipfile.ZipFile(path);names=[n for n in z.namelist() if part(n)]
 for name in names:
  with z.open(name) as f:yield from csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig'))
index=json.loads((DATA/'index.json').read_text());manifest=json.loads((DATA/'manifest.json').read_text());regions={};metrics=[];status=[]
region_info={g['c']:g for g in index['areas']+index['districts']}
for f in (DATA/'sectors').glob('*.geojson'):
 for x in json.loads(f.read_text())['features']:
  if x['geometry']['type']!='Point':region_info[x['properties']['c']]=x['properties']
current={re.sub(r'\s','',pc) for pc in (RAW/'derived/current-postcodes.txt').read_text().splitlines()}
if len(current)<500000:raise ValueError('Run data:build before community imports')
def put(code,key,value):
 if value is not None and math.isfinite(value):regions.setdefault(code,{})[key]=round(value,3)
def metric(id,title,topic,unit,stops,source,period,note,precision=1):
 metrics.append(dict(id=id,title=title,topic=topic,unit=unit,stops=stops,source=source,period=period,note=note,precision=precision,status='available' if any(id in g for g in regions.values()) else 'unavailable'))
# Geography from the authenticated publisher's August 2026 release; original map geometry is preserved.
geog_path=RAW/'derived/community-geography.json'
membership_hash=hashlib.sha256('\n'.join(sorted(current)).encode()).hexdigest()
if not geog_path.exists() or json.loads(geog_path.read_text()).get('membershipHash')!=membership_hash:
 archive=fetch('https://www.arcgis.com/sharing/rest/content/items/9e5a92a3cfb14dc7ad43d6ea7a7b8c7f/data',RAW/'onspd-geography.zip')
 counts=collections.defaultdict(collections.Counter);matched=collections.Counter();source_n=0
 for row in rows_zip(archive,lambda n:'/multi_csv/' in n and n.endswith('.csv')):
  pc=re.sub(r'\s','',row['pcds'])
  if pc not in current or row.get('doterm'):continue
  lsoa=row.get('lsoa21cd','');cs=codes(pc)
  if not cs:continue
  source_n+=1
  for c in cs:
   matched[c]+=1
   if lsoa.startswith(('E','W')):counts[c][lsoa]+=1
 geog={'membershipHash':membership_hash,'source':'ONSGeography_data ONSPD August 2026','matched':dict(matched),'counts':{k:dict(v) for k,v in counts.items()},'sourceRows':source_n}
 geog_path.parent.mkdir(parents=True,exist_ok=True);geog_path.write_text(json.dumps(geog,separators=(',',':')))
else:geog=json.loads(geog_path.read_text())
print('Geography:',geog['sourceRows'],'current-map matches',flush=True)
# Whole LSOA populations distributed among postal regions by current postcode shares.
# This conserves each LSOA count at every postal level, but remains an approximation.
all_lsoa=collections.Counter()
for c,counts in geog['counts'].items():
 if not re.search(r'\d',c):all_lsoa.update(counts)
def census(code):
 f=fetch(f'https://www.nomisweb.co.uk/output/census/2021/census2021-{code}.zip',RAW/'census'/f'{code}.zip')
 return {r['geography code']:r for r in rows_zip(f,lambda n:n.endswith('-lsoa.csv'))}
tables={c:census(c) for c in ['ts001','ts007a','ts044','ts052','ts054']}
def find(row,ends):
 return next(float(v) for k,v in row.items() if k.endswith(ends))
def sum_keys(row,pred):return sum(float(v) for k,v in row.items() if pred(k))
for code,counts in geog['counts'].items():
 n=sum(counts.values());mapped=geog['matched'].get(code,0);map_n=region_info.get(code,{}).get('n',mapped)
 coverage=n/max(1,map_n)
 # No partial-England totals disguised as entire cross-border postal populations.
 if coverage<.95:continue
 totals=collections.Counter();known=0
 for lsoa,pcs in counts.items():
  if lsoa not in tables['ts001'] or lsoa not in tables['ts054']:continue
  w=pcs/all_lsoa[lsoa];known+=pcs
  r=tables['ts001'][lsoa];totals['population']+=find(r,'Total; measures: Value')*w
  r=tables['ts007a'].get(lsoa,{})
  for k,v in r.items():
   if not k.startswith('Age: Aged'):continue
   number=int(re.search(r'\d+',k)[0]);people=float(v)*w
   totals['age_total']+=people;totals['age_sum']+=people*(87.5 if number==85 else 2 if number==4 else number+2)
   if number<=10:totals['children']+=people
   if number>=65:totals['older']+=people
  r=tables['ts054'][lsoa];totals['households']+=find(r,'Total: All households')*w
  for key,end in [('owned',': Owned'),('shared',': Shared ownership'),('private_rent',': Private rented'),('social_rent',': Social rented')]:
   # Shared ownership is repeated as a child category: match the parent exactly.
   col='Tenure of household'+end;totals[key]+=float(r.get(col,0))*w
  r=tables['ts044'].get(lsoa,{})
  totals['housing_households']+=float(r.get('Accommodation type: Total: All households',0))*w
  for key,end in [('detached',': Detached'),('semi',': Semi-detached'),('terraced',': Terraced')]:totals[key]+=float(r.get('Accommodation type'+end,0))*w
  totals['flats']+=sum_keys(r,lambda k:'purpose-built block' in k or 'converted or shared house' in k or 'another converted building' in k or 'commercial building' in k)*w
  r=tables['ts052'].get(lsoa,{});totals['occupancy_households']+=float(r.get('Occupancy rating for bedrooms: Total: All households',0))*w;totals['crowded']+=sum_keys(r,lambda k:k.endswith(': -1') or k.endswith(': -2 or less'))*w
 if known/max(1,n)<.98:continue
 put(code,'population',totals['population']);put(code,'census_coverage',coverage*100)
 km2=region_info.get(code,{}).get('km2');put(code,'population_density',totals['population']/km2 if km2 and km2>0 else None)
 for key,numerator in [('children',totals['children']),('older',totals['older'])]:put(code,key,100*numerator/totals['age_total'] if totals['age_total'] else None)
 put(code,'mean_age',totals['age_sum']/totals['age_total'] if totals['age_total'] else None)
 for key in ['owned','private_rent','social_rent','detached','semi','terraced','flats','crowded']:
  value=totals[key]+(totals['shared'] if key=='owned' else 0);den=totals['occupancy_households'] if key=='crowded' else totals['housing_households'] if key in ('detached','semi','terraced','flats') else totals['households'];put(code,key,100*value/den if den else None)
CENSUS_NOTE='Census Day 21 March 2021, England and Wales. Estimated postal totals: LSOA counts allocated by postcode shares, not address or resident locations. At least 95% map-postcode geography coverage required. Counts are not current population estimates. Scotland unavailable.'
source='https://www.nomisweb.co.uk/census/2021/bulk'
for key,title,unit,stops in [('population','Estimated residents','people',[0,1000,10000,100000,1000000]),('population_density','Estimated residents per km²','people/km²',[0,100,500,2000,10000]),('mean_age','Approximate mean age','years',[20,30,40,50,60]),('children','Residents aged under 15','%',[0,10,20,30,40]),('older','Residents aged 65+','%',[0,10,20,30,50])]:metric(key,title,'People',unit,stops,source,'Census 2021',CENSUS_NOTE,0 if key in ('population','population_density') else 1)
for key,title in [('owned','Owner occupation (incl. shared)'),('private_rent','Private renting'),('social_rent','Social renting'),('detached','Detached homes'),('semi','Semi-detached homes'),('terraced','Terraced homes'),('flats','Flats and converted homes'),('crowded','Overcrowded homes')]:metric(key,title,'Housing','%',[0,10,25,50,100],source,'Census 2021',CENSUS_NOTE+' Percentages refer to occupied households. Overcrowded means negative bedroom occupancy rating.')
print('Census:',sum('population' in g for g in regions.values()),'postal regions',flush=True)
# More recent people estimates, housing remains Census 2021.
import openpyxl
pop_url='https://www.ons.gov.uk/file?uri=%2Fpeoplepopulationandcommunity%2Fpopulationandmigration%2Fpopulationestimates%2Fdatasets%2Flowersuperoutputareamidyearpopulationestimates%2Fmid2022revisednov2025tomid2024%2Fsapelsoasyoa20222024.xlsx'
pop_cache=RAW/'derived/population2024.json'
if not pop_cache.exists():
 book=openpyxl.load_workbook(fetch(pop_url,RAW/'population2024.xlsx'),read_only=True,data_only=True);sheet=book['Mid-2024 LSOA 2021'];popdata={}
 for r in sheet.iter_rows(min_row=5,values_only=True):
  if not isinstance(r[2],str) or not r[2].startswith(('E01','W01')):continue
  ages=[float(r[5+i] or 0)+float(r[96+i] or 0) for i in range(91)]
  if abs(sum(ages)-float(r[4]))>.1:raise ValueError('Population age totals do not reconcile')
  popdata[r[2]]=[float(r[4]),sum(ages[:15]),sum(ages[65:]),sum(v*(92.5 if i==90 else i) for i,v in enumerate(ages))]
 if len(popdata)<35000:raise ValueError('Incomplete population workbook')
 pop_cache.write_text(json.dumps(popdata,separators=(',',':')))
else:popdata=json.loads(pop_cache.read_text())
for code,counts in geog['counts'].items():
 if 'population' not in regions.get(code,{}):continue
 totals=[0.,0.,0.,0.];known=0
 for lsoa,pcs in counts.items():
  if lsoa not in popdata:continue
  known+=pcs;weight=pcs/all_lsoa[lsoa]
  totals=[t+v*weight for t,v in zip(totals,popdata[lsoa])]
 if known/max(1,sum(counts.values()))<.98:
  for key in ('population','population_density','mean_age','children','older'):regions[code].pop(key,None)
  continue
 total,children,older,age_sum=totals;put(code,'population',total);km2=region_info.get(code,{}).get('km2');put(code,'population_density',total/km2 if km2 and km2>0 else None);put(code,'children',children/total*100);put(code,'older',older/total*100);put(code,'mean_age',age_sum/total)
for m in metrics:
 if m['topic']=='People':
  m.update(source='https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/lowersuperoutputareamidyearpopulationestimates',period='Mid-2024 estimates',note='ONS mid-2024 LSOA estimates, England and Wales. Postal-region estimates allocated by current postcode shares, not address/resident locations. Geography coverage at least 95%, population coverage at least 98%. Single-year ages are supporting information; 90+ group assumed 92.5 for approximate mean age. Housing statistics remain Census 2021. Scotland unavailable.')
print('Mid-2024 population imported',len(popdata),'LSOAs',flush=True)
# Broadband: Ofcom no longer publishes robust postcode actual-speed estimates.
bb=fetch('https://www.ofcom.org.uk/siteassets/resources/documents/research-and-data/multi-sector/infrastructure-research/connected-nations-spring-2026/202601_fixed_broadband_coverage_and_full_fibre_take-up-r1.zip',RAW/'ofcom2026.zip')
q=zipfile.ZipFile(bb);acc=collections.defaultdict(lambda:collections.defaultdict(list))
for name in q.namelist():
 if '/postcode_res_files_r1/' not in name or not name.endswith('.csv'):continue
 for row in csv.DictReader(io.TextIOWrapper(q.open(name),encoding='utf-8-sig')):
  if row['postcode'] not in current:continue
  for key,col in [('gigabit','Gigabit availability (% premises)'),('superfast','SFBB availability (% premises)'),('slow_broadband','% of premises unable to receive 10Mbit/s')]:
   try:value=float(row[col])
   except (ValueError,KeyError):continue
   if not 0<=value<=100:continue
   for c in codes(row['postcode']):acc[c][key].append(value)
for c,gg in acc.items():
 for key,values in gg.items():
  if len(values)>=5:put(c,key,sum(values)/len(values))
for key,title in [('gigabit','Gigabit availability'),('superfast','Superfast availability'),('slow_broadband','Unable to receive 10 Mbps')]:metric(key,title,'Connectivity','%',[0,25,50,75,100],'https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-update-spring-2026','January 2026','Unweighted mean of residential postcode availability percentages, not an area-wide premises percentage. Minimum five matched postcodes. Availability is not experienced speed or take-up; gigabit includes cable as well as fibre.')
print('Broadband complete',flush=True)
# Crime counts are allocated by anonymised points to the map's approximate boundaries.
if not a.skip_crime:
 from shapely.geometry import shape
 from shapely import points as make_points,STRtree
 def spatial(level):
  features=[]
  if level=='areas':files=[DATA/'areas.geojson']
  else:files=sorted((DATA/level).glob('*.geojson'))
  for f in files:
   features.extend(x for x in json.loads(f.read_text())['features'] if x['geometry']['type'] in ['Polygon','MultiPolygon'] and not x['properties'].get('label'))
  features.sort(key=lambda x:x['properties']['c']);return STRtree([shape(x['geometry']).buffer(0) for x in features]),[x['properties']['c'] for x in features]
 trees={level:spatial(level) for level in ['areas','districts','sectors']}
 crime_url=f'https://data.police.uk/data/archive/{a.crime_month}.zip';crime_archive=fetch(crime_url,RAW/f'crime-{a.crime_month}.zip',300);z=zipfile.ZipFile(crime_archive)
 files=[n for n in z.namelist() if n.endswith('-street.csv')];months=sorted({n[:7] for n in files})[-24:]
 if len(months)!=24:raise ValueError('Need 24 consecutive source months')
 ym=lambda m:int(m[:4])*12+int(m[5:]);assert all(ym(y)-ym(x)==1 for x,y in zip(months,months[1:]))
 permonth={m:[] for m in months}
 for name in files:
  if name[:7] in permonth:permonth[name[:7]].append(name)
 counts=collections.defaultdict(collections.Counter);source_forces={};unlocated=0;source_rows=0
 def consume(batch,period):
  if not batch:return
  pts=make_points([(x,y) for x,y,_ in batch])
  for level,(tree,codes_) in trees.items():
   hit=tree.query(pts,predicate='covered_by');seen_points=set()
   for j,k in zip(hit[0],hit[1]):
    j=int(j)
    if j in seen_points:continue
    seen_points.add(j);c=codes_[int(k)];cat=batch[j][2];v=counts[c]
    if cat=='Anti-social behaviour':v[period+'_asb']+=1
    else:
     v[period+'_crime']+=1
     if cat=='Burglary':v[period+'_burglary']+=1
     if cat=='Vehicle crime':v[period+'_vehicle']+=1
     if cat in ['Other theft','Shoplifting','Bicycle theft','Theft from the person']:v[period+'_theft']+=1
 for mi,month in enumerate(months):
  period='previous' if mi<12 else 'latest';ids=set();batch=[];source_forces[month]=[]
  for name in permonth[month]:
   force=name.split('/')[-1][8:-11]
   if force in ['northern-ireland','btp']:continue
   source_forces[month].append(force)
   for row in csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig')):
    ident=row['Crime ID'];source_rows+=1
    if ident and ident in ids:continue
    if ident:ids.add(ident)
    try:x=float(row['Longitude']);y=float(row['Latitude'])
    except ValueError:unlocated+=1;continue
    if not (-9<x<2.5 and 49<y<61):unlocated+=1;continue
    batch.append((x,y,row['Crime type']))
    if len(batch)>=20000:consume(batch,period);batch=[]
  consume(batch,period);print('Crime month',month,'complete',flush=True)
 expected=set.union(*(set(x) for x in source_forces.values()));missing={m:sorted(expected-set(fs)) for m,fs in source_forces.items() if expected-set(fs)}
 for c,g in counts.items():
  if g['latest_crime']>0:put(c,'crime_count',g['latest_crime'])
  if g['previous_crime']>=20 and g['latest_crime']>=20:put(c,'crime_change',100*(g['latest_crime']/g['previous_crime']-1))
  pop=regions.get(c,{}).get('population')
  if pop and pop>=250:
   for key,col in [('crime_rate','crime'),('burglary_rate','burglary'),('vehicle_rate','vehicle'),('theft_rate','theft'),('asb_rate','asb')]:
    if g['latest_'+col]>0:put(c,key,g['latest_'+col]/pop*1000)
 period=months[12]+' to '+months[-1]
 CRIME_NOTE='Police-recorded incidents, not personal risk. Anonymised points assigned to approximate postal polygons. Rates divide by estimated mid-2024 residents; visitors inflate town-centre rates. At least 250 estimated residents. Scotland/NI not covered. No observations stays grey, not zero. Source force/month gaps can undercount; see data provenance.'
 for key,title,unit,stops in [('crime_count','Recorded crime incidents','incidents',[0,100,500,2000,10000]),('crime_rate','Recorded crime per 1,000','per 1,000',[0,25,50,100,250]),('burglary_rate','Burglary per 1,000','per 1,000',[0,2,5,10,25]),('vehicle_rate','Vehicle crime per 1,000','per 1,000',[0,2,5,10,25]),('theft_rate','Theft per 1,000','per 1,000',[0,5,15,30,75]),('asb_rate','ASB incidents per 1,000','per 1,000',[0,5,15,30,75]),('crime_change','Recorded crime change','% change',[-50,-25,0,25,50])]:metric(key,title,'Safety',unit,stops,'https://data.police.uk/about/',period,CRIME_NOTE+(' Comparison uses the preceding 12 months, minimum 20 incidents per period.' if key=='crime_change' else ''))
 crime_meta={'months':months,'forcesByMonth':source_forces,'missingComparedWithUnion':missing,'unlocatedRows':unlocated,'sourceRows':source_rows,'source':crime_url}
else:crime_meta={'status':'not imported'}
# Optional EPC export. Never publish addresses or treat duplicate certificates as homes.
if a.epc_csv:
 latest={}
 for r in csv.DictReader(open(a.epc_csv,encoding='utf-8-sig')):
  key=r.get('UPRN') or r.get('BUILDING_REFERENCE_NUMBER');date=r.get('LODGEMENT_DATE','')
  if not key or not date or date<(datetime.date.today()-datetime.timedelta(days=3652)).isoformat():continue
  if key not in latest or date>latest[key]['LODGEMENT_DATE']:latest[key]=r
 epc=collections.defaultdict(list)
 for r in latest.values():
  pc=re.sub(r'\s','',r.get('POSTCODE','').upper())
  if pc not in current:continue
  try:score=float(r['CURRENT_ENERGY_EFFICIENCY'])
  except (KeyError,ValueError):continue
  if not 0<score<=100:continue
  for c in codes(pc):epc[c].append(score)
 for c,values in epc.items():
  if len(values)>=10:put(c,'epc_score',sum(values)/len(values))
 metric('epc_score','Average EPC efficiency','Housing','score',[20,40,60,80,100],'https://get-energy-performance-data.communities.gov.uk/','Imported certificate snapshot','Latest certificate per property identifier, certificates within ten years, at least ten matched homes. Not all homes have an EPC. No addresses are published.')
else:status.append({'id':'epc_score','title':'Energy efficiency / EPC','status':'access-required','reason':'Official bulk access needs GOV.UK One Login. Import a permitted CSV using --epc-csv; certificates must be deduplicated per property. No EPC values have been invented.','url':'https://get-energy-performance-data.communities.gov.uk/'})
if a.planning_csv:
 observed=collections.Counter();seen_apps=set();since=(datetime.date.today()-datetime.timedelta(days=365)).isoformat()
 for r in csv.DictReader(open(a.planning_csv,encoding='utf-8-sig')):
  ref=r.get('reference','');date=r.get('submitted','')[:10];pc=re.sub(r'\s','',r.get('postcode','').upper());app=(r.get('authority',''),ref)
  if not ref or app in seen_apps or date<since or pc not in current:continue
  seen_apps.add(app)
  for c in codes(pc):observed[c]+=1
 for c,n in observed.items():put(c,'planning_count',n)
 metric('planning_count','Observed planning applications','Housing','applications',[0,5,20,100,500],'https://www.gov.uk/search-register-planning-decisions',since+' to '+datetime.date.today().isoformat(),'Matched applications from a supplied permitted council export. Coverage depends on the source authority and export period. Not a national total; absent records remain unavailable.',0)
else:
 status.append({'id':'planning','title':'Planning activity','status':'source-gap','reason':'The national Planning Data planning-application dataset currently reports no applications. A council feed is required; absent data is not zero activity.','url':'https://www.gov.uk/search-register-planning-decisions'})
output={'schema':1,'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'metrics':metrics,'regions':regions,'availability':status,'geography':{'source':geog['source'],'rows':geog['sourceRows'],'method':'Census LSOA totals apportioned to postal areas by current matched postcode shares. Original map geometry and postcode provenance unchanged.'},'crime':crime_meta,'licence':'Census, ONSPD, Police.uk: OGL v3.0. Contains ONS, OS, Royal Mail and GeoPlace data. Ofcom coverage under Ofcom reuse terms.'}
(DATA/'community.json.tmp').write_text(json.dumps(output,separators=(',',':')));(DATA/'community.json.tmp').replace(DATA/'community.json');print('Community measures:',len(metrics),'metrics,',len(regions),'regions',flush=True)
if not a.skip_crime:
 import subprocess;subprocess.run(['python3',str(ROOT/'pipeline/crime-coverage.py')],check=True)
