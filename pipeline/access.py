"""Nearest mapped amenity distances from reference points, never travel times or access guarantees."""
import collections,json,math,pathlib,statistics
from shapely import points,STRtree
from pyproj import Transformer
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'public/data';d=json.loads((DATA/'community.json').read_text());index=json.loads((DATA/'index.json').read_text());sets=[json.loads((DATA/'places'/f"{a['c']}.json").read_text()) for a in index['areas'] if a['detail']];project=Transformer.from_crs(4326,27700,always_xy=True)
def xy(rows):
 if not rows:return []
 x,y=project.transform([r[0] for r in rows],[r[1] for r in rows]);return points(list(zip(x,y)))
configs=[('stations','station_distance','Nearest mapped rail station','Transport'),('stops','bus_distance','Nearest mapped bus stop','Transport'),('schools','school_distance','Nearest mapped school','Services'),('gps','gp_distance','Nearest mapped GP','Services'),('supermarkets','supermarket_distance','Nearest mapped supermarket','Services'),('pharmacies','pharmacy_distance','Nearest mapped pharmacy','Services'),('parks','green_distance','Nearest mapped green space','Environment')]
coords=[];groups=[]
for f in (DATA/'units').glob('*.json'):
 data=json.loads(f.read_text());district=data['d'];area=__import__('re').match('[A-Z]+',district)[0]
 for r in data['u']:coords.append(r[1:3]);groups.append((area,district,district+' '+r[0][0]))
pts=xy(coords)
for kind,key,title,topic in configs:
 rows=[r for s in sets for r in s.get(kind,[]) if kind!='stations' or r[3]=='rail']
 if not rows:continue
 tree=STRtree(xy(rows));near=tree.query_nearest(pts,return_distance=True,all_matches=False);acc=collections.defaultdict(list)
 for j,dist in zip(near[0][0],near[1]):
  for c in groups[int(j)]:acc[c].append(float(dist))
 for c,values in acc.items():
  if len(values)>=5:d['regions'].setdefault(c,{})[key]=round(statistics.median(values),1)
 note='Median straight-line distance from postcode reference points to the nearest mapped '+kind+'. Detail areas only. Volunteer/business listings can be incomplete; study-area edges can overstate distances. Not walking distance, travel time, capacity, accessibility or service quality.'
 if kind=='parks':note+=' Green-space points represent mapped centres, not entrances or confirmed public access.'
 d['metrics']=[m for m in d['metrics'] if m['id']!=key];d['metrics'].append(dict(id=key,title=title,topic=topic,unit='m',stops=[0,250,1000,3000,10000],source='https://www.openstreetmap.org/copyright',period='Mapped services snapshot, '+json.loads((DATA/'places/meta.json').read_text()).get('generated','')[:10],note=note,precision=0,status='available'))
 print(kind,len(rows),'features,',len(acc),'regions',flush=True)
(DATA/'community.json').write_text(json.dumps(d,separators=(',',':')))
