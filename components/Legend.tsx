'use client';

import { useState } from 'react';
import { LEVEL_LABELS, LEVELS, type Level } from '@/lib/levels';
import { densityStops, PALETTE, priceStops, REGION_COLOURS, URBAN_STOPS, type BorderOptions, type ColourMode, type Theme } from '@/lib/mapLayers';
import { LayersIcon } from './Icons';

interface Props {
  level: Level;
  basemap: 'hosted' | 'offline';
  colourMode: ColourMode;
  borders: BorderOptions;
  theme: Theme;
  defaultOpen: boolean;
  unofficialData: boolean;
  priceScale?: number[] | null;
  onAbout: () => void;
}

const fmt = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));

export function Legend({ level, basemap, colourMode, borders, theme, defaultOpen, unofficialData, priceScale, onAbout }: Props) {
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
      {colourMode === 'density' && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="mb-1 text-muted">Postcodes per km²</div>
          <div className="flex h-2.5 overflow-hidden rounded-sm" aria-hidden>
            {densityStops(theme).map(([v, c]) => <span key={v} className="flex-1" style={{ background: c }} />)}
          </div>
          <div className="tabular mt-0.5 flex justify-between text-[10.5px] text-faint">
            {densityStops(theme).filter((_, i) => i % 2 === 0).map(([v]) => <span key={v}>{fmt(v)}</span>)}
          </div>
        </div>
      )}

      {colourMode === 'prices' && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="mb-1 text-muted">Median house price, last 3 years</div>
          <div className="flex h-2.5 overflow-hidden rounded-sm" aria-hidden>
            {priceStops(theme, priceScale).map(([v, c]) => <span key={v} className="flex-1" style={{ background: c }} />)}
          </div>
          <div className="tabular mt-0.5 flex justify-between text-[10.5px] text-faint">
            {priceStops(theme, priceScale).filter((_, i) => i % 2 === 0).map(([v]) => <span key={v}>£{v / 1000}k</span>)}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-faint">Steps are spread so each holds a similar number of districts. England &amp; Wales only (Land Registry). Grey: no data or too few sales.</p>
        </div>
      )}
      {colourMode === 'urban' && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="mb-1 text-muted">Share of postcodes in urban areas</div>
          <div className="h-2.5 rounded-sm" aria-hidden style={{ background: `linear-gradient(90deg, ${URBAN_STOPS[theme].map(([, c]) => c).join(', ')})` }} />
          <div className="mt-0.5 flex justify-between text-[10.5px] text-faint"><span>Rural</span><span>Mixed</span><span>Urban</span></div>
        </div>
      )}

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

      <p className="mt-2 border-t border-line pt-2 leading-snug text-muted">
        Boundaries are <strong className="font-semibold text-ink">approximate</strong>, derived from postcode reference points. Dots are official reference points, not addresses.
      </p>
      {unofficialData && (
        <p className="mt-1.5 leading-snug text-faint">
          Data: unofficial copy of ONS February 2026, cross-checked.{' '}
          <button onClick={onAbout} className="font-medium text-accent-text underline-offset-2 hover:underline">Details</button>
        </p>
      )}
      {basemap === 'offline' && <p className="mt-1.5 leading-snug text-warn">Basemap unavailable — showing coastline only.</p>}
    </section>
  );
}
