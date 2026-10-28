// Zoom-aware postcode levels.
//
// Rather than fixed zoom breakpoints, the point at which the map moves from
// one level to the next depends on how densely packed the postcode geography
// under the map centre is: dense city districts switch to individual postcodes
// later than sparse rural ones, so the map is never flooded with overlapping
// points or labels. All tuning values live in ZOOM_CONFIG.

export type Level = 'areas' | 'districts' | 'sectors' | 'units';
export type DetailMode = 'auto' | Level;

export const LEVELS: Level[] = ['areas', 'districts', 'sectors', 'units'];

export const LEVEL_LABELS: Record<Level, { plural: string; singular: string; short: string; example: string }> = {
  areas: { plural: 'Postcode areas', singular: 'Postcode area', short: 'Areas', example: 'SY' },
  districts: { plural: 'Postcode districts', singular: 'Postcode district', short: 'Districts', example: 'SY1' },
  sectors: { plural: 'Postcode sectors', singular: 'Postcode sector', short: 'Sectors', example: 'SY1 1' },
  units: { plural: 'Individual postcodes', singular: 'Postcode', short: 'Individual', example: 'SY1 1AD' },
};

export const ZOOM_CONFIG = {
  /**
   * Each transition is placed at the zoom where the typical spacing between
   * features of the next level reaches `targetPx` on screen, clamped to
   * [minZoom, maxZoom]. `fallback` applies when no density data is available.
   */
  districts: { targetPx: 70, minZoom: 6.6, maxZoom: 8.6, fallback: 7.4 },
  sectors: { targetPx: 90, minZoom: 9.8, maxZoom: 11.6, fallback: 10.6 },
  units: { targetPx: 14, minZoom: 12.2, maxZoom: 14.5, fallback: 13.2 },
  /** Zoom must pass a threshold by this much before the level changes back (stops flicker). */
  hysteresis: 0.15,
  /** Unit labels appear from this zoom, where collision detection allows. */
  unitLabelZoom: 15,
  /** "Very close" zoom: larger, easier-to-tap postcode points. */
  closeZoom: 16.5,
} as const;

export type Thresholds = { districts: number; sectors: number; units: number };

export const FALLBACK_THRESHOLDS: Thresholds = {
  districts: ZOOM_CONFIG.districts.fallback,
  sectors: ZOOM_CONFIG.sectors.fallback,
  units: ZOOM_CONFIG.units.fallback,
};

// Web Mercator with 512 px tiles (MapLibre): metres per pixel at the equator, zoom 0.
const METRES_PER_PX_Z0 = 78271.517;

/** Zoom at which features `spacingMetres` apart are `targetPx` apart on screen. */
function zoomForSpacing(spacingMetres: number, targetPx: number, lat: number): number {
  return Math.log2((targetPx * METRES_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / spacingMetres);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Density-adjusted thresholds.
 * @param area     the postcode area under the map centre (land km² and district count)
 * @param district the postcode district under the map centre (land km², sector and postcode counts)
 */
export function thresholdsFor(
  lat: number,
  area?: { km2: number | null; nd: number } | null,
  district?: { km2: number | null; ns: number; n: number } | null,
): Thresholds {
  const t = { ...FALLBACK_THRESHOLDS };
  if (area?.km2 && area.nd > 0) {
    const c = ZOOM_CONFIG.districts;
    t.districts = clamp(zoomForSpacing(Math.sqrt((area.km2 * 1e6) / area.nd), c.targetPx, lat), c.minZoom, c.maxZoom);
  }
  if (district?.km2) {
    const s = ZOOM_CONFIG.sectors;
    const u = ZOOM_CONFIG.units;
    if (district.ns > 0) t.sectors = clamp(zoomForSpacing(Math.sqrt((district.km2 * 1e6) / district.ns), s.targetPx, lat), s.minZoom, s.maxZoom);
    if (district.n > 0) t.units = clamp(zoomForSpacing(Math.sqrt((district.km2 * 1e6) / district.n), u.targetPx, lat), u.minZoom, u.maxZoom);
  }
  // Keep the levels in order even for unusual districts.
  t.sectors = Math.max(t.sectors, t.districts + 1);
  t.units = Math.max(t.units, t.sectors + 1);
  return t;
}

/** Picks the level for a zoom, holding the previous level within the hysteresis band. */
export function levelForZoom(zoom: number, t: Thresholds, previous?: Level): Level {
  const raw: Level = zoom >= t.units ? 'units' : zoom >= t.sectors ? 'sectors' : zoom >= t.districts ? 'districts' : 'areas';
  if (!previous || previous === raw) return raw;
  const h = ZOOM_CONFIG.hysteresis;
  const shifted: Level =
    zoom >= t.units + (previous === 'units' ? -h : h) ? 'units'
    : zoom >= t.sectors + (LEVELS.indexOf(previous) >= 2 ? -h : h) ? 'sectors'
    : zoom >= t.districts + (LEVELS.indexOf(previous) >= 1 ? -h : h) ? 'districts'
    : 'areas';
  return shifted;
}
