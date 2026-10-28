'use client';

import type { ReactNode } from 'react';
import { APP_CONFIG, type BasemapId } from '@/config/app';
import { LEVEL_LABELS, LEVELS, type DetailMode } from '@/lib/levels';
import { DENSITY_STOPS, REGION_COLOURS, type ColourMode } from '@/lib/mapLayers';
import { CloseIcon, InfoIcon } from './Icons';

interface Props {
  basemap: BasemapId;
  colourMode: ColourMode;
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
  { id: 'outline', label: 'Outline', hint: 'Boundaries only' },
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
  const colours = mode === 'colours' ? REGION_COLOURS.light : mode === 'density' ? DENSITY_STOPS.filter((_, i) => i % 2 === 0).map(([, c]) => c) : ['transparent'];
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
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-[14px] font-semibold">Map options</h2>
        <button onClick={p.onClose} aria-label="Close map options" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-surface-hover hover:text-ink">
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
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Colour regions by">
          {COLOUR_MODES.map((m) => {
            const on = m.id === p.colourMode;
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={on}
                title={m.hint}
                onClick={() => p.onColourMode(m.id)}
                className={`flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-hover'}`}
              >
                <ColourPreview mode={m.id} />
                <span className={`text-[12.5px] font-medium ${on ? 'text-accent-text' : 'text-ink'}`}>{m.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-muted">{COLOUR_MODES.find((m) => m.id === p.colourMode)?.hint}.</p>
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
