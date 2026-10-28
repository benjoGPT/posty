"""Reproducible English IMD 2025 postcode-sample summaries and complete-year price changes.
Uses the official MHCLG postcode join; ranks/deciles are never compared across nations.
"""
import argparse,re,csv,datetime,hashlib,io,json,pathlib,urllib.request,zipfile,collections
p=argparse.ArgumentParser();p.add_argument('--imd-zip',default='raw/imd2025-postcodes.download');p.add_argument('--current',default='raw/derived/current-postcodes.txt');p.add_argument('--data',default='public/data');a=p.parse_args();root=pathlib.Path(a.data);archive=pathlib.Path(a.imd_zip)
url='https://deprivation.communities.gov.uk/api/data-download-postcode'
if not archive.exists():
 archive.parent.mkdir(parents=True,exist_ok=True)
 with urllib.request.urlopen(url,timeout=180) as src,archive.open('wb') as dst:
  import shutil;shutil.copyfileobj(src,dst)
current={''.join(pc.split()) for pc in pathlib.Path(a.current).read_text().splitlines()};
if len(current)<500000:raise ValueError('Current postcode membership list is missing or incomplete; run data:build first')
index=json.loads((root/'index.json').read_text());manifest=json.loads((root/'manifest.json').read_text());groups={};sums=collections.defaultdict(lambda:[0,0]);seen=set()
with zipfile.ZipFile(archive) as z:
 files=[f for f in z.namelist() if f.endswith('.csv') and not f.startswith('__MACOSX/')]
 if len(files)!=1:raise ValueError('Expected exactly one postcode CSV')
 with z.open(files[0]) as raw:
  reader=csv.DictReader(io.TextIOWrapper(raw,encoding='utf-8-sig'))
  decile=next(k for k in reader.fieldnames if k.startswith('LSOA containing postcode - Index of Multiple Deprivation (IMD) Decile'))
  for row in reader:
   pc=' '.join(row['Postcode'].upper().split());compact=pc.replace(' ','');d=compact[:-3];area=re.match('[A-Z]+',d)[0]
   if compact not in current or pc in seen:continue
   seen.add(pc)
   try:v=int(row[decile])
   except (ValueError,TypeError):continue
   if not 1<=v<=10:raise ValueError('Invalid IMD decile')
   for code in (area,d,d+' '+compact[-3]):sums[code][0]+=v;sums[code][1]+=1
if len(seen)<500000:raise ValueError('Unexpectedly small postcode source')
for code,(total,n) in sums.items():groups[code]={'im':round(total/n,2),'imn':n}
# Both price years must be complete calendar years in the available window.
latest=manifest.get('prices',{}).get('latestMonth',0);year=latest//100-1;base=year-1;from_month=manifest.get('prices',{}).get('from36',999999)
def add_price(code,pp):
 if from_month>base*100+1:return
 x=pp.get('year',{}).get(str(base));y=pp.get('year',{}).get(str(year))
 if x and y and x[0]>=20 and y[0]>=20 and x[1]>0 and y[1]>0:groups.setdefault(code,{}).update(pg=round((y[1]/x[1]-1)*100,2),pgn=[x[0],y[0]])
for g in index['areas']+index['districts']:add_price(g['c'],g.get('pp',{}))
for f in (root/'sectors').glob('*.geojson'):
 for g in json.loads(f.read_text())['features']:
  if g['geometry']['type']=='Point':continue
  add_price(g['properties']['c'],g['properties'].get('pp',{}))
result={'schema':1,'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'imd':{'source':'MHCLG English Indices of Deprivation 2025, official postcode join','url':url,'licence':'Open Government Licence v3.0','sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'postcodes':len(seen),'membershipSource':manifest['source'],'note':'Mean English LSOA decile, weighted by source postcode records matched to the current map dataset. 1 most deprived, 10 least. Not a people-weighted deprivation index. England only; mixed-border regions represent their English records only. Published postcode geography can differ from current map geography.'},'growth':{'baseYear':base,'year':year,'minimumSales':20,'note':'Change in median sale price between two complete calendar years. Different properties sell each year: this is not an estimate of individual property appreciation. England and Wales only; at least 20 sales in each year.'},'groups':groups}
tmp=root/'insights.json.tmp';tmp.write_text(json.dumps(result,separators=(',',':')));tmp.replace(root/'insights.json');print('Insights:',len(groups),'regions,',len(seen),'source postcode records')
