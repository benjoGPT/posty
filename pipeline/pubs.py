"""Build the UK Food Standards Agency Pub/bar/nightclub register."""
import collections,csv,datetime,gzip,io,json,pathlib,shutil,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent;RAW=ROOT/'raw/dashboard';OUT=ROOT/'public/data/pubs';OUT.mkdir(parents=True,exist_ok=True)
url='https://safhrsprodstorage.blob.core.windows.net/opendatafileblobstorage/FHRS_All_en-GB.csv';path=RAW/'fhrs.csv'
if not path.exists():
 req=urllib.request.Request(url,headers={'User-Agent':'Postcode Atlas data builder'});tmp=path.with_suffix('.part')
 with urllib.request.urlopen(req,timeout=300) as src,tmp.open('wb') as dst:shutil.copyfileobj(src,dst)
 tmp.replace(path)
with gzip.open(RAW/'postcode-geography.json.gz','rt',encoding='utf-8') as z:geog=json.load(z)
profiles=[]
for f in (ROOT/'public/data/profiles/geography').glob('*.json'):profiles.extend(json.load(open(f)))
names={(p['kind'],p['code']):p['name'] for p in profiles};counts=collections.Counter();records=[];nations=collections.Counter()
with path.open('rb') as raw:
 text=io.TextIOWrapper(raw,encoding='utf-8-sig',errors='replace',newline='')
 for r in csv.DictReader(text):
  if str(r.get('BusinessTypeID'))!='7843':continue
  try:lat=float(r['Latitude']);lng=float(r['Longitude'])
  except:continue
  if not (-9.5<=lng<=2.5 and 49<=lat<=61.5):continue
  pc=''.join(r.get('PostCode','').upper().split());g=geog.get(pc,{})
  nation=g.get('country') or ('Northern Ireland' if pc.startswith('BT') else 'Scotland' if r.get('SchemeType')=='FHIS' else 'England')
  nations[nation]+=1
  county=names.get(('county',g.get('county','')));town=names.get(('town',g.get('town','')))
  if g.get('county'):counts[('county',g['county'])]+=1
  if g.get('town'):counts[('town',g['town'])]+=1
  address=', '.join(x.strip() for x in [r.get('AddressLine1',''),r.get('AddressLine2',''),r.get('AddressLine3',''),r.get('AddressLine4','')] if x.strip())
  records.append({'id':r.get('FHRSID') or r.get('LocalAuthorityBusinessID'),'name':r.get('BusinessName') or 'Unnamed venue','address':address,'postcode':r.get('PostCode','').strip(),'lat':round(lat,6),'lng':round(lng,6),'rating':r.get('RatingValue') or 'Not rated','ratingDate':(r.get('RatingDate') or '')[:10] or None,'localAuthority':r.get('LocalAuthorityName') or None,'country':nation,'county':county,'town':town})
for f in (ROOT/'public/data/profiles/geography').glob('*.json'):
 rows=json.load(open(f))
 for p in rows:p['pubs']=counts[(p['kind'],p['code'])]
 f.write_text(json.dumps(rows,separators=(',',':')))
with gzip.open(OUT/'records.json.gz','wt',encoding='utf-8') as z:json.dump(records,z,separators=(',',':'))
(OUT/'meta.json').write_text(json.dumps({'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':url,'classification':'Food Standards Agency BusinessTypeID 7843, Pub/bar/nightclub','records':len(records),'byNation':nations,'mappedToProfile':sum(1 for p in records if p['county'] or p['town']),'limitations':'An establishment register, not a definitive count of every trading pub. Closures and new openings depend on local-authority updates. Coordinates and names are published by the FSA.'},indent=2))
print('Pub/bar/nightclub records:',len(records),'nations:',dict(nations),flush=True)
