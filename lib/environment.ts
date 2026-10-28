import {haversine} from './data';
export interface FloodAlert {description:string;severity:string;severityLevel:number;message:string;timeMessageChanged:string;floodAreaID:string}
export interface RiverStation {label:string|string[];lat:number;long:number;riverName?:string;stationReference:string;measures:RiverMeasure[]|RiverMeasure}
interface RiverMeasure {'@id'?:string;label?:string;qualifier?:string;unitName?:string;latestReading?:{value:number;dateTime:string}}
interface Envelope<T>{items:T[];meta?:{publisher?:string;licence?:string;hasFormat?:string[]}}
const ROOT='https://environment.data.gov.uk/flood-monitoring';
const cache=new Map<string,{time:number;value:unknown}>();
export async function environmentData(lng:number,lat:number,signal?:AbortSignal):Promise<{alerts:FloodAlert[];stations:RiverStation[];checked:string}>{
 const key=`${lng.toFixed(3)},${lat.toFixed(3)}`;const old=cache.get(key);if(old&&Date.now()-old.time<5*60e3)return old.value as Awaited<ReturnType<typeof environmentData>>;
 const params=new URLSearchParams({lat:String(lat),long:String(lng),dist:'10'});
 async function get<T>(path:string){const cached=cache.get('api:'+path);if(cached&&Date.now()-cached.time<5*60e3)return cached.value as T[];if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const c=new AbortController();const abort=()=>c.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,20000);try{const r=await fetch(ROOT+path,{signal:c.signal});if(!r.ok)throw new Error(`Environment Agency service unavailable (HTTP ${r.status}).`);const j=await r.json() as Envelope<T>;if(!Array.isArray(j.items))throw new Error('Unexpected Environment Agency response.');cache.set('api:'+path,{time:Date.now(),value:j.items});return j.items;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
 const [alerts,stations,readings]=await Promise.all([get<FloodAlert>('/id/floods?'+params),get<RiverStation>('/id/stations?'+params+'&parameter=level&_view=full'),get<{measure:string;value:number;dateTime:string}>('/data/readings?latest&parameter=level&_limit=10000')]);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const readingById=new Map(readings.map(r=>[r.measure.replace(/^http:/,'https:'),r]));for(const station of stations){const measures=Array.isArray(station.measures)?station.measures:[station.measures];for(const m of measures){if(!m)continue;const r=m['@id']?readingById.get(m['@id'].replace(/^http:/,'https:')):undefined;if(r)m.latestReading={value:r.value,dateTime:r.dateTime};}}
 const value={alerts:alerts.sort((a,b)=>a.severityLevel-b.severityLevel),stations:stations.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.long)&&haversine(lat,lng,s.lat,s.long)<=10000).sort((a,b)=>haversine(lat,lng,a.lat,a.long)-haversine(lat,lng,b.lat,b.long)),checked:new Date().toISOString()};cache.set(key,{time:Date.now(),value});while(cache.size>10)cache.delete(cache.keys().next().value!);return value;
}
