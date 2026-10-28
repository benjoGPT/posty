import { setMetricDefinitions, type CommunityData } from './metrics';
// Data-access layer for the static postcode dataset produced by the pipeline.
// Nothing is loaded up front except a small index; boundary and postcode
// chunks are fetched on demand (by viewport or search) and cached in memory.

import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { APP_CONFIG } from '@/config/app';
import { areaOf, compareCodes, districtOf } from './postcode';

export type BBox = [number, number, number, number]; // west, south, east, north

export interface Manifest {
  schema: number;
  regionalShards?: boolean;
  generatedAt: string;
  source: {
    id: string;
    name: string;
    release: string;
    url: string;
    licence: string;
    attribution: string[];
    verified: boolean;
    warning?: string;
  };
  boundaries: { method: string; description: string; coastline: string };
  admin?: { method: 'onspd' | 'boundaries'; councils: string; borders: string; attribution: string };
  prices?: { source: string; attribution: string; note: string; latestMonth: number; from12: number; from36: number; stops?: number[]; minSales?: number } | null;
  extras?: { urbanRural: boolean; introduced: { newSince: number; latest: number } | null };
  coverage: { outline: 'all'; detailAreas: string[]; includesNorthernIreland: boolean; note: string | null };
  counts: { postcodes: number; areas: number; districts: number; sectors: number; detailPostcodes: number };
}

/** Postcode counts by council and by country (largest first). */
export interface AdminBreakdown { councils: [string, number][]; countries: [string, number][] }
/**
 * House prices (HM Land Registry): sales and median price over 12 and 36
 * months, by property type (D/S/T/F) and by year — each as [sales, median].
 */
export interface PriceSummary { n12: number; m12: number | null; n36: number; m36: number | null; type: Record<string, [number, number]>; year: Record<string, [number, number]> }
/** Optional extras: share of postcodes that are urban (0–1) and count of recently introduced postcodes. */
export interface InsightProps { im?: number; imn?: number; pg?: number; pgn?: [number, number] }
export interface Insights { imd: { source: string; note: string }; growth: { baseYear: number; year: number; note: string }; groups: Record<string, InsightProps> }
interface RegionExtras extends InsightProps { pp?: PriceSummary; ur?: number; nw?: number }
export interface AreaInfo extends RegionExtras { c: string; name: string | null; n: number; nd: number; km2: number | null; b: BBox; l: [number, number]; detail: boolean; adm?: AdminBreakdown }
export interface DistrictInfo extends RegionExtras { c: string; n: number; ns: number; km2: number | null; b: BBox; l: [number, number]; adm?: AdminBreakdown }

export interface RegionProps extends RegionExtras { c: string; n: number; name?: string | null; nd?: number; ns?: number; km2?: number; b?: BBox; label?: boolean; a?: string; d?: string; pm?: number }
export type RegionFeature = Feature<Polygon | MultiPolygon | Point, RegionProps>;
export type RegionCollection = FeatureCollection<Polygon | MultiPolygon | Point, RegionProps>;

/** p = [sales in 36 months, median price]; i = month introduced (YYYYMM). */
export interface UnitProps { c: string; s: string; d: string; q?: number; p?: [number, number]; i?: number }
export type UnitFeature = Feature<Point, UnitProps>;

export interface UnitRecord { postcode: string; lng: number; lat: number; quality?: number; sales?: [number, number]; introduced?: number }

/** Nearby places (Overture Maps / OpenStreetMap) for a detail area. */
export interface PlaceSets {
  postboxes: [number, number, string | null, string | null][]; // lng, lat, Royal Mail ref, collection times
  stops: [number, number, string | null][];
  stations: [number, number, string | null, 'rail' | 'heritage' | 'bus'][];
  schools: [number, number, string, string][]; // name, phase
  supermarkets: [number, number, string][];
  pharmacies: [number, number, string][];
  parks: [number, number, string][];
  gps: [number, number, string][];
}
export type PlaceKind = keyof PlaceSets;
export interface NearbyPlace { kind: PlaceKind; name: string | null; lng: number; lat: number; metres: number; info?: string | null; ref?: string | null }
export interface PlacesMeta { source: string; areas: string[]; counts: Record<PlaceKind, number>; attribution: string; notes: Record<string, string>; generated: string }

export class DataError extends Error {}

const UNIT_CACHE_LIMIT = 250;

export class PostcodeData {
  manifest!: Manifest;
  insights: Insights | null = null;
  community: CommunityData | null = null;
  regionalFailures = new Set<string>();
  areas = new Map<string, AreaInfo>();
  districts = new Map<string, DistrictInfo>();
  districtsByArea = new Map<string, DistrictInfo[]>();
  areasCollection!: RegionCollection;

  private json = new Map<string, Promise<unknown>>();
  private units = new Map<string, Promise<UnitFeature[]>>();

  constructor(private base = APP_CONFIG.dataBaseUrl) {}

  /** Absolute base URL of the data files (MapLibre needs absolute URLs). */
  get baseUrl(): string {
    return this.base.startsWith('http') ? this.base : `${window.location.origin}${this.base}`;
  }

  async init(): Promise<void> {
    const [manifest, index, areas, insights, community] = await Promise.all([
      this.fetchJson<Manifest>('manifest.json'),
      this.fetchJson<{ areas: AreaInfo[]; districts: DistrictInfo[] }>('index.json'),
      this.fetchJson<RegionCollection>('areas.geojson'),
      this.fetchJson<Insights>('insights.json').catch(() => null),
      this.fetchJson<CommunityData>('community.json').catch(() => null),
    ]);
    this.insights = insights;
    this.community = community;
    setMetricDefinitions(community?.metrics ?? []);
    const enrich = (p: {c:string}) => { const values=community?.regions[p.c]; if(values)Object.assign(p,Object.fromEntries(Object.entries(values).filter(([,v])=>Number.isFinite(v)).map(([k,v])=>['mx_'+k,v]))); };
    for(const g of [...index.areas,...index.districts])enrich(g);
    for(const f of areas.features)enrich(f.properties);
    for (const g of [...index.areas, ...index.districts]) Object.assign(g, insights?.groups[g.c] ?? {});
    for (const f of areas.features) Object.assign(f.properties, insights?.groups[f.properties.c] ?? {});
    this.manifest = manifest;
    this.areasCollection = areas;
    for (const a of index.areas) this.areas.set(a.c, a);
    for (const d of index.districts) {
      this.districts.set(d.c, d);
      const a = areaOf(d.c);
      if (!this.districtsByArea.has(a)) this.districtsByArea.set(a, []);
      this.districtsByArea.get(a)!.push(d);
    }
  }

  private fetchJson<T>(path: string): Promise<T> {
    let p = this.json.get(path);
    if (!p) {
      p = fetch(`${this.base}/${path}`).then((r) => {
        if (!r.ok) throw new DataError(`Couldn't load ${path} (HTTP ${r.status})`);
        return r.json().then((value) => {
          if (this.insights && path !== 'insights.json') {
            const attach = (p: { c: string }) => Object.assign(p, this.insights?.groups[p.c] ?? {});
            if (value.features) for (const f of value.features) if (f.properties?.c) attach(f.properties);
            if (value.areas) value.areas.forEach(attach);
            if (value.districts) value.districts.forEach(attach);
          }
          if (this.community && value.features) for(const f of value.features) {
            const values=this.community.regions[f.properties?.c];
            if(values)Object.assign(f.properties,Object.fromEntries(Object.entries(values).filter(([,v])=>Number.isFinite(v)).map(([k,v])=>['mx_'+k,v])));
          }
          return value;
        });
      });
      // Forget failures so a later attempt can retry.
      p.catch(() => this.json.delete(path));
      this.json.set(path, p);
    }
    return p as Promise<T>;
  }

  isDetailArea(area: string): boolean {
    return this.areas.get(area)?.detail ?? false;
  }

  private async loadRegionStats(area: string): Promise<void> {
    if (!this.manifest.regionalShards) return;
    const stats = await this.fetchJson<{community: Record<string,Record<string,number>>; insights: Record<string,InsightProps>; details: Record<string,RegionExtras & {adm?: AdminBreakdown}>}>(`region-stats/${area}.json`);
    this.regionalFailures.delete(area);
    if(this.community) Object.assign(this.community.regions,stats.community);
    if(this.insights) Object.assign(this.insights.groups,stats.insights);
    for(const [code,detail] of Object.entries(stats.details)) { const d=this.districts.get(code); if(d)Object.assign(d,detail,stats.insights[code]??{}); }
  }

  private enrichFeatures(fc: RegionCollection): RegionCollection {
    for(const f of fc.features){
      const values=this.community?.regions[f.properties.c];
      if(values)Object.assign(f.properties,Object.fromEntries(Object.entries(values).map(([k,v])=>['mx_'+k,v])));
      Object.assign(f.properties,this.insights?.groups[f.properties.c]??{});
    }
    return fc;
  }

  async loadDistricts(area: string): Promise<RegionCollection> {
    const [fc] = await Promise.all([this.fetchJson<RegionCollection>(`districts/${area}.geojson`),this.loadRegionStats(area).catch(()=>{this.regionalFailures.add(area);})]);
    return this.enrichFeatures(fc);
  }

  /** Sector geometry is local detail; its statistical chunk is shared with districts. */
  async loadSectors(area: string): Promise<RegionCollection | null> {
    if (!this.isDetailArea(area)) return null;
    const [fc, values] = await Promise.all([
      this.fetchJson<RegionCollection>(`sectors/${area}.geojson`),
      this.manifest.regionalShards ? this.loadRegionStats(area).then(()=>null).catch(()=>{this.regionalFailures.add(area);return null;}) : this.community ? this.fetchJson<Record<string,Record<string,number>>>(`community/sectors/${area}.json`).catch(()=>null) : Promise.resolve(null),
    ]);
    if(values&&this.community)Object.assign(this.community.regions,values);
    return this.enrichFeatures(fc);
  }

  /** Postcode unit points for a district (detail areas only). */
  loadUnits(district: string): Promise<UnitFeature[]> {
    const cached = this.units.get(district);
    if (cached) {
      // Refresh recency for the LRU.
      this.units.delete(district);
      this.units.set(district, cached);
      return cached;
    }
    if (!this.isDetailArea(areaOf(district)) || !this.districts.has(district)) return Promise.resolve([]);
    const p = fetch(`${this.base}/units/${district}.json`)
      .then((r) => {
        if (!r.ok) throw new DataError(`Couldn't load postcodes for ${district} (HTTP ${r.status})`);
        return r.json() as Promise<{ d: string; u: [string, number, number, number?][]; p?: Record<string, [number, number]>; i?: Record<string, number> }>;
      })
      .then(({ d, u, p, i }) =>
        u.map(([inward, lng, lat, q]) => ({
          type: 'Feature' as const,
          properties: {
            c: `${d} ${inward}`,
            s: `${d} ${inward[0]}`,
            d,
            ...(q != null ? { q } : {}),
            ...(p?.[inward] ? { p: p[inward] } : {}),
            ...(i?.[inward] ? { i: i[inward] } : {}),
          },
          geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        })),
      );
    p.catch(() => this.units.delete(district));
    this.units.set(district, p);
    while (this.units.size > UNIT_CACHE_LIMIT) this.units.delete(this.units.keys().next().value!);
    return p;
  }

  /** Looks a full postcode up in the local dataset. Resolves null if it isn't there. */
  async findUnit(postcode: string): Promise<UnitRecord | null> {
    const units = await this.loadUnits(districtOf(postcode));
    const f = units.find((u) => u.properties.c === postcode);
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { postcode, lng, lat, quality: f.properties.q, sales: f.properties.p, introduced: f.properties.i };
  }

  /** Places metadata, or null when the places step hasn't been run. */
  placesMeta(): Promise<PlacesMeta | null> {
    return this.fetchJson<PlacesMeta>('places/meta.json').catch(() => null);
  }

  /** Places for a detail area (null where none were built). */
  loadPlaces(area: string): Promise<PlaceSets | null> {
    if (!this.isDetailArea(area)) return Promise.resolve(null);
    return this.fetchJson<PlaceSets>(`places/${area}.json`).catch(() => null);
  }

  /** Places around a point, nearest first, from the areas within ~3 km. */
  async nearbyPlaces(lng: number, lat: number): Promise<Record<PlaceKind, NearbyPlace[]> | null> {
    const pad = 0.04;
    const areas = this.areasInBounds([lng - pad, lat - pad, lng + pad, lat + pad]).filter((a) => a.detail);
    const sets = (await Promise.all(areas.map((a) => this.loadPlaces(a.c)))).filter((x): x is PlaceSets => !!x);
    if (!sets.length) return null;
    const near = <T extends [number, number, ...unknown[]]>(rows: T[], kind: PlaceKind, map: (r: T) => Omit<NearbyPlace, 'kind' | 'lng' | 'lat' | 'metres'>, n: number) =>
      rows
        .map((r) => ({ kind, lng: r[0], lat: r[1], metres: haversine(lat, lng, r[1], r[0]), ...map(r) }))
        .sort((a, b) => a.metres - b.metres)
        .slice(0, n);
    const all = <K extends PlaceKind>(k: K): PlaceSets[K] => sets.flatMap((s) => (s[k] ?? []) as unknown[]) as PlaceSets[K];
    return {
      postboxes: near(all('postboxes'), 'postboxes', (r) => ({ name: null, ref: r[2], info: r[3] }), 2),
      stops: near(all('stops'), 'stops', (r) => ({ name: r[2] }), 1),
      stations: near(all('stations'), 'stations', (r) => ({ name: r[2], info: r[3] }), 3),
      schools: near(all('schools'), 'schools', (r) => ({ name: r[2], info: r[3] }), 3),
      supermarkets: near(all('supermarkets'), 'supermarkets', (r) => ({name:r[2]}), 3),
      pharmacies: near(all('pharmacies'), 'pharmacies', (r) => ({name:r[2]}), 3),
      parks: near(all('parks'), 'parks', (r) => ({name:r[2],info:'Mapped centre, not an entrance'}), 3),
      gps: near(all('gps'), 'gps', (r) => ({ name: r[2] }), 2),
    };
  }

  /**
   * Nearest postcodes to a point from local detail data (empty outside detail
   * coverage). Distances in metres.
   */
  async nearestUnits(lng: number, lat: number, count = 1, exclude?: string): Promise<(UnitRecord & { metres: number })[]> {
    const pad = 0.03; // ~2–3 km
    const box: BBox = [lng - pad, lat - pad, lng + pad, lat + pad];
    const districts = this.districtsInBounds(box, true);
    if (!districts.length) return [];
    const all = (await Promise.all(districts.map((d) => this.loadUnits(d.c).catch(() => [])))).flat();
    return all
      .filter((u) => u.properties.c !== exclude)
      .map((u) => {
        const [x, y] = u.geometry.coordinates;
        return { postcode: u.properties.c, lng: x, lat: y, quality: u.properties.q, metres: haversine(lat, lng, y, x) };
      })
      .sort((a, b) => a.metres - b.metres)
      .slice(0, count);
  }

  areasInBounds(b: BBox): AreaInfo[] {
    return [...this.areas.values()].filter((a) => intersects(a.b, b));
  }

  districtsInBounds(b: BBox, onlyDetail = false): DistrictInfo[] {
    const out: DistrictInfo[] = [];
    for (const a of this.areasInBounds(b)) {
      if (onlyDetail && !a.detail) continue;
      for (const d of this.districtsByArea.get(a.c) ?? []) if (intersects(d.b, b)) out.push(d);
    }
    return out;
  }

  sortedDistricts(area: string): DistrictInfo[] {
    return [...(this.districtsByArea.get(area) ?? [])].sort((a, b) => compareCodes(a.c, b.c));
  }
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

export function intersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function containsPoint(b: BBox, [x, y]: [number, number]): boolean {
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
}

function inRing([x, y]: number[], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon for the (multi)polygons in our collections. */
export function featureContains(f: RegionFeature, pt: [number, number]): boolean {
  const g = f.geometry;
  if (g.type === 'Point') return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}
