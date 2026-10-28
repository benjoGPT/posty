'use client';

import {metricFor,metricStops,type MetricDefinition,type DataAvailability} from '@/lib/metrics';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { APP_CONFIG, basemapById, type BasemapId } from '@/config/app';
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
    <fieldset className="border-b border-line px-4 py-4">
      <legend className="mb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function ColourPreview({ mode, theme = 'light' }: { mode: ColourMode; theme?: 'light' | 'dark' }) {
  const metric=metricFor(mode);
  const colours = metric ? metricStops(metric,theme).map(([,c])=>c) :
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

type PanelTab = 'data' | 'places' | 'settings';
interface LayerChoice { id: ColourMode; title: string; topic: string; hint: string; search: string }
const TOPICS = ['Popular', 'All', 'Map appearance', 'People', 'Crime', 'Housing', 'Broadband', 'Transport', 'Services', 'Environment'];
const POPULAR = ['colours', 'prices', 'deprivation', 'metric:population_density', 'metric:crime_rate', 'metric:gigabit'];
const SHORT_NAMES: Record<string, string> = { population: 'Population', population_density: 'Population density', mean_age: 'Average age (estimate)', children: 'Children under 15', older: 'Residents aged 65+', crime_rate: 'Crime rate', crime_count: 'Recorded crimes', crime_change: 'Crime trend', gigabit: 'Gigabit broadband', superfast: 'Superfast broadband' };
const TABS: { id: PanelTab; label: string }[] = [{ id: 'data', label: 'Data layers' }, { id: 'places', label: 'Places' }, { id: 'settings', label: 'Map settings' }];
const SEARCH_ALIASES: Record<string, string> = { station_distance: 'train railway station', green_distance: 'park parks green space outdoors', gp_distance: 'doctor medical health GP surgery', supermarket_distance: 'shops grocery shopping', pharmacy_distance: 'chemist pharmacy', school_distance: 'school education' };
const topicOf = (topic: string) => topic === 'Safety' ? 'Crime' : topic === 'Connectivity' ? 'Broadband' : topic;

export function LayersPanel(p: Props) {
  const prefix = useId();
  const [tab, setTab] = useState<PanelTab>('data');
  const [topic, setTopic] = useState('Popular');
  const [query, setQuery] = useState('');
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pc-options-view') ?? '{}');
      if (TABS.some(t => t.id === saved.tab)) setTab(saved.tab);
      if (TOPICS.includes(saved.topic)) setTopic(saved.topic);
    } catch { /* optional preference */ }
  }, []);
  function remember(nextTab: PanelTab, nextTopic: string) {
    try { localStorage.setItem('pc-options-view', JSON.stringify({ tab: nextTab, topic: nextTopic })); } catch { /* optional preference */ }
  }
  const available = COLOUR_MODES.filter(m => m.id === 'prices' ? p.available.prices : m.id === 'urban' ? p.available.urban : m.id === 'deprivation' ? p.available.deprivation : m.id === 'growth' ? p.available.growth : true);
  const choices: LayerChoice[] = [
    ...available.map(m => ({ id: m.id, title: m.id === 'density' ? 'Postcode density' : m.label, topic: m.id === 'prices' || m.id === 'growth' ? 'Housing' : m.id === 'deprivation' ? 'People' : 'Map appearance', hint: m.id === 'deprivation' ? 'English IMD 2025 · mean decile' : m.id === 'prices' ? 'England and Wales · median sale prices' : m.id === 'growth' ? 'England and Wales · complete-year sale medians' : 'Map appearance', search: `${m.label} ${m.hint}` })),
    ...(p.metrics ?? []).filter(m => m.status === 'available').map(m => ({ id: `metric:${m.id}` as ColourMode, title: SHORT_NAMES[m.id] ?? m.title, topic: topicOf(m.topic), hint: `${m.period} · ${m.unit}`, search: `${m.title} ${m.id} ${SEARCH_ALIASES[m.id] ?? ''} ${m.topic} ${m.topic === 'People' ? 'population age demographics' : m.topic === 'Safety' ? 'crime safety' : m.topic === 'Connectivity' ? 'broadband internet fibre' : ''}` })),
  ];
  const search = query.trim().toLowerCase();
  const matches = choices.filter(m => search ? `${m.title} ${m.topic} ${m.search}`.toLowerCase().includes(search) : topic === 'All' || topic === 'Popular' && POPULAR.includes(m.id) || m.topic === topic);
  const groups = topic === 'Popular' && !search ? ['Popular layers'] : TOPICS.slice(2).filter(t => matches.some(m => m.topic === t));
  const active = metricFor(p.colourMode);
  const title = active?.title ?? COLOUR_MODES.find(m => m.id === p.colourMode)?.label ?? 'Map colours';
  const theme = basemapById(p.basemap).theme as 'light' | 'dark';

  function layerRows(rows: LayerChoice[]) {
    return <div className="space-y-1.5">{rows.map(m => <label key={m.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${p.colourMode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-faint hover:bg-surface-hover'}`}>
      <input type="radio" name={`${prefix}-measure`} value={m.id} checked={p.colourMode === m.id} onChange={() => p.onColourMode(m.id)} className="size-4 shrink-0 accent-accent" />
      <span className="min-w-0"><span className={`block text-[13px] font-medium ${p.colourMode === m.id ? 'text-accent-text' : 'text-ink'}`}>{m.title}</span><span className="mt-0.5 block text-[11px] leading-snug text-muted">{m.hint}</span></span>
    </label>)}</div>;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-ink">
      <header className="shrink-0 border-b border-line bg-surface px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-[16px] font-semibold">Map options</h2><p className="mt-0.5 text-[12px] text-muted">Choose what the map shows.</p></div>
          <button type="button" onClick={p.onClose} aria-label="Close map options" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover"><CloseIcon /></button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1" role="tablist" aria-label="Map option sections" onKeyDown={e => {
          const index = TABS.findIndex(t => t.id === tab);
          const next = e.key === 'ArrowRight' ? (index + 1) % TABS.length : e.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
          if (next < 0) return; e.preventDefault(); setTab(TABS[next].id); remember(TABS[next].id, topic); (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]).focus();
        }}>
          {TABS.map(t => <button key={t.id} type="button" id={`${prefix}-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`${prefix}-panel`} tabIndex={tab === t.id ? 0 : -1} onClick={() => { setTab(t.id); remember(t.id, topic); }} className={`min-h-11 border-b-2 px-1 text-[12px] font-semibold ${tab === t.id ? 'border-accent text-accent-text' : 'border-transparent text-muted hover:bg-surface-hover hover:text-ink'}`}>{t.label}</button>)}
        </div>
      </header>

      <div id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'data' && <>
          <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-3">
            <label htmlFor={`${prefix}-search`} className="sr-only">Find a data layer</label>
            <div className="relative"><input id={`${prefix}-search`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search data layers…" className="h-11 w-full rounded-lg border border-line bg-surface-2 px-3 pr-16 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent" />{query && <button type="button" onClick={() => setQuery('')} className="absolute top-0 right-1 h-11 px-2 text-[12px] text-accent-text">Clear</button>}</div>
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Layer topics">{TOPICS.filter(t => t === 'Popular' || t === 'All' || choices.some(m => m.topic === t)).map(t => <button key={t} type="button" aria-pressed={!search && topic === t} onClick={() => { setTopic(t); setQuery(''); remember(tab, t); }} className={`min-h-8 rounded-md border px-2.5 py-1 text-[11.5px] font-medium ${!search && topic === t ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-muted hover:bg-surface-hover hover:text-ink'}`}>{t}</button>)}</div>
          </div>
          <p role="status" className="px-4 pt-3 text-[11px] text-muted">{matches.length} {matches.length === 1 ? 'layer' : 'layers'}{search ? ` matching “${query.trim()}”` : ''} · choose one to colour the map</p>
          {groups.map(group => <Group key={group} title={group}>{layerRows(group === 'Popular layers' ? matches : matches.filter(m => m.topic === group))}</Group>)}
          {!matches.length && <div className="px-4 py-8 text-[13px] text-muted"><p>No layers found. Try crime, population or broadband.</p><button type="button" onClick={() => { setQuery(''); setTopic('All'); remember(tab, 'All'); }} className="mt-3 rounded-lg border border-line px-3 py-2 text-accent-text">Show all layers</button></div>}
        </>}

        {tab === 'places' && <>
          <p className="px-4 pt-4 text-[12px] leading-relaxed text-muted">Show nearby places in SY, TF, WV and DY. Zoom in to see markers. These toggles can be combined.</p>
          {(['Transport', 'Everyday services', 'Community and green space'] as const).map(group => <Group key={group} title={group}><div className="space-y-1">{PLACE_TOGGLES.filter(t => group === 'Transport' ? ['stations', 'stops'].includes(t.key) : group === 'Everyday services' ? ['supermarkets', 'pharmacies', 'gps'].includes(t.key) : ['parks', 'schools', 'postboxes'].includes(t.key)).map(({ key, icon, label }) => <label key={key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover"><span className="size-3 rounded-full" style={{ background: PLACE_STYLE[icon].colour }} aria-hidden /><span className="flex-1 text-[13px] font-medium">{label}</span><input type="checkbox" checked={p.places[key]} onChange={e => p.onPlaces({ ...p.places, [key]: e.target.checked })} className="size-4 accent-accent" /></label>)}</div></Group>)}
          <p className="px-4 py-4 text-[11.5px] leading-relaxed text-muted">Overture Maps and OpenStreetMap listings can be incomplete. Green-space points are mapped centres, not entrances or guarantees of public access.</p>
        </>}

        {tab === 'settings' && <>
          <Group title="Map style"><div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Map style">{APP_CONFIG.basemaps.map(b => <button key={b.id} type="button" role="radio" aria-checked={p.basemap === b.id} onClick={() => p.onBasemap(b.id)} className={`rounded-lg border p-2 text-[12px] ${p.basemap === b.id ? 'border-accent bg-accent-soft font-semibold text-accent-text' : 'border-line hover:bg-surface-hover'}`}><span className="mb-2 block h-8 rounded" style={{ background: `linear-gradient(135deg, ${b.swatch[0]} 55%, ${b.swatch[1]} 55%)` }} aria-hidden />{b.label}</button>)}</div></Group>
          <Group title="Boundaries and flood risk"><div className="space-y-2">{([
            ['countries', 'Country borders', 'England, Wales and Scotland'], ['councils', 'Council boundaries', 'Local authority boundaries and names'], ['flood', 'River and sea flood risk', 'Environment Agency · England · zoom 13+'],
          ] as const).map(([key, label, hint]) => <label key={key} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-1 py-2 hover:bg-surface-hover"><span className="flex-1"><span className="block text-[13px] font-medium">{label}</span><span className="mt-0.5 block text-[11px] text-muted">{hint}</span></span><input type="checkbox" role="switch" checked={!!p.borders[key]} onChange={e => p.onBorders({ ...p.borders, [key]: e.target.checked })} className="size-4 shrink-0 accent-accent" /></label>)}</div><p className="mt-2 text-[11.5px] leading-relaxed text-muted">Flood data covers rivers and sea in England, excluding surface water. An uncoloured area does not prove no risk.</p></Group>
          {p.showDetail && <Group title="Postcode detail"><div className="flex flex-wrap gap-2">{(['auto', ...LEVELS] as DetailMode[]).map(m => <button key={m} type="button" aria-pressed={p.mode === m} onClick={() => p.onMode(m)} className={`min-h-10 rounded-lg border px-3 text-[12px] ${p.mode === m ? 'border-accent bg-accent-soft text-accent-text' : 'border-line hover:bg-surface-hover'}`}>{m === 'auto' ? 'Auto' : LEVEL_LABELS[m].short}</button>)}</div><p className="mt-2 text-[11.5px] text-muted">Auto changes detail as you zoom.</p></Group>}
          {!!p.availability?.length && <Group title="Data coverage"><div className="space-y-3">{p.availability.map(d => <details key={d.id} className="text-[12px] text-muted"><summary className="cursor-pointer font-medium text-ink">{d.title} · unavailable</summary><p className="mt-2 leading-relaxed">{d.reason} <a className="text-accent-text underline" href={d.url} target="_blank" rel="noreferrer">Official service</a></p></details>)}</div></Group>}
          <button type="button" onClick={p.onAbout} className="m-4 flex min-h-11 items-center gap-2 text-[13px] font-medium text-accent-text"><InfoIcon width={16} height={16} />About the data and accuracy</button>
        </>}
      </div>

      <footer className="max-h-[38%] shrink-0 overflow-y-auto border-t border-line bg-surface-2 px-4 py-3">
        <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">Active colour layer</p>
        <h3 className="mt-1 text-[13px] font-semibold">{title}</h3>
        <div className="mt-2"><ColourPreview mode={p.colourMode} theme={theme} /></div>
        <p className="mt-2 text-[11px] text-muted">{active ? `${active.period} · ${active.unit}` : 'One colour layer at a time. Place markers can be combined.'}</p>
        <details className="mt-2 text-[11px] leading-relaxed text-muted"><summary className="cursor-pointer">Definition and coverage</summary><p className="mt-2">{active?.note ?? COLOUR_MODES.find(m => m.id === p.colourMode)?.hint}{active && <> <a href={active.source} target="_blank" rel="noreferrer" className="text-accent-text underline">Source</a></>}</p></details>
      </footer>
    </div>
  );
}
