export type ProfileKind = 'county' | 'town';

export interface ProfileIndexRow {
  code: string;
  kind: ProfileKind;
  name: string;
  country: string;
  lat: number;
  lng: number;
  population?: number;
}

export interface AreaProfileData extends ProfileIndexRow {
  postcodes: number;
  metrics: Record<string, number>;
  pubs?: number;
  sourcePeriods?: Record<string, string>;
}

let indexTask: Promise<ProfileIndexRow[]> | undefined;
const profileCache = new Map<string, Promise<AreaProfileData>>();

export async function loadProfileIndex(base = '/data'): Promise<ProfileIndexRow[]> {
  indexTask ??= Promise.all(Array.from({length:32},(_,i)=>fetch(`${base}/profiles/index/${i}.json`).then(r=>{
    if(!r.ok)throw new Error('National area search is temporarily unavailable.');return r.json() as Promise<ProfileIndexRow[]>;
  }))).then(rows=>rows.flat());
  return indexTask;
}

export function searchProfiles(rows: ProfileIndexRow[], query: string): ProfileIndexRow[] {
  const q = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return [];
  return rows.map(row => {
    const name = row.name.toLowerCase();
    const hay = `${name} ${row.country.toLowerCase()} ${row.code.toLowerCase()}`;
    const score = row.code.toLowerCase() === q ? 120 : name === q ? 110 : name.startsWith(q) ? 90 : hay.includes(q) ? 60 : 0;
    return {row, score};
  }).filter(x => x.score).sort((a, b) => b.score - a.score || (b.row.population ?? 0) - (a.row.population ?? 0) || a.row.name.localeCompare(b.row.name)).slice(0, 10).map(x => x.row);
}

export function loadProfile(row: Pick<ProfileIndexRow, 'code' | 'kind'>, base = '/data'): Promise<AreaProfileData> {
  const key = `${row.kind}:${row.code}`;
  let task = profileCache.get(key);
  if (!task) {
    const bucket = [...row.code].reduce((n, c) => n + c.charCodeAt(0), 0) % 32;
    task = fetch(`${base}/profiles/geography/${bucket}.json`).then(async r => {
      if (!r.ok) throw new Error('This area profile could not be loaded.');
      const all = await r.json() as AreaProfileData[];
      const found = all.find(p => p.code === row.code && p.kind === row.kind);
      if (!found) throw new Error('This area profile is not available.');
      return found;
    });
    task.catch(() => profileCache.delete(key));
    profileCache.set(key, task);
  }
  return task;
}
