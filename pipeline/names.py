"""Self-host OS Open Names. Search-only gzip buckets, fetched on demand, no external query service."""
import csv,datetime,gzip,hashlib,io,json,pathlib,re,shutil,unicodedata,urllib.request,zipfile
from pyproj import Transformer
ROOT=pathlib.Path(__file__).resolve().parent.parent;raw=ROOT/'raw';out=ROOT/'public/data/search';out.mkdir(parents=True,exist_ok=True)
u='https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect';p=raw/'open-names.zip'
if not p.exists():
 with urllib.request.urlopen(u,timeout=180) as src,p.with_suffix('.part').open('wb') as dst:shutil.copyfileobj(src,dst)
 p.with_suffix('.part').replace(p)
def norm(s):return re.sub('[^a-z0-9 ]',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).split()
def bucket(s):
 h=0
 for c in s[:3]:h=(h*31+ord(c))&0xffffffff
 return h%128
z=zipfile.ZipFile(p);project=Transformer.from_crs(27700,4326,always_xy=True);buckets=[[] for _ in range(128)];count=0
for name in z.namelist():
 if not name.startswith('Data/') or not name.endswith('.csv'):continue
 rows=[];positions=[]
 for r in csv.reader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig')):
  if r[6]!='populatedPlace' and not (r[6]=='transportNetwork' and ('Road' in r[7] or r[7]=='Railway Station')):continue
  if not r[2] or not r[8] or not r[9]:continue
  context=', '.join(dict.fromkeys(x for x in [r[18],r[21] or r[24],r[16]] if x and x!=r[2]));kind='street' if 'Road' in r[7] else 'place'
  rows.append([r[0],r[2],r[4],context,kind,r[7],None,None]);positions.append((float(r[8]),float(r[9])))
 if positions:
  lng,lat=project.transform([x for x,y in positions],[y for x,y in positions])
  for row,x,y in zip(rows,lng,lat):
   row[6]=round(x,5);row[7]=round(y,5);count+=1
   keys={bucket(' '.join(norm(n))) for n in [row[1],row[2]] if norm(n)}
   for key in keys:buckets[key].append(row)
for i,rows in enumerate(buckets):
 content=json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode();(out/f'{i}.json.gz').write_bytes(gzip.compress(content,compresslevel=9,mtime=0))
meta={'schema':1,'buckets':128,'records':count,'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'OS Open Names','url':u,'archiveMd5':hashlib.file_digest(p.open('rb'),'md5').hexdigest(),'archiveSha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),'coverage':'Great Britain. Named places, roads and rail stations, not individual house addresses.','licence':'OS OpenData licence / OGL','attribution':['Contains OS data © Crown copyright and database rights 2026.','Contains Royal Mail data © Royal Mail copyright and database right 2026.','Contains National Statistics data © Crown copyright and database right 2026.']};(out/'meta.json').write_text(json.dumps(meta,separators=(',',':')));print('Named search',count,'records,',sum(p.stat().st_size for p in out.glob('*.gz')),'compressed bytes',flush=True)
