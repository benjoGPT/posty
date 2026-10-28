// MapLibre sources, layers and styling for the postcode levels.
//
// Each level is visible inside a zoom "window" derived from the current
// (density-adjusted) thresholds. Opacity is expressed as a zoom-interpolated
// trapezoid, so levels cross-fade continuously while zooming instead of
// snapping. Windows are recomputed when the thresholds or detail mode change.

import type { ExpressionSpecification, LayerSpecification, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import type { DetailMode, Level, Thresholds } from './levels';
import { ZOOM_CONFIG } from './levels';

export type Theme = 'light' | 'dark';
/** How region fills are coloured. */
export type ColourMode = 'colours' | 'density' | 'prices' | 'deprivation' | 'growth' | 'urban' | 'outline';
export type RegionLevel = Exclude<Level, 'units'>;
export const REGION_LEVELS: RegionLevel[] = ['areas', 'districts', 'sectors'];

export const SOURCE: Record<Level, string> = {
  areas: 'pc-areas',
  districts: 'pc-districts',
  sectors: 'pc-sectors',
  units: 'pc-units',
};

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export const PALETTE = {
  light: {
    accent: '#2563eb',
    line: '#3b6fd4',
    context: '#27427f',
    fill: '#2563eb',
    label: '#1f2a44',
    labelMuted: '#4a5873',
    halo: 'rgba(255,255,255,0.95)',
    point: '#2563eb',
    pointStroke: '#ffffff',
    selected: '#1d4ed8',
    fallbackSea: '#dfe7ef',
    fallbackLand: '#f7f6f3',
    fallbackCoast: '#c5d0dc',
    neutralLine: '#4b5565',
    countryLine: '#3a2f63',
    councilLine: '#5d6474',
    councilLabel: '#5d4f8c',
  },
  dark: {
    accent: '#7aa7ff',
    line: '#7aa7ff',
    context: '#b9cdf5',
    fill: '#7aa7ff',
    label: '#e6ecf7',
    labelMuted: '#aab6cc',
    halo: 'rgba(12,18,32,0.92)',
    point: '#6ea2ff',
    pointStroke: '#0c1220',
    selected: '#ffd27a',
    fallbackSea: '#0d1524',
    fallbackLand: '#1a2232',
    fallbackCoast: '#2c3850',
    neutralLine: '#c3cad8',
    countryLine: '#e9e3ff',
    councilLine: '#a7b0c2',
    councilLabel: '#c9bfff',
  },
} as const;

/**
 * Region colours: four hues, so neighbouring regions can always differ (the
 * pipeline assigns each region a colour index `k`). Four is also the most
 * hues from the reference palette that stay distinguishable for every pair
 * in both themes; outlines and code labels are the secondary encoding.
 */
export const REGION_COLOURS = {
  light: ['#2a78d6', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#c98500', '#d55181', '#008300'],
} as const;

/** Postcode density (postcodes per km²): single-hue blue ramp, light to dark. */
export const DENSITY_STOPS: [number, string][] = [
  [1, '#cde2fb'],
  [5, '#9ec5f4'],
  [20, '#6da7ec'],
  [80, '#3987e5'],
  [300, '#256abf'],
  [1000, '#184f95'],
  [3000, '#0d366b'],
];

/** On a dark map the ramp is reversed, so sparse areas recede into the background. */
export function densityStops(theme: Theme): [number, string][] {
  if (theme === 'light') return DENSITY_STOPS;
  const colours = DENSITY_STOPS.map(([, c]) => c).reverse();
  return DENSITY_STOPS.map(([v], i) => [v, colours[i]]);
}

/** Median house price (36 months), single-hue orange ramp light→dark (Land Registry; England & Wales). */
export const PRICE_STOPS: [number, string][] = [
  [120000, '#fde4d5'],
  [160000, '#f9c3a3'],
  [200000, '#f49a6c'],
  [250000, '#eb6834'],
  [320000, '#c9501f'],
  [420000, '#a03d14'],
  [600000, '#73290a'],
];
/** Ramp for the current theme, optionally placed at data quantiles (7 values) from the manifest. */
export function priceStops(theme: Theme, values?: number[] | null): [number, string][] {
  const colours = PRICE_STOPS.map(([, c]) => c);
  if (theme === 'dark') colours.reverse();
  const vs = values && values.length === colours.length && values.every((v, i) => i === 0 || v > values[i - 1]) ? values : PRICE_STOPS.map(([v]) => v);
  return vs.map((v, i) => [v, colours[i]]);
}

let priceValues: number[] | null = null;
/** Sets the price quantiles used by the price colour mode (from the manifest). */
export function setPriceScale(values?: number[] | null): void {
  priceValues = values ?? null;
}

/** Urban share of a region's postcodes: diverging rural (red) – mixed (grey) – urban (blue). */
export const URBAN_STOPS = {
  light: [[0, '#e34948'], [0.5, '#f0efec'], [1, '#2a78d6']] as [number, string][],
  dark: [[0, '#e66767'], [0.5, '#383835'], [1, '#3987e5']] as [number, string][],
};
export const IMD_STOPS: [number,string][] = [[1,'#54278f'],[3,'#756bb1'],[5.5,'#9e9ac8'],[8,'#cbc9e2'],[10,'#f2f0f7']];
export const GROWTH_STOPS: [number,string][] = [[-20,'#b35806'],[-10,'#e08214'],[0,'#f7f7f7'],[10,'#80cdc1'],[20,'#01665e']];
export function insightStops(mode: 'deprivation'|'growth',theme: Theme): [number,string][] {
 const stops=mode==='deprivation'?IMD_STOPS:GROWTH_STOPS;
 return stops.map(([v,c])=>[v,theme==='dark'&&mode==='deprivation'?IMD_STOPS[IMD_STOPS.length-1-stops.findIndex(s=>s[0]===v)][1]:c]);
}
export const NO_DATA = { light: '#d6d5d1', dark: '#3a3a38' };

const density: ExpressionSpecification = ['/', ['get', 'n'], ['max', ['coalesce', ['get', 'km2'], 1], 0.01]];

/** Fill colour for a mode. Always a data expression, so switching modes never changes the expression kind. */
export function fillColour(mode: ColourMode, theme: Theme): ExpressionSpecification {
  const c = PALETTE[theme];
  if (mode === 'colours') {
    const [a, b, d, e] = REGION_COLOURS[theme];
    return ['match', ['get', 'k'], 0, a, 1, b, 2, d, 3, e, c.fill];
  }
  if (mode === 'density') {
    return ['interpolate', ['linear'], ['ln', density], ...densityStops(theme).flatMap(([v, col]) => [Math.log(v), col])] as unknown as ExpressionSpecification;
  }
  if (mode === 'deprivation' || mode === 'growth') {
    const prop=mode==='deprivation'?'im':'pg';
    return ['case',['has',prop],['interpolate',['linear'],['get',prop],...insightStops(mode,theme).flat()],NO_DATA[theme]] as unknown as ExpressionSpecification;
  }
  if (mode === 'prices') {
    return ['case', ['has', 'pm'], ['interpolate', ['linear'], ['ln', ['get', 'pm']], ...priceStops(theme, priceValues).flatMap(([v, col]) => [Math.log(v), col])], NO_DATA[theme]] as unknown as ExpressionSpecification;
  }
  if (mode === 'urban') {
    return ['case', ['has', 'ur'], ['interpolate', ['linear'], ['get', 'ur'], ...URBAN_STOPS[theme].flat()], NO_DATA[theme]] as unknown as ExpressionSpecification;
  }
  return ['match', ['get', 'k'], -1, c.fill, c.fill];
}

function fillBase(mode: ColourMode, theme: Theme): ExpressionSpecification {
  if (mode === 'colours') return theme === 'dark' ? ['case', hover, 0.45, 0.3] : ['case', hover, 0.4, 0.24];
  if (mode === 'density' || mode === 'prices' || mode === 'urban' || mode === 'deprivation' || mode === 'growth') return ['case', hover, 0.8, 0.62];
  return ['case', hover, 0.13, 0.04];
}

type Win = [number, number];
type Windows = Record<Level, Win> & { context: Record<RegionLevel, Win>; districtsOutsideDetail: Win };

// Zoom range over which a level fades in (ending at its threshold) and out.
const FADE = 0.35;

/** Zoom windows for every layer group, given the thresholds and detail mode. */
export function computeWindows(t: Thresholds, mode: DetailMode): Windows {
  const inf = Infinity;
  if (mode !== 'auto') {
    const only = (l: Level): Win => (l === mode ? [-inf, inf] : [inf, inf]);
    const idx = ['areas', 'districts', 'sectors', 'units'].indexOf(mode);
    return {
      areas: only('areas'),
      districts: only('districts'),
      sectors: only('sectors'),
      units: only('units'),
      context: {
        areas: idx === 1 ? [-inf, inf] : [inf, inf],
        districts: idx >= 2 ? [-inf, inf] : [inf, inf],
        sectors: idx === 3 ? [-inf, inf] : [inf, inf],
      },
      districtsOutsideDetail: idx >= 1 ? [-inf, inf] : [inf, inf],
    };
  }
  return {
    areas: [-inf, t.districts],
    districts: [t.districts, t.sectors],
    sectors: [t.sectors, t.units],
    units: [t.units, inf],
    context: {
      areas: [t.districts, t.sectors],
      districts: [t.sectors, inf],
      sectors: [t.units, inf],
    },
    // Without sector/unit data, districts stay on screen when zooming in.
    districtsOutsideDetail: [t.districts, inf],
  };
}

function multiplier([a, b]: Win, z: number): number {
  if (a === Infinity) return 0;
  let m = 1;
  if (a > -Infinity) m = Math.min(m, Math.max(0, Math.min(1, (z - (a - FADE)) / FADE)));
  if (b < Infinity) m = Math.min(m, Math.max(0, Math.min(1, (b - z) / FADE)));
  return m;
}

type Expr = ExpressionSpecification | number;

/**
 * Builds `base` faded in/out over zoom. With several cases, the window used
 * for a feature is the first whose condition matches (last case = default).
 */
function fade(base: Expr, cases: { when?: ExpressionSpecification; win: Win }[]): Expr {
  const zs = new Set<number>();
  for (const { win: [a, b] } of cases) {
    if (a === Infinity) continue;
    if (a > -Infinity) { zs.add(a - FADE); zs.add(a); }
    if (b < Infinity) { zs.add(b - FADE); zs.add(b); }
  }
  // Every call for a given property must yield the same kind of expression
  // (zoom-only, or zoom + data): MapLibre can't switch a layer's existing
  // buffers between kinds and fails while drawing. So data-driven bases stay
  // data-driven even at multiplier 0, and the result is always a zoom curve.
  const scaled = (m: number): Expr =>
    typeof base === 'number' ? base * m : m === 1 ? base : (['*', m, base] as ExpressionSpecification);
  const at = (z: number): Expr => {
    if (cases.length === 1) return scaled(multiplier(cases[0].win, z));
    const expr: unknown[] = ['case'];
    for (const c of cases.slice(0, -1)) expr.push(c.when!, scaled(multiplier(c.win, z)));
    expr.push(scaled(multiplier(cases[cases.length - 1].win, z)));
    return expr as ExpressionSpecification;
  };
  const sorted = [...zs].filter(Number.isFinite).sort((p, q) => p - q);
  if (!sorted.length) sorted.push(0, 24);
  else if (sorted.length === 1) sorted.push(sorted[0] + 1);
  return ['interpolate', ['linear'], ['zoom'], ...sorted.flatMap((z) => [z, at(z)])] as unknown as ExpressionSpecification;
}

const isLabel: ExpressionSpecification = ['has', 'label'];
const notLabel: ExpressionSpecification = ['!', ['has', 'label']];
const hover: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const outsideDetail: ExpressionSpecification = ['==', ['get', 'detail'], false];

/** Opacity/visibility paint values that depend on the zoom windows. */
export function windowedPaint(w: Windows, mode: ColourMode, theme: Theme): { layer: string; prop: string; value: Expr }[] {
  const base = fillBase(mode, theme);
  const out: { layer: string; prop: string; value: Expr }[] = [];
  for (const l of REGION_LEVELS) {
    const cases = l === 'districts' ? [{ when: outsideDetail, win: w.districtsOutsideDetail }, { win: w.districts }] : [{ win: w[l] }];
    out.push({ layer: `${l}-fill`, prop: 'fill-opacity', value: fade(base, cases) });
    out.push({ layer: `${l}-line`, prop: 'line-opacity', value: fade(0.75, cases) });
    out.push({ layer: `${l}-label`, prop: 'text-opacity', value: fade(1, cases) });
    out.push({ layer: `${l}-context`, prop: 'line-opacity', value: fade(l === 'sectors' ? 0.35 : 0.6, [{ win: w.context[l] }]) });
  }
  // Under individual postcodes, sectors keep a light tint of their colour.
  const tint: ExpressionSpecification = mode === 'outline' ? ['*', 0, base] : ['*', 0.5, base];
  out.push({ layer: 'sectors-tint', prop: 'fill-opacity', value: fade(tint, [{ win: w.context.sectors }]) });
  out.push({ layer: 'units-circle', prop: 'circle-opacity', value: fade(1, [{ win: w.units }]) });
  out.push({ layer: 'units-circle', prop: 'circle-stroke-opacity', value: fade(1, [{ win: w.units }]) });
  out.push({ layer: 'units-label', prop: 'text-opacity', value: fade(1, [{ win: w.units }]) });
  return out;
}

/** Layers that can be hidden entirely at this zoom (saves rendering work). */
export function layerVisibility(w: Windows, zoom: number): Record<string, boolean> {
  const near = ([a, b]: Win) => a !== Infinity && zoom >= a - 1 && zoom <= b + 1;
  const vis: Record<string, boolean> = {};
  for (const l of REGION_LEVELS) {
    const main = near(w[l]) || (l === 'districts' && near(w.districtsOutsideDetail));
    vis[`${l}-fill`] = main;
    vis[`${l}-line`] = main;
    vis[`${l}-label`] = main;
    vis[`${l}-context`] = near(w.context[l]);
  }
  vis['sectors-tint'] = near(w.context.sectors);
  vis['units-circle'] = near(w.units);
  vis['units-label'] = near(w.units);
  return vis;
}

export const INTERACTIVE_LAYER: Record<Level, string> = {
  areas: 'areas-fill',
  districts: 'districts-fill',
  sectors: 'sectors-fill',
  units: 'units-circle',
};

export function lineColour(mode: ColourMode, theme: Theme): string {
  return mode === 'outline' ? PALETTE[theme].line : PALETTE[theme].neutralLine;
}

/** Applies a colour mode to existing layers (no re-install needed). */
export function applyColourMode(map: MlMap, mode: ColourMode, theme: Theme): void {
  for (const l of REGION_LEVELS) {
    map.setPaintProperty(`${l}-fill`, 'fill-color', fillColour(mode, theme));
    map.setPaintProperty(`${l}-line`, 'line-color', lineColour(mode, theme));
  }
  map.setPaintProperty('sectors-tint', 'fill-color', fillColour(mode, theme));
}

export interface BorderOptions { countries: boolean; councils: boolean }

/** Nearby-place layers that can be switched on. */
export type PlaceToggles = { postboxes: boolean; stations: boolean; schools: boolean; gps: boolean; stops: boolean };
export const PLACES_SOURCE = 'pc-places';
export const PLACE_STYLE: Record<string, { colour: string; label: string }> = {
  postboxes: { colour: '#d0312d', label: 'Postbox' },
  rail: { colour: '#6250d6', label: 'Railway station' },
  heritage: { colour: '#8a7fd8', label: 'Heritage railway' },
  bus: { colour: '#2a78d6', label: 'Bus station' },
  stops: { colour: '#2a78d6', label: 'Bus stop' },
  schools: { colour: '#b77400', label: 'School' },
  gps: { colour: '#008300', label: 'GP surgery' },
};

/** Draws a small round pictogram for a place type (retina-sized RGBA image). */
export function drawPlaceIcon(kind: string): { width: number; height: number; data: Uint8ClampedArray } {
  const size = 44;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const small = kind === 'stops';
  const r = small ? 13 : 19;
  g.beginPath();
  g.arc(22, 22, r, 0, Math.PI * 2);
  g.fillStyle = PLACE_STYLE[kind]?.colour ?? '#555';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2.2;
  g.lineJoin = 'round';
  if (kind === 'postboxes') {
    g.strokeRect(13, 16, 18, 12);
    g.beginPath(); g.moveTo(13, 16); g.lineTo(22, 23); g.lineTo(31, 16); g.stroke();
  } else if (kind === 'rail' || kind === 'heritage') {
    g.fillRect(15, 12, 14, 15);
    g.fillStyle = PLACE_STYLE[kind].colour;
    g.fillRect(17.5, 15, 9, 5);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(16, 31); g.lineTo(19, 27); g.moveTo(28, 31); g.lineTo(25, 27); g.stroke();
  } else if (kind === 'bus' || kind === 'stops') {
    const s = small ? 0.7 : 1;
    g.save(); g.translate(22, 22); g.scale(s, s);
    g.fillRect(-8, -9, 16, 15);
    g.fillStyle = PLACE_STYLE[kind].colour;
    g.fillRect(-5.5, -6.5, 11, 5);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(-4.5, 8, 2, 0, Math.PI * 2); g.arc(4.5, 8, 2, 0, Math.PI * 2); g.fill();
    g.restore();
  } else if (kind === 'schools') {
    g.beginPath(); g.moveTo(10, 19); g.lineTo(22, 13); g.lineTo(34, 19); g.lineTo(22, 25); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(15, 22); g.lineTo(15, 27); g.quadraticCurveTo(22, 31, 29, 27); g.lineTo(29, 22); g.stroke();
  } else if (kind === 'gps') {
    g.fillRect(19.5, 12, 5, 20);
    g.fillRect(12, 19.5, 20, 5);
  }
  return { width: size, height: size, data: g.getImageData(0, 0, size, size).data };
}
export const BORDER_SOURCES = { countries: 'pc-borders', councils: 'pc-councils' } as const;

/** Shows or hides the border overlay layers. */
export function applyBorders(map: MlMap, b: BorderOptions): void {
  const set = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  set('border-country', b.countries);
  set('border-country-casing', b.countries);
  set('border-council', b.councils);
  set('border-council-label', b.councils);
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/** Adds postcode sources and layers to the current style (idempotent). */
export function installPostcodeLayers(map: MlMap, theme: Theme, mode: ColourMode, attribution: string): void {
  const c = PALETTE[theme];
  for (const l of ['areas', 'districts', 'sectors', 'units'] as Level[]) {
    if (!map.getSource(SOURCE[l])) {
      map.addSource(SOURCE[l], { type: 'geojson', data: EMPTY, promoteId: 'c', attribution: l === 'areas' ? attribution : undefined, buffer: 64, tolerance: 0.3 });
    }
  }
  for (const id of Object.values(BORDER_SOURCES)) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY, attribution: id === BORDER_SOURCES.councils ? 'Council boundaries: ONS (OGL v3)' : undefined });
  }
  // Fills and lines go beneath the basemap's own labels; our labels go on top.
  const firstSymbol = map.getStyle().layers.find((x) => x.type === 'symbol' && !x.id.startsWith('pc-'))?.id;
  const add = (layer: LayerSpecification, below = false) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, below ? firstSymbol : undefined);
  };

  const lineWidth = (base: number, close: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 5, base, 14, close];
  for (const l of REGION_LEVELS) {
    add({ id: `${l}-fill`, type: 'fill', source: SOURCE[l], filter: notLabel, paint: { 'fill-color': fillColour(mode, theme), 'fill-opacity': 0 } }, true);
    if (l === 'sectors') add({ id: 'sectors-tint', type: 'fill', source: SOURCE[l], filter: notLabel, paint: { 'fill-color': fillColour(mode, theme), 'fill-opacity': 0 } }, true);
    add({
      id: `${l}-context`, type: 'line', source: SOURCE[l], filter: notLabel,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.context, 'line-width': lineWidth(1.2, l === 'sectors' ? 1.2 : 2.2), 'line-opacity': 0 },
    }, true);
    add({
      id: `${l}-line`, type: 'line', source: SOURCE[l], filter: notLabel,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': lineColour(mode, theme), 'line-width': ['case', hover, 2, 0.9], 'line-opacity': 0 },
    }, true);
  }
  // Borders sit above the postcode lines so the national border stays readable.
  add({
    id: 'border-council', type: 'line', source: BORDER_SOURCES.councils, minzoom: 6, filter: ['==', ['get', 'kind'], 'council'],
    layout: { 'line-join': 'round', visibility: 'none' },
    paint: { 'line-color': c.councilLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 1.4], 'line-dasharray': [2, 2], 'line-opacity': 0.85 },
  }, true);
  add({
    id: 'border-country-casing', type: 'line', source: BORDER_SOURCES.countries,
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: { 'line-color': c.halo, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 12, 6], 'line-opacity': 0.7 },
  }, true);
  add({
    id: 'border-country', type: 'line', source: BORDER_SOURCES.countries,
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: { 'line-color': c.countryLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.3, 12, 3], 'line-dasharray': [3, 1.5] },
  }, true);

  for (const l of REGION_LEVELS) {
    add({
      id: `${l}-selected-fill`, type: 'fill', source: SOURCE[l], filter: ['all', notLabel, ['==', ['get', 'c'], '']],
      paint: { 'fill-color': c.selected, 'fill-opacity': theme === 'dark' ? 0.12 : 0.09 },
    }, true);
    add({
      id: `${l}-selected`, type: 'line', source: SOURCE[l], filter: ['all', notLabel, ['==', ['get', 'c'], '']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.selected, 'line-width': lineWidth(2.5, 3.5) },
    });
  }

  add({
    id: 'units-circle', type: 'circle', source: SOURCE.units,
    paint: {
      'circle-color': c.point,
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        12, ['case', hover, 4, 1.8],
        14, ['case', hover, 6, 3],
        ZOOM_CONFIG.closeZoom, ['case', hover, 8.5, 6],
        19, ['case', hover, 11, 8],
      ],
      'circle-stroke-color': c.pointStroke,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 1.5],
      'circle-opacity': 0,
      'circle-stroke-opacity': 0,
    },
  });

  const halo = { 'text-halo-color': c.halo, 'text-halo-width': 1.6, 'text-halo-blur': 0.4 };
  add({
    id: 'areas-label', type: 'symbol', source: SOURCE.areas, filter: isLabel,
    layout: {
      'text-field': ['format', ['get', 'c'], { 'text-font': ['literal', FONT_BOLD] }, '\n', {}, ['coalesce', ['get', 'name'], ''], { 'font-scale': 0.72, 'text-font': ['literal', FONT_REGULAR] }],
      'text-font': FONT_BOLD,
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 6, 13, 8, 16],
      'text-padding': 6,
      'text-max-width': 8,
    },
    paint: { 'text-color': c.label, 'text-opacity': 0, ...halo },
  });
  add({
    id: 'districts-label', type: 'symbol', source: SOURCE.districts, filter: isLabel,
    layout: { 'text-field': ['get', 'c'], 'text-font': FONT_BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 11, 15], 'text-padding': 4 },
    paint: { 'text-color': c.label, 'text-opacity': 0, ...halo },
  });
  add({
    id: 'sectors-label', type: 'symbol', source: SOURCE.sectors, filter: isLabel,
    layout: { 'text-field': ['get', 'c'], 'text-font': FONT_BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 13, 14], 'text-padding': 4 },
    paint: { 'text-color': c.label, 'text-opacity': 0, ...halo },
  });
  if (!map.getSource(PLACES_SOURCE)) map.addSource(PLACES_SOURCE, { type: 'geojson', data: EMPTY, attribution: 'Places © OpenStreetMap contributors, Overture Maps Foundation' });
  for (const k of Object.keys(PLACE_STYLE)) if (!map.hasImage(`place-${k}`)) map.addImage(`place-${k}`, drawPlaceIcon(k), { pixelRatio: 2 });
  add({
    id: 'places-stops', type: 'symbol', source: PLACES_SOURCE, minzoom: 15, filter: ['==', ['get', 'kind'], 'stops'],
    layout: { 'icon-image': 'place-stops', 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.8, 18, 1.1], 'icon-allow-overlap': false, 'icon-padding': 1 },
  });
  add({
    id: 'places-icon', type: 'symbol', source: PLACES_SOURCE, minzoom: 12.5, filter: ['!=', ['get', 'kind'], 'stops'],
    layout: {
      'icon-image': ['concat', 'place-', ['get', 'icon']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.7, 16, 1],
      'icon-allow-overlap': ['step', ['zoom'], false, 15, true],
      'icon-padding': 1,
      'symbol-sort-key': ['match', ['get', 'icon'], 'rail', 0, 'postboxes', 1, 'gps', 2, 'schools', 3, 4],
      'text-field': ['step', ['zoom'], '', 15.5, ['coalesce', ['get', 'name'], '']],
      'text-font': FONT_REGULAR,
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: { 'text-color': c.labelMuted, ...halo },
  });
  add({
    id: 'border-council-label', type: 'symbol', source: BORDER_SOURCES.councils, minzoom: 7.5, maxzoom: 12.5, filter: ['==', ['get', 'kind'], 'council-label'],
    layout: {
      visibility: 'none',
      'text-field': ['get', 'name'],
      'text-font': FONT_REGULAR,
      'text-size': ['interpolate', ['linear'], ['zoom'], 7.5, 10, 11, 12],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.08,
      'text-max-width': 9,
      'text-padding': 8,
    },
    paint: { 'text-color': c.councilLabel, ...halo },
  });
  add({
    id: 'units-label', type: 'symbol', source: SOURCE.units, minzoom: ZOOM_CONFIG.unitLabelZoom,
    layout: {
      'text-field': ['get', 'c'],
      'text-font': FONT_REGULAR,
      'text-size': ['interpolate', ['linear'], ['zoom'], ZOOM_CONFIG.unitLabelZoom, 11, 18, 13],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.75,
      'text-justify': 'auto',
      'text-padding': 3,
    },
    paint: { 'text-color': c.labelMuted, 'text-opacity': 0, ...halo },
  });
}

/** Plain offline basemap used when the hosted basemap can't be fetched. */
export function fallbackStyle(theme: Theme, origin: string, dataBaseUrl: string): StyleSpecification {
  const c = PALETTE[theme];
  const dataUrl = dataBaseUrl.startsWith('http') ? dataBaseUrl : `${origin}${dataBaseUrl}`;
  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      land: { type: 'geojson', data: `${dataUrl}/land.geojson`, attribution: 'Coastline © OpenStreetMap contributors (ODbL)' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.fallbackSea } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': c.fallbackLand } },
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': c.fallbackCoast, 'line-width': 0.8 } },
    ],
  };
}
