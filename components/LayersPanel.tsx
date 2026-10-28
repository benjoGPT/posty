'use client';

import {metricFor,metricStops,type MetricDefinition,type DataAvailability} from '@/lib/metrics';
import type { ReactNode } from 'react';
import { APP_CONFIG, type BasemapId } from '@/config/app';
import { LEVEL_LABELS, LEVELS, type DetailMode } from '@/lib/levels';
import { IMD_STOPS, GROWTH_STOPS, DENSITY_STOPS, PLACE_STYLE, PRICE_STOPS, REGION_COLOURS, URBAN_STOPS, type BorderOptions, type ColourMode, type PlaceToggles } from '@/lib/mapLayers';
import { CloseIcon, InfoIcon } from './Icons';

interface Props {
  metrics?: MetricDefinition[];
  availability?: DataAvailability[];
  basemap: BasemapId;
  colourMode: ColourMode;
  borders: BorderOptions;
  onBorders: (b: BorderOptions) => void;
  places: PlaceToggles;
  onPlaces: (p: PlaceToggles) => void;
  /** Colour modes whose data exists in this build. */
  available: { prices: boolean; urban: boolean; deprivation: boolean; growth: boolean };
  mode: DetailMode;
  showDetail: boolean;
  onBasemap: (id: BasemapId) => void;
  onColourMode: (m: ColourMode) => void;
  onMode: (m: DetailMode) => void;
  onAbout: () => void;
  onClose: () => void;
}

const COLOUR_MODES: { id: ColourMode; label: string; hint: string }[] = [
  { id: 'colours', label: 'Colours', hint: 'Neighbouring regions in different colours' },
  { id: 'density', label: 'Density', hint: 'Postcodes per km² — darker is denser' },
  { id: 'prices', label: 'House prices', hint: 'Median sale price, last 3 years (England & Wales) — darker is pricier' },
  { id: 'deprivation', label: 'Deprivation', hint: 'English IMD 2025: average decile of published postcode records, 1 most deprived. English records only in border regions' },
  { id: 'growth', label: 'Price change', hint: 'Change in sale medians between the last two complete calendar years; at least 20 sales per year. Not individual property appreciation' },
  { id: 'urban', label: 'Urban / rural', hint: 'Share of postcodes in urban areas — blue urban, red rural' },
  { id: 'outline', label: 'Outline', hint: 'Boundaries only' },
];

const PLACE_TOGGLES: { key: keyof PlaceToggles; icon: string; label: string }[] = [
  {key:'supermarkets',icon:'supermarkets',label:'Supermarkets'},
  {key:'pharmacies',icon:'pharmacies',label:'Pharmacies'},
  {key:'parks',icon:'parks',label:'Green spaces'},
  { key: 'stations', icon: 'rail', label: 'Stations' },
  { key: 'postboxes', icon: 'postboxes', label: 'Postboxes' },
  { key: 'schools', icon: 'schools', label: 'Schools' },
  { key: 'gps', icon: 'gps', label: 'GP surgeries' },
  { key: 'stops', icon: 'stops', label: 'Bus stops' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="px-4 py-3">
      <legend className="mb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function ColourPreview({ mode }: { mode: ColourMode }) {
  const metric=metricFor(mode);
  const colours = metric ? metricStops(metric,'light').map(([,c])=>c) :
    mode === 'colours' ? REGION_COLOURS.light
    : mode === 'density' ? DENSITY_STOPS.filter((_, i) => i % 2 === 0).map(([, c]) => c)
    : mode === 'prices' ? PRICE_STOPS.filter((_, i) => i % 2 === 0).map(([, c]) => c)
    : mode === 'deprivation' ? IMD_STOPS.map(([,c])=>c)
    : mode === 'growth' ? GROWTH_STOPS.map(([,c])=>c)
    : mode === 'urban' ? URBAN_STOPS.light.map(([, c]) => c)
    : ['transparent'];
  return (
    <span className="flex h-6 w-full overflow-hidden rounded-md border border-line" aria-hidden>
      {colours.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c, opacity: mode === 'outline' ? 1 : 0.75, borderRight: mode === 'outline' ? 'none' : undefined }} />
      ))}
    </span>
  );
}

export function LayersPanel(p: Props) {
  return (
    <div className="text-ink">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <h2 className="text-[14px] font-semibold">Map options</h2>
        <button onClick={p.onClose} aria-label="Close map options" className="grid size-11 md:size-8 place-items-center rounded-lg text-faint hover:bg-surface-hover hover:text-ink">
          <CloseIcon />
        </button>
      </div>

      <Group title="Map style">
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Map style">
          {APP_CONFIG.basemaps.map((b) => {
            const on = b.id === p.basemap;
            return (
              <button key={b.id} role="radio" aria-checked={on} onClick={() => p.onBasemap(b.id)} className="group flex flex-col items-center gap-1.5">
                <span
                  className={`block aspect-square w-full rounded-lg border-2 transition-colors ${on ? 'border-accent' : 'border-line group-hover:border-faint'}`}
                  style={{ background: `linear-gradient(135deg, ${b.swatch[0]} 55%, ${b.swatch[1]} 55%)` }}
                />
                <span className={`text-[11.5px] ${on ? 'font-semibold text-accent-text' : 'text-muted'}`}>{b.label}</span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Colour regions by">
        <label className="sr-only" htmlFor="metric-select">Map measure</label>
        <select id="metric-select" value={p.colourMode} onChange={e=>p.onColourMode(e.target.value as ColourMode)} className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-[13px] text-ink">
          <optgroup label="Map and existing insights">
            {COLOUR_MODES.filter(m=>m.id==='prices'?p.available.prices:m.id==='urban'?p.available.urban:m.id==='deprivation'?p.available.deprivation:m.id==='growth'?p.available.growth:true).map(m=><option key={m.id} value={m.id}>{m.id==='density'?'Postcode density':m.label}</option>)}
          </optgroup>
          {['People','Safety','Housing','Connectivity','Transport','Services','Environment'].map(topic=><optgroup key={topic} label={topic}>
            {(p.metrics??[]).filter(m=>m.topic===topic&&m.status==='available').map(m=><option key={m.id} value={`metric:${m.id}`}>{m.title}</option>)}
          </optgroup>)}
        </select>
        <div className="mt-2"><ColourPreview mode={p.colourMode}/></div>
        <details className="mt-2 text-[11.5px] leading-snug text-muted"><summary className="cursor-pointer">Definition and coverage</summary><p className="mt-1">{metricFor(p.colourMode)?.note ?? COLOUR_MODES.find(m=>m.id===p.colourMode)?.hint}</p></details>
        {metricFor(p.colourMode) && <p className="mt-2 text-[11px] text-muted">{metricFor(p.colourMode)?.period} · <a className="text-accent-text underline" href={metricFor(p.colourMode)?.source} target="_blank" rel="noreferrer">Data source</a></p>}
      </Group>
      {!!p.availability?.length && <Group title="Data availability"><details><summary className="cursor-pointer text-[12px] text-muted">Sources awaiting access or coverage</summary><ul className="mt-2 space-y-3">{p.availability.map(d=><li key={d.id} className="text-[11.5px] text-muted"><strong className="block text-ink">{d.title}</strong>{d.reason} <a className="text-accent-text underline" href={d.url} target="_blank" rel="noreferrer">Source / official service</a></li>)}</ul></details></Group>}

      <Group title="Show on the map">
        <div className="flex flex-wrap gap-1.5">
          {PLACE_TOGGLES.map(({ key, icon, label }) => {
            const on = p.places[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => p.onPlaces({ ...p.places, [key]: !on })}
                className={`flex h-9 items-center gap-1.5 rounded-full border pr-3 pl-1.5 text-[12.5px] font-medium transition-colors ${on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-ink hover:bg-surface-hover'}`}
              >
                <span className="size-5 rounded-full border-2 border-surface" style={{ background: PLACE_STYLE[icon].colour, opacity: on ? 1 : 0.55 }} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">Zoom in to see them. From Overture Maps and OpenStreetMap via Overpass; detail areas only.</p>
      </Group>

      <Group title="Boundaries and flood overlay">
        <div className="space-y-1">
          {([
            ['flood', 'River and sea flood risk', 'Environment Agency, England only; zoom 13+'],
            ['countries', 'Country borders', 'England, Wales and Scotland'],
            ['councils', 'Council boundaries', 'Local authorities, with names'],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-surface-hover">
              <span>
                <span className="block text-[13px] font-medium text-ink">{label}</span>
                <span className="block text-[11.5px] text-muted">{hint}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={p.borders[key]}
                onChange={(e) => p.onBorders({ ...p.borders, [key]: e.target.checked })}
                className="peer sr-only"
              />
              <span aria-hidden className="relative h-6 w-10 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">Postcode areas do not follow council borders. Flood overlay: river/sea risk in England only, no surface-water layer; absence of colour does not prove no risk.</p>
      </Group>

      {p.showDetail && (
        <Group title="Detail level">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Postcode detail level">
            {(['auto', ...LEVELS] as DetailMode[]).map((m) => {
              const on = m === p.mode;
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={on}
                  onClick={() => p.onMode(m)}
                  className={`h-9 rounded-lg border px-3 text-[13px] font-medium ${on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-ink hover:bg-surface-hover'}`}
                >
                  {m === 'auto' ? 'Auto' : LEVEL_LABELS[m].short}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-muted">Auto changes detail as you zoom.</p>
        </Group>
      )}

      <div className="border-t border-line px-4 py-3">
        <button onClick={p.onAbout} className="flex items-center gap-2 text-[13px] font-medium text-accent-text">
          <InfoIcon width={16} height={16} /> About the data and accuracy
        </button>
      </div>
    </div>
  );
}
