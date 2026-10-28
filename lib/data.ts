// Data-access layer for the static postcode dataset produced by the pipeline.
// Nothing is loaded up front except a small index; boundary and postcode
// chunks are fetched on demand (by viewport or search) and cached in memory.

import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { APP_CONFIG } from '@/config/app';
import { areaOf, compareCodes, districtOf } from './postcode';

export type BBox = [number, number, number, number]; // west, south, east, north

export interface Manifest {
  schema: number;
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
  coverage: { outline: 'all'; detailAreas: string[]; includesNorthernIreland: boolean; note: string | null };
  counts: { postcodes: number; areas: number; districts: number; sectors: number; detailPostcodes: number };
}

export interface AreaInfo { c: string; name: string | null; n: number; nd: number; km2: number | null; b: BBox; l: [number, number]; detail: boolean }
export interface DistrictInfo { c: string; n: number; ns: number; km2: number | null; b: BBox; l: [number, number] }

export interface RegionProps { c: string; n: number; name?: string | null; nd?: number; ns?: number; km2?: number; b?: BBox; label?: boolean; a?: string; d?: string }
export type RegionFeature = Feature<Polygon | MultiPolygon | Point, RegionProps>;
export type RegionCollection = FeatureCollection<Polygon | MultiPolygon | Point, RegionProps>;

export interface UnitProps { c: string; s: string; d: string; q?: number }
export type UnitFeature = Feature<Point, UnitProps>;

export interface UnitRecord { postcode: string; lng: number; lat: number; quality?: number }

export class DataError extends Error {}

const UNIT_CACHE_LIMIT = 250;

export class PostcodeData {
  manifest!: Manifest;
  areas = new Map<string, AreaInfo>();
  districts = new Map<string, DistrictInfo>();
  districtsByArea = new Map<string, DistrictInfo[]>();
  areasCollection!: RegionCollection;

  private json = new Map<string, Promise<unknown>>();
  private units = new Map<string, Promise<UnitFeature[]>>();

  constructor(private base = APP_CONFIG.dataBaseUrl) {}

  async init(): Promise<void> {
    const [manifest, index, areas] = await Promise.all([
      this.fetchJson<Manifest>('manifest.json'),
      this.fetchJson<{ areas: AreaInfo[]; districts: DistrictInfo[] }>('index.json'),
      this.fetchJson<RegionCollection>('areas.geojson'),
    ]);
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
        return r.json();
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

  loadDistricts(area: string): Promise<RegionCollection> {
    return this.fetchJson<RegionCollection>(`districts/${area}.geojson`);
  }

  /** Sector boundaries exist only for detail areas; resolves null elsewhere. */
  async loadSectors(area: string): Promise<RegionCollection | null> {
    if (!this.isDetailArea(area)) return null;
    return this.fetchJson<RegionCollection>(`sectors/${area}.geojson`);
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
        return r.json() as Promise<{ d: string; u: [string, number, number, number?][] }>;
      })
      .then(({ d, u }) =>
        u.map(([inward, lng, lat, q]) => ({
          type: 'Feature' as const,
          properties: { c: `${d} ${inward}`, s: `${d} ${inward[0]}`, d, ...(q != null ? { q } : {}) },
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
    return { postcode, lng, lat, quality: f.properties.q };
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
