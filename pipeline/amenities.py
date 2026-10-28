"""Extend existing detail-area places with mapped supermarkets, pharmacies and green spaces."""
import datetime,json,pathlib,urllib.parse,urllib.request
from shapely.geometry import shape,Point
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'public/data';RAW=ROOT/'raw';cache=RAW/'amenities-overpass.json'
idx=json.loads((DATA/'index.json').read_text());areas=[a for a in idx['areas'] if a['detail']];box=[min(a['b'][0] for a in areas),min(a['b'][1] for a in areas),max(a['b'][2] for a in areas),max(a['b'][3] for a in areas)];bbox=','.join(map(str,[box[1],box[0],box[3],box[2]]))
query=f'[out:json][timeout:180];(nwr["shop"="supermarket"]({bbox});nwr["amenity"="pharmacy"]({bbox});nwr["leisure"="park"]["access"!="private"]["access"!="no"]({bbox});nwr["landuse"="recreation_ground"]["access"!="private"]["access"!="no"]({bbox}););out center tags;'
if not cache.exists():
 req=urllib.request.Request('https://overpass-api.de/api/interpreter',data=urllib.parse.urlencode({'data':query}).encode(),headers={'User-Agent':'Posty/1.0 postcode explorer; contact https://benjobuilds.com'})
 with urllib.request.urlopen(req,timeout=200) as r:payload=json.load(r)
 if 'remark' in payload:raise ValueError('Overpass returned incomplete data: '+payload['remark'])
 cache.write_text(json.dumps(payload))
else:payload=json.loads(cache.read_text())
features=[f for f in json.loads((DATA/'areas.geojson').read_text())['features'] if f['geometry']['type'] in ['Polygon','MultiPolygon'] and f['properties']['c'] in {a['c'] for a in areas}];shapes=[(f['properties']['c'],shape(f['geometry']).buffer(0)) for f in features]
sets={a['c']:json.loads((DATA/'places'/f"{a['c']}.json").read_text()) for a in areas}
for s in sets.values():
 for k in ['supermarkets','pharmacies','parks']:s[k]=[]
seen=set()
for e in payload.get('elements',[]):
 tags=e.get('tags',{});pos=e if 'lat'in e else e.get('center',{});x,y=pos.get('lon'),pos.get('lat')
 if x is None or y is None:continue
 kind='supermarkets' if tags.get('shop')=='supermarket' else 'pharmacies' if tags.get('amenity')=='pharmacy' else 'parks';name=tags.get('name') or tags.get('brand') or ('Mapped green space' if kind=='parks' else kind[:-1].capitalize());key=(kind,name,round(x,4),round(y,4))
 if key in seen:continue
 seen.add(key);pt=Point(x,y)
 for area,poly in shapes:
  if poly.covers(pt):sets[area][kind].append([round(x,6),round(y,6),name]);break
for c,s in sets.items():(DATA/'places'/f'{c}.json').write_text(json.dumps(s,separators=(',',':')))
meta=json.loads((DATA/'places/meta.json').read_text());meta['amenitiesSource']={'source':'OpenStreetMap via Overpass','url':'https://overpass-api.de/','timestamp':payload.get('osm3s',{}).get('timestamp_osm_base'),'licence':'ODbL 1.0','attribution':'© OpenStreetMap contributors'}
for k in ['supermarkets','pharmacies','parks']:meta['counts'][k]=sum(len(s[k]) for s in sets.values());meta['notes'][k]='Mapped features, potentially incomplete; green-space points are centres, not entrances or guarantees of public access.'
(DATA/'places/meta.json').write_text(json.dumps(meta,separators=(',',':')));print({k:meta['counts'][k] for k in ['supermarkets','pharmacies','parks']})
