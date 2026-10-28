"""Mask postal crime measures where a territorial police force has missing months.
Also stops BTP-only records making Greater Manchester / Scotland look safe.
"""
import collections,csv,io,json,pathlib,re,zipfile,hashlib
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'public/data';RAW=ROOT/'raw';cache=RAW/'derived/region-police-forces.json';current={re.sub(r'\s','',x) for x in (RAW/'derived/current-postcodes.txt').read_text().splitlines()}
cache=RAW/'derived'/('region-police-forces-'+hashlib.sha256('\n'.join(sorted(current)).encode()).hexdigest()[:12]+'.json')
if not cache.exists():
 z=zipfile.ZipFile(RAW/'onspd-geography.zip');n=next(n for n in z.namelist() if '/PFA Police Force' in n and n.endswith('.csv'));names={r['PFA23CD']:r['PFA23NM'] for r in csv.DictReader(io.TextIOWrapper(z.open(n),encoding='utf-8-sig'))};out=collections.defaultdict(set)
 for name in z.namelist():
  if '/multi_csv/' not in name or not name.endswith('.csv'):continue
  for r in csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig')):
   pc=re.sub(r'\s','',r['pcds'])
   if pc not in current or r.get('doterm') or pc.startswith('BT'):continue
   d=pc[:-3];m=re.match('[A-Z]+',d)
   if not m:continue
   force=names.get(r['pfa23cd'],'Unknown').lower().replace('&','and').replace('metropolitan police','metropolitan').replace('london, city of','city of london');force=re.sub('[^a-z]+','-',force).strip('-')
   for c in (m[0],d,d+' '+pc[-3]):out[c].add(force)
 cache.write_text(json.dumps({c:sorted(v) for c,v in out.items()},separators=(',',':')))
force_by_region=json.loads(cache.read_text());data=json.loads((DATA/'community.json').read_text());months=data['crime']['months'];files=data['crime']['forcesByMonth'];masked=[];trendmasked=[]
for code,values in data['regions'].items():
 forces=force_by_region.get(code,[])
 complete=bool(forces) and all(set(forces)<=set(files[m]) for m in months[-12:])
 if not complete:
  for key in list(values):
   if key.startswith(('crime_','burglary_','vehicle_','theft_','asb_')):del values[key]
  masked.append(code)
 elif not all(set(forces)<=set(files[m]) for m in months):values.pop('crime_change',None);trendmasked.append(code)
data['crime']['maskedRegions']=masked;data['crime']['maskedTrends']=trendmasked;data['crime']['coverageRule']='Every territorial force associated with current postcode records must supply all 12 months (24 for trends). BTP is excluded from comparisons. Source locations and postal boundaries remain approximate.'
for m in data['metrics']:
 if m['topic']=='Safety':m['note']+=' Regions with territorial-force gaps are masked. British Transport Police records are excluded for period consistency.'
(DATA/'community.json').write_text(json.dumps(data,separators=(',',':')));print('Crime coverage masked',len(masked),'regions; trend gaps',len(trendmasked))
