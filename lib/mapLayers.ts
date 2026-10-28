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
  },
} as const;

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
export function windowedPaint(w: Windows): { layer: string; prop: string; value: Expr }[] {
  const fillBase: ExpressionSpecification = ['case', hover, 0.13, 0.04];
  const out: { layer: string; prop: string; value: Expr }[] = [];
  for (const l of REGION_LEVELS) {
    const cases = l === 'districts' ? [{ when: outsideDetail, win: w.districtsOutsideDetail }, { win: w.districts }] : [{ win: w[l] }];
    out.push({ layer: `${l}-fill`, prop: 'fill-opacity', value: fade(fillBase, cases) });
    out.push({ layer: `${l}-line`, prop: 'line-opacity', value: fade(0.75, cases) });
    out.push({ layer: `${l}-label`, prop: 'text-opacity', value: fade(1, cases) });
    out.push({ layer: `${l}-context`, prop: 'line-opacity', value: fade(l === 'sectors' ? 0.35 : 0.6, [{ win: w.context[l] }]) });
  }
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

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/** Adds postcode sources and layers to the current style (idempotent). */
export function installPostcodeLayers(map: MlMap, theme: Theme, attribution: string): void {
  const c = PALETTE[theme];
  for (const l of ['areas', 'districts', 'sectors', 'units'] as Level[]) {
    if (!map.getSource(SOURCE[l])) {
      map.addSource(SOURCE[l], { type: 'geojson', data: EMPTY, promoteId: 'c', attribution: l === 'areas' ? attribution : undefined, buffer: 64, tolerance: 0.3 });
    }
  }
  // Fills and lines go beneath the basemap's own labels; our labels go on top.
  const firstSymbol = map.getStyle().layers.find((x) => x.type === 'symbol' && !x.id.startsWith('pc-'))?.id;
  const add = (layer: LayerSpecification, below = false) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, below ? firstSymbol : undefined);
  };

  const lineWidth = (base: number, close: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 5, base, 14, close];
  for (const l of REGION_LEVELS) {
    add({ id: `${l}-fill`, type: 'fill', source: SOURCE[l], filter: notLabel, paint: { 'fill-color': c.fill, 'fill-opacity': 0 } }, true);
    add({
      id: `${l}-context`, type: 'line', source: SOURCE[l], filter: notLabel,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.context, 'line-width': lineWidth(1.2, l === 'sectors' ? 1.2 : 2.2), 'line-opacity': 0 },
    }, true);
    add({
      id: `${l}-line`, type: 'line', source: SOURCE[l], filter: notLabel,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.line, 'line-width': ['case', hover, 2, 0.9], 'line-opacity': 0 },
    }, true);
  }
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
