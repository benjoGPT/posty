'use client';
import {metricFor} from '@/lib/metrics';

import { useState } from 'react';
import { LEVEL_LABELS, LEVELS, type Level } from '@/lib/levels';
import { densityStops, PALETTE, REGION_COLOURS, type BorderOptions, type ColourMode, type Theme } from '@/lib/mapLayers';
import { LayersIcon } from './Icons';

interface Props {
  level: Level;
  basemap: 'hosted' | 'offline';
  colourMode: ColourMode;
  borders: BorderOptions;
  theme: Theme;
  defaultOpen: boolean;
  unofficialData: boolean;
  onAbout: () => void;
}

export function Legend({ level, basemap, colourMode, borders, theme, defaultOpen, unofficialData, onAbout }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-medium text-muted shadow-float hover:text-ink"
        aria-expanded={false}
      >
        <LayersIcon width={16} height={16} /> Legend
      </button>
    );
  }
  const active = LEVELS.indexOf(level);
  const swatch = (l: Level, i: number) => {
    if (l === 'units') return <span className="grid size-4 place-items-center"><span className="size-2.5 rounded-full border-[1.5px] border-surface bg-accent" /></span>;
    void i;
    const colour = colourMode === 'density' ? densityStops(theme)[3][1] : undefined;
    return (
      <span
        className="size-4 rounded-[3px] border"
        style={{ borderWidth: l === 'areas' ? 2 : l === 'districts' ? 1.5 : 1, borderColor: colour ?? 'color-mix(in srgb, var(--accent) 70%, transparent)', background: colour ? `color-mix(in srgb, ${colour} 40%, transparent)` : 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
      />
    );
  };
  return (
    <section aria-label="Map legend" className="animate-in pointer-events-auto w-[244px] rounded-xl border border-line bg-surface p-3 text-[12px] shadow-float">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-wider text-faint uppercase">Postcode levels</h2>
        <button onClick={() => setOpen(false)} className="rounded px-1 text-[11px] text-faint hover:text-ink" aria-expanded>
          Hide
        </button>
      </div>
      <ol className="space-y-1">
        {LEVELS.map((l, i) => (
          <li key={l} className={`flex items-center gap-2.5 rounded-md px-1.5 py-1 ${i === active ? 'bg-accent-soft' : ''}`} aria-current={i === active ? 'true' : undefined}>
            {swatch(l, i)}
            <span className={`flex-1 ${i === active ? 'font-semibold text-accent-text' : 'text-ink'}`}>{LEVEL_LABELS[l].plural}</span>
            <span className="font-mono text-[11px] text-faint">{LEVEL_LABELS[l].example}</span>
          </li>
        ))}
      </ol>

      {colourMode === 'colours' && (
        <div className="mt-2.5 flex items-start gap-2 border-t border-line pt-2 leading-snug text-muted">
          <span className="mt-0.5 grid shrink-0 grid-cols-2 gap-0.5" aria-hidden>
            {REGION_COLOURS[theme].map((c) => <span key={c} className="size-2 rounded-[2px]" style={{ background: c }} />)}
          </span>
          <span>Colours only keep neighbouring regions apart; they don’t mean anything else.</span>
        </div>
      )}
      {metricFor(colourMode) && <p className="mt-2 text-faint">{metricFor(colourMode)?.note}</p>}
      {colourMode === 'deprivation' && <p className="mt-2 text-faint">English IMD 2025, postcode-weighted mean LSOA decile. Not a population-weighted score. Mixed-border regions show English records only. Grey means unavailable.</p>}
      {colourMode === 'growth' && <p className="mt-2 text-faint">Two complete calendar years, minimum 20 sales each. Different properties sell each year; this is not individual property appreciation. Grey means insufficient data.</p>}
      {colourMode === 'prices' && (
        <p className="mt-2.5 border-t border-line pt-2 leading-snug text-faint">
          Colour steps are spread so each holds a similar number of districts. England &amp; Wales only; grey means no data or too few sales.
        </p>
      )}

      {borders.flood && <p className="mt-2 text-warn">EA river/sea flood bands, England only, zoom 13+. High ≥3.3%, medium 1–3.3%, low 0.1–1%, very low &lt;0.1% annual chance. No surface-water data here. <a className="underline" href="https://www.gov.uk/check-long-term-flood-risk" target="_blank" rel="noreferrer">Official risk check</a></p>}
      {(borders.countries || borders.councils) && (
        <ul className="mt-2.5 space-y-1 border-t border-line pt-2 text-muted">
          {borders.countries && (
            <li className="flex items-center gap-2.5">
              <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke={PALETTE[theme].countryLine} strokeWidth="2.5" strokeDasharray="5 2.5" /></svg>
              Country border
            </li>
          )}
          {borders.councils && (
            <li className="flex items-center gap-2.5">
              <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke={PALETTE[theme].councilLine} strokeWidth="1.5" strokeDasharray="3 3" /></svg>
              Council boundary
            </li>
          )}
        </ul>
      )}

      <p className="mt-2 border-t border-line pt-2 leading-snug text-faint">
        Boundaries are approximate, drawn from postcode points.{' '}
        <button onClick={onAbout} className="font-medium text-accent-text underline-offset-2 hover:underline">About the data</button>
        {unofficialData && ' · unofficial ONS copy'}
      </p>
      {basemap === 'offline' && <p className="mt-1.5 leading-snug text-warn">Basemap unavailable — showing coastline only.</p>}
    </section>
  );
}
