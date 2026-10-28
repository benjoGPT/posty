/** OS Open Names is searched locally. Queries never leave this site's data host. */
export type NamedKind = 'place' | 'street';
export interface NamedTarget { kind: NamedKind; code: string; title: string; subtitle: string; lng: number; lat: number }
export type NameRow = [string, string, string, string, NamedKind, string, number, number];
export function normaliseName(value: string): string { return value.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function nameBucket(prefix: string): number { let h=0; for(const c of prefix.slice(0,3)) h=(Math.imul(h,31)+c.charCodeAt(0))>>>0; return h%128; }
const caches = new Map<string, Promise<NameRow[]>>();
async function loadBucket(base: string, bucket: number): Promise<NameRow[]> {
  const url = `${base}/search/${bucket}.json.gz`;
  let task = caches.get(url);
  if (!task) {
    task = (async () => {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error('Street and place search data could not be loaded. Please try again.');
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const text = bytes[0] === 31 && bytes[1] === 139 ? await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
      return JSON.parse(text) as NameRow[];
    })();
    task.catch(() => caches.delete(url));
    caches.set(url, task);
    if (caches.size > 12) caches.delete(caches.keys().next().value!);
  }
  return task;
}
const normalisedRows = new WeakMap<NameRow,{name:string;alt:string;haystack:string}>();
export function rankNamed(rows: NameRow[], query: string): NamedTarget[] {
  const q = normaliseName(query), words = q.split(' ').filter(Boolean);
  const unique = new Map<string, { score: number; value: NamedTarget }>();
  for (const r of rows) {
    let normalised = normalisedRows.get(r);
    if(!normalised){const name=normaliseName(r[1]),alt=normaliseName(r[2]);normalised={name,alt,haystack:`${name} ${alt} ${normaliseName(r[3])} ${normaliseName(r[5])}`};normalisedRows.set(r,normalised);}
    const {name,alt,haystack} = normalised;
    if (!words.every(w => haystack.includes(w)) || !Number.isFinite(r[6]) || !Number.isFinite(r[7])) continue;
    const context = `${normaliseName(r[3])} ${normaliseName(r[5])}`;
    let phraseMatches = false;
    for(let start=0;start<words.length&&!phraseMatches;start++) for(let end=words.length;end>start;end--){
      const phrase=words.slice(start,end).join(' ');
      if((name.includes(phrase)||alt.includes(phrase)) && [...words.slice(0,start),...words.slice(end)].every(w=>context.includes(w))){phraseMatches=true;break;}
    }
    if(!phraseMatches)continue;
    const score = name === q || alt === q ? 100 : name.startsWith(q) || alt.startsWith(q) ? 80 : words.every(w=>name.includes(w)||alt.includes(w)) ? 60 : 40;
    const value: NamedTarget = { kind:r[4], code:r[0], title:r[1], subtitle:`${r[5]} · ${r[3]}`, lng:r[6], lat:r[7] };
    if (!unique.has(r[0]) || unique.get(r[0])!.score < score) unique.set(r[0], {score:score+(/^(City|Town)$/.test(r[5])?10:r[4]==='place'&&r[5]!=='Railway Station'?8:r[4]==='place'?1:0),value});
  }
  return [...unique.values()].sort((a,b)=>b.score-a.score||a.value.title.localeCompare(b.value.title)||a.value.subtitle.localeCompare(b.value.subtitle)).slice(0,8).map(x=>x.value);
}
export async function searchNamed(query: string, base: string, signal?: AbortSignal): Promise<NamedTarget[]> {
  if(/^\s*\d+[a-z]?\s+/i.test(query))return [];
  const words = normaliseName(query).split(' ').filter(w=>w.length>=2);
  if (!words.length || (normaliseName(query).length<3 && !/^[abm]\d{1,4}$/.test(normaliseName(query))) || signal?.aborted) return [];
  const prefixes=[normaliseName(query).slice(0,3),...words.filter(w=>w.length>=3).slice(0,4)];
  const buckets = [...new Set(prefixes.map(nameBucket))];
  const rows = (await Promise.all(buckets.map(b=>loadBucket(base,b)))).flat();
  return signal?.aborted ? [] : rankNamed(rows,query);
}
