'use client';

import { useState } from 'react';
import { LEVEL_LABELS, LEVELS, type Level } from '@/lib/levels';
import { LayersIcon } from './Icons';

interface Props {
  level: Level;
  basemap: 'hosted' | 'offline';
  defaultOpen: boolean;
}

export function Legend({ level, basemap, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-muted shadow-float hover:text-ink"
        aria-expanded={false}
      >
        <LayersIcon width={16} height={16} /> Legend
      </button>
    );
  }
  const active = LEVELS.indexOf(level);
  return (
    <section aria-label="Map legend" className="animate-in pointer-events-auto w-[236px] rounded-xl border border-line bg-surface p-3 text-[12px] shadow-float">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-wider text-faint uppercase">Postcode levels</h2>
        <button onClick={() => setOpen(false)} className="rounded px-1 text-[11px] text-faint hover:text-ink" aria-expanded>
          Hide
        </button>
      </div>
      <ol className="space-y-1">
        {LEVELS.map((l, i) => (
          <li key={l} className={`flex items-center gap-2.5 rounded-md px-1.5 py-1 ${i === active ? 'bg-accent-soft' : ''}`} aria-current={i === active ? 'true' : undefined}>
            {l === 'units' ? (
              <span className="grid size-4 place-items-center"><span className="size-2.5 rounded-full border-[1.5px] border-surface bg-accent" /></span>
            ) : (
              <span className="size-4 rounded-[3px] border border-accent/70 bg-accent/10" style={{ borderWidth: l === 'areas' ? 2 : l === 'districts' ? 1.5 : 1 }} />
            )}
            <span className={`flex-1 ${i === active ? 'font-semibold text-accent-text' : 'text-ink'}`}>{LEVEL_LABELS[l].plural}</span>
            <span className="font-mono text-[11px] text-faint">{LEVEL_LABELS[l].example}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2.5 border-t border-line pt-2 leading-snug text-muted">
        Boundaries are <strong className="font-semibold text-ink">approximate</strong>, derived from postcode reference points. Dots are official reference points, not addresses.
      </p>
      {basemap === 'offline' && <p className="mt-1.5 leading-snug text-warn">Basemap unavailable — showing coastline only.</p>}
    </section>
  );
}
