/** Public Police.uk records. Month resolution and anonymised coordinates only. */
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { featureContains, type PostcodeData, type RegionFeature } from './data';
import { areaOf, districtOf } from './postcode';
import type { Selection } from './search';
import type { NamedTarget } from './namedSearch';

export interface CrimeRecord {
  id: number; persistent_id: string; category: string; month: string;
  location: { latitude: string; longitude: string; street: { id: number; name: string } };
  location_type: string; location_subtype: string; context: string;
  outcome_status: { category: string; date: string } | null;
}
export interface CrimeCoverage {
  months: string[]; forcesByMonth: Record<string,string[]>; regions: Record<string,string[]>; source: string;
}
export interface CrimeScope {
  label: string; centre: [number,number]; code?: string;
  boundary?: Feature<Polygon|MultiPolygon>;
  box?: [number,number,number,number];
  largeRegion?: boolean;
}
const API = 'https://data.police.uk/api';
const cache = new Map<string,unknown>();
export const crimeLabel = (value: string) => value === 'violent-crime' ? 'Violence and sexual offences' : value === 'criminal-damage-arson' ? 'Criminal damage and arson' : value === 'anti-social-behaviour' ? 'Anti-social behaviour' : value.split('-').map((s,i)=>i?s:s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
export const monthLabel = (month: string) => /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}) : month;
export const forceLabel = (force: string) => force.split('-').map(w=>w==='and'?'and':w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(cache.has(url))return cache.get(url) as T;
  const control=new AbortController();const abort=()=>control.abort();signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>control.abort(),20000);
  try {
    const r=await fetch(url,{signal:control.signal});
    if(!r.ok)throw new Error(r.status===503?'This area has too many records for Police.uk to return. Search a street or postcode, then use the 1 mile view.':r.status===429?'Police.uk is busy. Wait a moment, then retry.':`Police.uk could not return records (HTTP ${r.status}). Please retry.`);
    const value=await r.json() as T;cache.set(url,value);while(cache.size>16)cache.delete(cache.keys().next().value!);return value;
  } catch(e) {if(control.signal.aborted&&!signal?.aborted)throw new Error('Police.uk took too long to respond. Please retry.');throw e;}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
export async function crimeMonths(signal?: AbortSignal): Promise<string[]> {
  const rows=await json<{date:string}[]>(`${API}/crimes-street-dates`,signal);
  if(!Array.isArray(rows))throw new Error('Police.uk returned an unexpected availability response.');
  const months=[...new Set(rows.map(r=>r.date).filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort().reverse();
  if(!months.length)throw new Error('Police.uk has no published months available.');return months;
}
export const loadCrimeCoverage = (base:string,signal?:AbortSignal) => json<CrimeCoverage>(`${base}/crime-coverage.json`,signal);
export function coverageGaps(coverage:CrimeCoverage,code:string,months:string[]): {force:string;months:string[]}[] {
  return (coverage.regions[code]??[]).flatMap(force=>{const missing=months.filter(m=>coverage.forcesByMonth[m]&&!coverage.forcesByMonth[m].includes(force));return missing.length?[{force,months:missing}]:[];});
}
export function recordsUrl(scope:CrimeScope,month:string):string {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose a published month.');
  if(!scope.centre.every(Number.isFinite)||scope.centre[0]<-9||scope.centre[0]>3||scope.centre[1]<49||scope.centre[1]>61)throw new Error('Choose a location in the UK.');
  const p=new URLSearchParams({date:month});
  if(scope.box){const [w,s,e,n]=scope.box;p.set('poly',`${s},${w}:${s},${e}:${n},${e}:${n},${w}`);}
  else{p.set('lat',String(scope.centre[1]));p.set('lng',String(scope.centre[0]));}
  return `${API}/crimes-street/all-crime?${p}`;
}
export function filterRecords(rows:CrimeRecord[],scope:CrimeScope):CrimeRecord[] {
  const seen=new Set<string>();
  return rows.filter(r=>{
    const lng=Number(r.location?.longitude),lat=Number(r.location?.latitude);
    if(!r.location||!r.location.longitude||!r.location.latitude||!Number.isFinite(lng)||!Number.isFinite(lat)||lng< -9||lng>3||lat<49||lat>61)return false;
    if(scope.boundary&&!featureContains(scope.boundary as RegionFeature,[lng,lat]))return false;
    // ASB has no persistent ID. Its distinct API IDs must be retained, even at one location.
    const key=r.persistent_id?`${r.month}:${r.persistent_id}`:`${r.month}:${r.id}`;
    if(seen.has(key))return false;seen.add(key);return true;
  }).sort((a,b)=>a.category.localeCompare(b.category)||a.location.street.name.localeCompare(b.location.street.name)||a.id-b.id);
}
export async function crimeRecords(scope:CrimeScope,month:string,signal?:AbortSignal):Promise<CrimeRecord[]> {
  const rows=await json<CrimeRecord[]>(recordsUrl(scope,month),signal);
  if(!Array.isArray(rows))throw new Error('Police.uk returned an unexpected record response.');
  if(rows.some(r=>r.month!==month))throw new Error('Police.uk returned records for a different month. Please retry.');
  return filterRecords(rows,scope);
}
export function centreScope(data:PostcodeData,centre:[number,number],label='map centre'):CrimeScope {
  const region=data.areasCollection.features.find(f=>!f.properties.label&&featureContains(f,centre));
  return {label:`Within 1 mile of ${label}`,centre,code:region?.properties.c};
}
export async function selectedCrimeScope(data:PostcodeData,selection:Selection|null,named:NamedTarget|null,centre:[number,number]):Promise<CrimeScope>{
  if(named)return centreScope(data,[named.lng,named.lat],named.title);
  if(!selection)return centreScope(data,centre);
  if(selection.kind==='unit')return {...centreScope(data,[selection.lng,selection.lat],selection.code),code:districtOf(selection.code)};
  const code=selection.code;
  const fc=selection.kind==='area'?data.areasCollection:selection.kind==='district'?await data.loadDistricts(areaOf(code)):await data.loadSectors(areaOf(code));
  const f=fc?.features.find(f=>f.properties.c===code&&!f.properties.label&&f.geometry.type!=='Point');
  if(!f||f.geometry.type==='Point')throw new Error('No boundary is available here. Search a street or postcode, or use the map centre.');
  const box=f.properties.b??(selection.kind==='area'?data.areas.get(code)?.b:data.districts.get(code)?.b);
  if(!box)throw new Error('This boundary has no usable extent. Use the map centre instead.');
  const [w,s,e,n]=box;const middle:[number,number]=[(w+e)/2,(s+n)/2];
  const km2=(e-w)*111.32*Math.cos(middle[1]*Math.PI/180)*(n-s)*111.32;
  if(km2>500)return {label:`Within 1 mile of ${code} centre`,centre:middle,code,largeRegion:true};
  return {label:`${code} · approximate postcode boundary`,centre:middle,code,boundary:f as Feature<Polygon|MultiPolygon>,box};
}
