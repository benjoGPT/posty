// Imperative wrapper around MapLibre. Keeps per-frame map work (data loading,
// level switching, hover) out of React; React gets coarse state via callbacks.

import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import type { Feature, Point } from 'geojson';
import { APP_CONFIG, basemapById, type Basemap, type BasemapId, type Bounds } from '@/config/app';
import type { BBox, PlaceSets, PostcodeData, RegionCollection, RegionFeature, UnitFeature } from './data';
import { containsPoint, featureContains, intersects } from './data';
import { FALLBACK_THRESHOLDS, LEVEL_LABELS, levelForZoom, thresholdsFor, type DetailMode, type Level, type Thresholds } from './levels';
import {
  applyBorders, applyColourMode, BORDER_SOURCES, computeWindows, setPriceScale, fallbackStyle, INTERACTIVE_LAYER, installPostcodeLayers, layerVisibility, REGION_LEVELS, SOURCE, windowedPaint,
  PLACE_STYLE, PLACES_SOURCE, type BorderOptions, type ColourMode, type PlaceToggles, type RegionLevel, type Theme,
} from './mapLayers';
import type { NamedTarget } from './namedSearch';
import { areaOf, districtOf } from './postcode';
import type { RegionKind, Selection } from './search';

export interface MapViewState {
  level: Level;
  loading: boolean;
  basemap: 'hosted' | 'offline' | 'loading';
  notice: null | 'outside-detail' | 'zoom-for-units';
  centreArea: string | null;
}

export interface StackedUnit { code: string; lng: number; lat: number; q?: number }
export type MapPick = { kind: RegionKind; code: string } | { kind: 'units'; units: StackedUnit[] } | null;
export interface HoverInfo { x: number; y: number; title: string; subtitle: string }

interface Callbacks {
  onState: (s: MapViewState) => void;
  onPick: (p: MapPick) => void;
  onHover: (h: HoverInfo | null) => void;
  onError: (message: string) => void;
}

interface ControllerOptions {
  basemap: BasemapId;
  colourMode: ColourMode;
  borders: BorderOptions;
  places: PlaceToggles;
  mode: DetailMode;
  initialBounds?: Bounds;
  callbacks: Callbacks;
}

export type Padding = { top: number; right: number; bottom: number; left: number };

const KIND_LEVEL: Record<RegionKind, RegionLevel> = { area: 'areas', district: 'districts', sector: 'sectors' };
const LEVEL_KIND: Record<RegionLevel, RegionKind> = { areas: 'area', districts: 'district', sectors: 'sector' };
/** Above this many districts in view, individual postcodes are not loaded. */
const MAX_UNIT_DISTRICTS = 60;
/** Above this many areas in view, district chunks are not loaded (national view). */
const MAX_DISTRICT_AREAS = 70;
const CONCURRENCY = 6;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

async function loadBasemap(basemap: Basemap): Promise<{ style: StyleSpecification; hosted: boolean }> {
  const theme = basemap.theme as Theme;
  if (!basemap.url) return { style: fallbackStyle(theme, window.location.origin, APP_CONFIG.dataBaseUrl), hosted: true };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(basemap.url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    const style = (await r.json()) as StyleSpecification;
    if (!Array.isArray(style.layers)) throw new Error('not a style');
    return { style, hosted: true };
  } catch {
    return { style: fallbackStyle(theme, window.location.origin, APP_CONFIG.dataBaseUrl), hosted: false };
  } finally {
    clearTimeout(timer);
  }
}

export class MapController {
  readonly map: maplibregl.Map;
  private thresholds: Thresholds = FALLBACK_THRESHOLDS;
  private level: Level;
  private state: MapViewState;
  private loaded = {
    districts: new Map<string, RegionFeature[]>(),
    sectors: new Map<string, RegionFeature[]>(),
    units: new Map<string, UnitFeature[]>(),
    places: new Map<string, PlaceSets>(),
  };
  private sourceKeys: Partial<Record<Level, string>> = {};
  private visibility: Record<string, boolean> = {};
  private pending = 0;
  private unitsTooMany = false;
  private hovered: { source: string; id: string } | null = null;
  private selection: Selection | null = null;
  private marker: maplibregl.Marker | null = null;
  private searchMarker: maplibregl.Marker | null = null;
  private meMarker: maplibregl.Marker | null = null;
  private renderQueued = false;
  private hoverQueued: MapMouseEvent | null = null;
  private destroyed = false;
  private resizeObserver: ResizeObserver;
  private labelsHidden = false;
  private bordersLoaded = { countries: false, councils: false };
  private refreshSeq = 0;

  static async create(
    container: HTMLElement,
    data: PostcodeData,
    opts: ControllerOptions,
  ): Promise<MapController> {
    const basemap = basemapById(opts.basemap);
    const controller = new MapController(container, data, fallbackStyle(basemap.theme as Theme, window.location.origin, data.baseUrl), true, opts);
    if (basemap.url) {
      controller.emit({basemap:'loading'});
      void loadBasemap(basemap).then(({style,hosted}) => {
        if(controller.destroyed || controller.opts.basemap !== basemap.id)return;
        if(hosted)controller.map.setStyle(style,{diff:false});
        controller.emit({basemap:hosted?'hosted':'offline'});
      }).catch(() => {if(!controller.destroyed)controller.emit({basemap:'offline'});});
    }
    return controller;
  }

  private constructor(
    container: HTMLElement,
    private data: PostcodeData,
    style: StyleSpecification,
    hosted: boolean,
    private opts: ControllerOptions,
  ) {
    this.map = new maplibregl.Map({
      container,
      style,
      bounds: opts.initialBounds,
      fitBoundsOptions: { padding: 40 },
      hash: 'map',
      minZoom: 4,
      maxZoom: 19,
      maxBounds: [[-16, 46.5], [8, 63.5]],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.destroyed) this.map.resize();
    });
    this.resizeObserver.observe(container);
    this.map.touchZoomRotate.disableRotation();
    // Exposed for automated browser tests and debugging only.
    if (new URLSearchParams(window.location.search).has('debug')) (window as unknown as { __pcMap: maplibregl.Map }).__pcMap = this.map;
    this.map.keyboard.disableRotation();

    this.level = opts.mode === 'auto' ? levelForZoom(this.map.getZoom(), this.thresholds) : opts.mode;
    this.state = { level: this.level, loading: false, basemap: hosted ? 'hosted' : 'offline', notice: null, centreArea: null };

    this.map.on('style.load', () => this.onStyleLoad());
    // On narrow screens start with the attribution collapsed behind its (i) button.
    this.map.once('load', () => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        this.map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      }
    });
    this.map.on('moveend', () => void this.refresh());
    this.map.on('zoom', () => this.onZoom());
    this.map.on('click', (e) => this.onClick(e));
    this.map.on('mousemove', (e) => {
      const first = !this.hoverQueued;
      this.hoverQueued = e;
      if (first) requestAnimationFrame(() => this.onHover());
    });
    this.map.on('mouseout', () => this.clearHover());
    this.map.on('error', (e) => console.warn('[map]', e.error?.message ?? e));
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.marker?.remove();
    this.meMarker?.remove();
    this.searchMarker?.remove();
    this.map.remove();
  }

  // ---------------------------------------------------------------------------
  // Style and layers
  // ---------------------------------------------------------------------------

  private attribution(): string {
    const s = this.data.manifest.source;
    return `Postcodes: ONS (OGL v3), ${s.release.replace(/ \(.*\)$/, '')} · Contains OS data © Crown copyright · Contains Royal Mail data © Royal Mail`;
  }

  private onStyleLoad(): void {
    setPriceScale(this.data.manifest.prices?.stops);
    installPostcodeLayers(this.map, this.theme, this.opts.colourMode, this.attribution());
    this.sourceKeys = {};
    this.visibility = {};
    this.hovered = null;
    this.bordersLoaded = { countries: false, councils: false };
    this.placesKey = '';
    this.applyBordersNow();
    this.applyWindows();
    this.render();
    this.applySelection();
    void this.refresh();
  }

  private get theme(): Theme {
    return basemapById(this.opts.basemap).theme as Theme;
  }

  async setBasemap(id: BasemapId): Promise<void> {
    if (id === this.opts.basemap) return;
    this.opts.basemap = id;
    const { style, hosted } = await loadBasemap(basemapById(id));
    if (this.destroyed || this.opts.basemap !== id) return;
    this.map.setStyle(style, { diff: false });
    this.emit({ basemap: hosted ? 'hosted' : 'offline' });
  }

  focusNamed(target: NamedTarget, padding: Padding): void {
    this.searchMarker?.remove();
    const label = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = target.title;
    const context = document.createElement('p'); context.textContent = target.subtitle;
    const source = document.createElement('small'); source.textContent = 'OS Open Names · street/place reference point, not a house address';
    label.append(title, context, source);
    this.searchMarker = new maplibregl.Marker({color:'#2563eb'}).setLngLat([target.lng,target.lat]).setPopup(new maplibregl.Popup({offset:25}).setDOMContent(label)).addTo(this.map);
    this.map.flyTo({center:[target.lng,target.lat],zoom:target.kind==='street'?15:12,padding,duration:reducedMotion()?0:700});
    this.searchMarker.togglePopup();
  }

  setColourMode(mode: ColourMode): void {
    if (mode === this.opts.colourMode) return;
    this.opts.colourMode = mode;
    if (!this.map.getLayer('units-circle')) return;
    applyColourMode(this.map, mode, this.theme);
    this.applyWindows();
  }

  setBorders(b: BorderOptions): void {
    this.opts.borders = b;
    this.applyBordersNow();
  }

  /** Loads border data the first time it's shown (councils are ~300 KB), then toggles the layers. */
  private applyBordersNow(): void {
    if (!this.map.getSource(BORDER_SOURCES.countries)) return;
    for (const k of ['countries', 'councils'] as const) {
      if (this.opts.borders[k] && !this.bordersLoaded[k]) {
        this.bordersLoaded[k] = true;
        (this.map.getSource(BORDER_SOURCES[k]) as GeoJSONSource).setData(`${this.data.baseUrl}/${k === 'countries' ? 'borders' : 'councils'}.geojson`);
      }
    }
    applyBorders(this.map, this.opts.borders);
    if(this.opts.borders.flood && !this.map.getSource('ea-flood')) {
      this.map.addSource('ea-flood',{type:'raster',tiles:['https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-rivers-and-sea/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=rofrs_4band&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'],tileSize:256,minzoom:13,maxzoom:19,attribution:'Flood risk © Environment Agency 2025 (OGL) · Rivers and sea, England only'});
      this.map.addLayer({id:'ea-flood-layer',type:'raster',source:'ea-flood',minzoom:13,paint:{'raster-opacity':0.6}});
    }
    if(this.map.getLayer('ea-flood-layer')) this.map.setLayoutProperty('ea-flood-layer','visibility',this.opts.borders.flood?'visible':'none');

  }

  setPlaces(p: PlaceToggles): void {
    this.opts.places = p;
    this.placesKey = '';
    void this.refresh();
    this.scheduleRender();
  }

  /** Hides postcode labels (used by the quiz). */
  setLabelsHidden(hidden: boolean): void {
    this.labelsHidden = hidden;
    this.visibility = {};
    this.applyVisibility();
  }

  setMode(mode: DetailMode): void {
    this.opts.mode = mode;
    this.applyWindows();
    this.updateLevel();
    void this.refresh();
  }

  private applyWindows(): void {
    if (!this.map.getLayer('units-circle')) return;
    const w = computeWindows(this.thresholds, this.opts.mode);
    for (const { layer, prop, value } of windowedPaint(w, this.opts.colourMode, this.theme)) this.map.setPaintProperty(layer, prop, value);
    this.applyVisibility();
  }

  private applyVisibility(): void {
    if (!this.map.getLayer('units-circle')) return;
    const vis = layerVisibility(computeWindows(this.thresholds, this.opts.mode), this.map.getZoom());
    for (const [layer, shown] of Object.entries(vis)) {
      const on = shown && !(this.labelsHidden && layer.endsWith('-label'));
      if (this.visibility[layer] === on) continue;
      this.visibility[layer] = on;
      this.map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none');
    }
  }

  // ---------------------------------------------------------------------------
  // View state
  // ---------------------------------------------------------------------------

  private emit(patch: Partial<MapViewState>): void {
    const next = { ...this.state, ...patch };
    if (Object.keys(next).every((k) => next[k as keyof MapViewState] === this.state[k as keyof MapViewState])) return;
    this.state = next;
    this.opts.callbacks.onState(next);
  }

  private onZoom(): void {
    this.applyVisibility();
    this.updateLevel();
  }

  private updateLevel(): void {
    const mode = this.opts.mode;
    this.level = mode === 'auto' ? levelForZoom(this.map.getZoom(), this.thresholds, this.level) : mode;
    this.emit({ level: this.level, notice: this.notice() });
  }

  private notice(): MapViewState['notice'] {
    const area = this.state.centreArea;
    if ((this.level === 'sectors' || this.level === 'units') && area && !this.data.isDetailArea(area)) return 'outside-detail';
    if (this.level === 'units' && this.unitsTooMany) return 'zoom-for-units';
    return null;
  }

  private viewBBox(expand = 0): BBox {
    const b = this.map.getBounds();
    const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    const dx = (e - w) * expand, dy = (n - s) * expand;
    return [w - dx, s - dy, e + dx, n + dy];
  }

  private areaAt(pt: [number, number]): string | null {
    for (const f of this.data.areasCollection.features) {
      if (f.properties.label || !f.properties.b || !containsPoint(f.properties.b, pt)) continue;
      if (featureContains(f, pt)) return f.properties.c;
    }
    return null;
  }

  private districtAt(area: string, pt: [number, number]): string | null {
    const loaded = this.loaded.districts.get(area);
    if (loaded) {
      for (const f of loaded) if (!f.properties.label && f.properties.b && containsPoint(f.properties.b, pt) && featureContains(f, pt)) return f.properties.c;
    }
    // Not loaded yet: nearest district label whose extent contains the point.
    let best: string | null = null;
    let bestD = Infinity;
    for (const d of this.data.districtsByArea.get(area) ?? []) {
      if (!containsPoint(d.b, pt)) continue;
      const dist = (d.l[0] - pt[0]) ** 2 + (d.l[1] - pt[1]) ** 2;
      if (dist < bestD) { bestD = dist; best = d.c; }
    }
    return best;
  }

  /** Recomputes thresholds for the map centre, loads the data the view needs and re-renders. */
  async refresh(): Promise<void> {
    if (this.destroyed || !this.map.getLayer('units-circle')) return;
    const seq = ++this.refreshSeq;
    const c = this.map.getCenter();
    const pt: [number, number] = [c.lng, c.lat];
    const area = this.areaAt(pt);
    const district = area ? this.districtAt(area, pt) : null;
    const t = thresholdsFor(c.lat, area ? this.data.areas.get(area) : null, district ? this.data.districts.get(district) : null);
    if (Math.abs(t.districts - this.thresholds.districts) > 0.05 || Math.abs(t.sectors - this.thresholds.sectors) > 0.05 || Math.abs(t.units - this.thresholds.units) > 0.05) {
      this.thresholds = t;
      this.applyWindows();
    }
    this.state = { ...this.state, centreArea: area };
    this.updateLevel();

    const hadDistricts = area ? this.loaded.districts.has(area) : true;
    await this.loadForView();
    if (seq !== this.refreshSeq || this.destroyed) return;
    // The district under the centre is only known precisely once its area's
    // boundaries have loaded; recompute the thresholds with it.
    if (!hadDistricts && this.loaded.districts.has(area!)) void this.refresh();
  }

  private async loadForView(): Promise<void> {
    const z = this.map.getZoom();
    const t = this.thresholds;
    const mode = this.opts.mode;
    const idx = (l: Level) => ['areas', 'districts', 'sectors', 'units'].indexOf(l);
    const want = (l: Level, lead: number) => (mode === 'auto' ? z >= t[l as keyof Thresholds] - lead : idx(mode) >= idx(l));
    const b = this.viewBBox(0.25);
    const areas = this.data.areasInBounds(b);
    const jobs: (() => Promise<void>)[] = [];

    if (want('districts', 1) && areas.length <= MAX_DISTRICT_AREAS) {
      for (const a of areas) {
        if (this.loaded.districts.has(a.c)) continue;
        jobs.push(async () => {
          const fc = await this.data.loadDistricts(a.c);
          this.loaded.districts.set(a.c, fc.features.map((f) => ({ ...f, properties: { ...f.properties, detail: a.detail } as RegionFeature['properties'] })));
        });
      }
    }
    if (want('sectors', 1)) {
      for (const a of areas) {
        if (!a.detail || this.loaded.sectors.has(a.c)) continue;
        jobs.push(async () => {
          const fc = await this.data.loadSectors(a.c);
          if (fc) this.loaded.sectors.set(a.c, fc.features);
        });
      }
    }
    this.unitsTooMany = false;
    if (Object.values(this.opts.places).some(Boolean) && z >= 12) {
      for (const a of areas) {
        if (!a.detail || this.loaded.places.has(a.c)) continue;
        jobs.push(async () => {
          const p = await this.data.loadPlaces(a.c);
          if (p) this.loaded.places.set(a.c, p);
        });
      }
    }
    if (want('units', 0.8)) {
      const ds = this.data.districtsInBounds(b, true);
      if (ds.length > MAX_UNIT_DISTRICTS) this.unitsTooMany = true;
      else {
        for (const d of ds) {
          if (this.loaded.units.has(d.c)) continue;
          jobs.push(async () => { this.loaded.units.set(d.c, await this.data.loadUnits(d.c)); });
        }
      }
    }
    this.emit({ notice: this.notice() });
    if (!jobs.length) { this.scheduleRender(); return; }

    this.pending += jobs.length;
    this.emit({ loading: true });
    let failed = 0;
    const queue = [...jobs];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try { await job(); } catch { failed++; }
        this.pending--;
        this.scheduleRender();
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
    if (this.pending === 0) this.emit({ loading: false });
    if (failed) this.opts.callbacks.onError(`Some postcode data couldn't be loaded (${failed} file${failed > 1 ? 's' : ''}). Move the map to retry.`);
  }

  private scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  /** Pushes loaded chunks that are near the view into the map sources. */
  private render(): void {
    if (this.destroyed || !this.map.getSource(SOURCE.units)) return;
    const keep = this.viewBBox(1);
    const pick = <T>(map: Map<string, T[]>, boxOf: (k: string) => BBox | undefined) => {
      const keys = [...map.keys()].filter((k) => { const bb = boxOf(k); return bb && intersects(bb, keep); }).sort();
      return { key: keys.join(','), features: keys.flatMap((k) => map.get(k)!) };
    };
    const set = (level: Level, { key, features }: { key: string; features: Feature[] }) => {
      if (this.sourceKeys[level] === key) return;
      this.sourceKeys[level] = key;
      (this.map.getSource(SOURCE[level]) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    };
    set('areas', { key: 'all', features: this.data.areasCollection.features });
    set('districts', pick(this.loaded.districts, (a) => this.data.areas.get(a)?.b));
    set('sectors', pick(this.loaded.sectors, (a) => this.data.areas.get(a)?.b));
    set('units', pick(this.loaded.units, (d) => this.data.districts.get(d)?.b));
    this.renderPlaces(keep);
  }

  private placesKey = '';

  /** Builds the place points for loaded areas near the view, keeping only the enabled kinds. */
  private renderPlaces(keep: BBox): void {
    const on = this.opts.places;
    const areas = [...this.loaded.places.keys()].filter((a) => { const b = this.data.areas.get(a)?.b; return b && intersects(b, keep); }).sort();
    const key = `${areas.join(',')}|${JSON.stringify(on)}`;
    if (key === this.placesKey) return;
    this.placesKey = key;
    const features: Feature[] = [];
    const add = (lng: number, lat: number, kind: string, icon: string, props: Record<string, unknown>) =>
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { kind, icon, ...props } });
    for (const a of areas) {
      const p = this.loaded.places.get(a)!;
      if (on.postboxes) for (const [x, y, ref, times] of p.postboxes) add(x, y, 'postboxes', 'postboxes', { ref, times });
      if (on.stations) for (const [x, y, name, type] of p.stations) add(x, y, 'stations', type, { name });
      if (on.schools) for (const [x, y, name, phase] of p.schools) add(x, y, 'schools', 'schools', { name, phase });
      if (on.gps) for (const [x, y, name] of p.gps) add(x, y, 'gps', 'gps', { name });
      for(const kind of ['supermarkets','pharmacies','parks'] as const) if(on[kind]) for(const [x,y,name] of p[kind]??[])add(x,y,kind,kind,{name});
      if (on.stops) for (const [x, y, name] of p.stops) add(x, y, 'stops', 'stops', { name });
    }
    (this.map.getSource(PLACES_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  /** The region feature under a point for the current level (falls back to districts outside detail coverage). */
  private regionAt(point: maplibregl.PointLike): MapGeoJSONFeature | null {
    const level: RegionLevel = this.level === 'units' ? 'sectors' : this.level;
    const layers = [INTERACTIVE_LAYER[level]];
    const hit = this.map.queryRenderedFeatures(point, { layers: layers.filter((l) => this.visibility[l]) })[0];
    if (hit) return hit;
    if (level !== 'areas' && this.visibility['districts-fill']) {
      const d = this.map.queryRenderedFeatures(point, { layers: ['districts-fill'] }).find((f) => f.properties.detail === false);
      if (d) return d;
    }
    return null;
  }

  private unitsAt(x: number, y: number, r: number): MapGeoJSONFeature[] {
    if (this.level !== 'units' || !this.visibility['units-circle']) return [];
    return this.map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers: ['units-circle'] });
  }

  private popup: maplibregl.Popup | null = null;

  /** Shows a small popup for a place icon. Returns true if one was hit. */
  private placeAt(e: MapMouseEvent): boolean {
    const r = coarsePointer() ? 14 : 8;
    const layers = ['places-icon', 'places-stops'].filter((l) => this.map.getLayer(l));
    const hit = this.map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers })[0];
    if (!hit) return false;
    const p = hit.properties as Record<string, string | null>;
    const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    const type = PLACE_STYLE[p.icon ?? '']?.label ?? 'Place';
    const lines = [
      `<div class="pc-popup-type">${esc(type)}${p.phase && p.phase !== 'school' ? ` · ${esc(p.phase)}` : ''}</div>`,
      p.name ? `<div class="pc-popup-name">${esc(p.name)}</div>` : '',
      p.ref ? `<div>Box ${esc(p.ref)}</div>` : '',
      p.kind === 'postboxes' ? `<div class="pc-popup-note">${p.times ? `Collections: ${esc(p.times)}` : 'Collection times not mapped'}</div>` : '',
    ];
    this.popup?.remove();
    this.popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px', className: 'pc-popup', offset: 14 })
      .setLngLat((hit.geometry as Point).coordinates as [number, number])
      .setHTML(lines.join(''))
      .addTo(this.map);
    return true;
  }

  private onClick(e: MapMouseEvent): void {
    if (this.placeAt(e)) return;
    const r = coarsePointer() ? 16 : 9;
    const units = this.unitsAt(e.point.x, e.point.y, r);
    if (units.length) {
      const proj = (f: MapGeoJSONFeature) => this.map.project((f.geometry as Point).coordinates as [number, number]);
      units.sort((a, b) => proj(a).dist(e.point) - proj(b).dist(e.point));
      const [lng, lat] = (units[0].geometry as Point).coordinates;
      const seen = new Set<string>();
      const stacked: StackedUnit[] = [];
      for (const f of units) {
        const [x, y] = (f.geometry as Point).coordinates;
        const code = f.properties.c as string;
        if (seen.has(code) || Math.abs(x - lng) > 1e-7 || Math.abs(y - lat) > 1e-7) continue;
        seen.add(code);
        stacked.push({ code, lng: x, lat: y, q: f.properties.q as number | undefined });
      }
      stacked.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
      this.opts.callbacks.onPick({ kind: 'units', units: stacked });
      return;
    }
    const region = this.regionAt(e.point);
    if (region) {
      const level = (Object.keys(SOURCE) as Level[]).find((l) => SOURCE[l] === region.source) as RegionLevel;
      this.opts.callbacks.onPick({ kind: LEVEL_KIND[level], code: region.properties.c as string });
      return;
    }
    this.opts.callbacks.onPick(null);
  }

  private onHover(): void {
    const e = this.hoverQueued;
    this.hoverQueued = null;
    if (!e || this.destroyed || !this.map.getLayer('units-circle')) return;
    // Hit-testing during a pan/zoom is wasted work and makes the tooltip jitter.
    if (this.map.isMoving()) { this.clearHover(); return; }
    const placeLayers = ['places-icon', 'places-stops'].filter((l) => this.map.getLayer(l) && this.map.getLayoutProperty(l, 'visibility') !== 'none');
    const place = placeLayers.length ? this.map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: placeLayers })[0] : undefined;
    if (place) {
      this.clearHover(false);
      this.map.getCanvas().style.cursor = 'pointer';
      const icon = String(place.properties.icon);
      this.opts.callbacks.onHover({ x: e.point.x, y: e.point.y, title: String(place.properties.name ?? PLACE_STYLE[icon]?.label ?? 'Place'), subtitle: place.properties.name ? PLACE_STYLE[icon]?.label ?? '' : place.properties.ref ? `Box ${place.properties.ref}` : '' });
      return;
    }
    const unit = this.unitsAt(e.point.x, e.point.y, 5)[0];
    const f = unit ?? this.regionAt(e.point);
    const id = f ? String(f.properties.c) : null;
    if (!f || !id) { this.clearHover(); return; }
    if (this.hovered?.id !== id || this.hovered.source !== f.source) {
      this.clearHover(false);
      this.hovered = { source: f.source, id };
      this.map.setFeatureState(this.hovered, { hover: true });
    }
    this.map.getCanvas().style.cursor = 'pointer';
    const level = (Object.keys(SOURCE) as Level[]).find((l) => SOURCE[l] === f.source)!;
    const name = level === 'areas' ? this.data.areas.get(id)?.name : null;
    this.opts.callbacks.onHover({
      x: e.point.x,
      y: e.point.y,
      title: name ? `${id} · ${name}` : id,
      subtitle: level === 'units' ? 'Postcode reference point' : LEVEL_LABELS[level].singular,
    });
  }

  private clearHover(notify = true): void {
    if (this.hovered && this.map.getSource(this.hovered.source)) this.map.removeFeatureState(this.hovered, 'hover');
    this.hovered = null;
    this.map.getCanvas().style.cursor = '';
    if (notify) this.opts.callbacks.onHover(null);
  }

  // ---------------------------------------------------------------------------
  // Selection and navigation
  // ---------------------------------------------------------------------------

  setSelection(sel: Selection | null): void {
    this.searchMarker?.remove();
    this.searchMarker = null;
    this.selection = sel;
    this.applySelection();
  }

  private applySelection(): void {
    const sel = this.selection;
    if (!this.map.getLayer('units-circle')) return;
    for (const l of REGION_LEVELS) {
      const code = sel && sel.kind !== 'unit' && KIND_LEVEL[sel.kind] === l ? sel.code : '';
      const filter: maplibregl.FilterSpecification = ['all', ['!', ['has', 'label']], ['==', ['get', 'c'], code]];
      this.map.setFilter(`${l}-selected`, filter);
      this.map.setFilter(`${l}-selected-fill`, filter);
    }
    if (sel?.kind === 'unit') {
      if (!this.marker) {
        const el = document.createElement('div');
        el.className = 'pc-marker';
        el.innerHTML = '<div class="pc-marker-pin"></div><div class="pc-marker-dot"></div>';
        this.marker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
      }
      this.marker.getElement().classList.toggle('pc-marker--terminated', sel.status === 'terminated');
      this.marker.getElement().setAttribute('aria-label', `Selected postcode ${sel.code}`);
      this.marker.setLngLat([sel.lng, sel.lat]).addTo(this.map);
    } else {
      this.marker?.remove();
    }
  }

  /** Bounding box of a region, loading its sector chunk if needed. */
  async regionBBox(kind: RegionKind, code: string): Promise<BBox | null> {
    if (kind === 'area') return this.data.areas.get(code)?.b ?? null;
    if (kind === 'district') return this.data.districts.get(code)?.b ?? null;
    const fc: RegionCollection | null = await this.data.loadSectors(areaOf(code)).catch(() => null);
    const f = fc?.features.find((x) => !x.properties.label && x.properties.c === code);
    return f?.properties.b ?? null;
  }

  private duration(ms: number): number {
    return reducedMotion() ? 0 : ms;
  }

  async focus(sel: Selection, padding: Padding): Promise<void> {
    if (sel.kind === 'unit') {
      this.map.flyTo({ center: [sel.lng, sel.lat], zoom: Math.max(this.map.getZoom(), 16.5), padding, duration: this.duration(1400), essential: true });
      return;
    }
    const b = await this.regionBBox(sel.kind, sel.code);
    if (!b) return;
    const centre = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const district = sel.kind === 'area' ? null : this.data.districts.get(districtOf(sel.code));
    const t = thresholdsFor(centre[1], this.data.areas.get(areaOf(sel.code)), district);
    // Frame the region so its children are visible, but no further in.
    const maxZoom = sel.kind === 'area' ? t.sectors - 0.4 : sel.kind === 'district' ? t.units - 0.4 : 16;
    this.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, maxZoom, duration: this.duration(1300), essential: true });
  }

  fitBounds(bounds: Bounds, padding: Padding): void {
    this.map.fitBounds(bounds, { padding, duration: this.duration(1200), essential: true });
  }

  zoomBy(delta: number): void {
    this.map.zoomTo(this.map.getZoom() + delta, { duration: this.duration(300) });
  }

  /** Shows (or clears) a "you are here" dot. */
  setUserLocation(pos: { lng: number; lat: number } | null): void {
    if (!pos) { this.meMarker?.remove(); return; }
    if (!this.meMarker) {
      const el = document.createElement('div');
      el.className = 'pc-me';
      el.setAttribute('aria-label', 'Your location');
      this.meMarker = new maplibregl.Marker({ element: el });
    }
    this.meMarker.setLngLat([pos.lng, pos.lat]).addTo(this.map);
  }

  flyTo(lng: number, lat: number, zoom: number, padding?: Padding): void {
    this.map.flyTo({ center: [lng, lat], zoom, padding, duration: this.duration(1400), essential: true });
  }

  getLevel(): Level {
    return this.level;
  }
}
