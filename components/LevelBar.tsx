'use client';

import { LEVEL_LABELS, LEVELS, type DetailMode, type Level } from '@/lib/levels';
import { ChevronDown } from './Icons';

interface Props {
  level: Level;
  mode: DetailMode;
  loading: boolean;
  onMode: (m: DetailMode) => void;
  /** Phones: one compact chip that opens the map options instead of the full selector. */
  compact?: boolean;
  onOpenOptions?: () => void;
}

const MODES: DetailMode[] = ['auto', ...LEVELS];

export function LevelBar({ level, mode, loading, onMode, compact, onOpenOptions }: Props) {
  if (compact) {
    return (
      <button
        onClick={onOpenOptions}
        className="pointer-events-auto relative flex h-10 items-center gap-2 self-start overflow-hidden rounded-xl border border-line bg-surface pr-2.5 pl-3 text-[13.5px] shadow-float"
        aria-label={`Viewing ${LEVEL_LABELS[level].plural}, detail ${mode === 'auto' ? 'automatic' : 'fixed'}. Change map options`}
      >
        <span className="size-2 rounded-full bg-accent" aria-hidden />
        <span className="font-semibold text-ink">{LEVEL_LABELS[level].plural}</span>
        <span className="text-faint">· {mode === 'auto' ? 'Auto' : 'Fixed'}</span>
        <ChevronDown width={16} height={16} className="text-faint" />
        {loading && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden>
            <span className="block h-full w-1/3 bg-accent" style={{ animation: 'loading-bar 1s ease-in-out infinite' }} />
          </span>
        )}
      </button>
    );
  }
  return (
    <div className="pointer-events-auto -mx-3 flex max-w-[calc(100%+24px)] items-center gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:max-w-full md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [scrollbar-width:none]">
      <div
        className="relative flex h-9 shrink-0 items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface pr-3 pl-2.5 text-[13px] shadow-float"
        role="status"
        aria-live="polite"
      >
        <span className="size-2 rounded-full bg-accent" aria-hidden />
        <span className="hidden text-muted sm:inline">Viewing:</span>
        <span className="font-semibold whitespace-nowrap text-ink">{LEVEL_LABELS[level].plural}</span>
        {loading && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-label="Loading postcode data">
            <span className="block h-full w-1/3 bg-accent" style={{ animation: 'loading-bar 1s ease-in-out infinite' }} />
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="Postcode detail level" className="flex h-9 shrink-0 items-center rounded-lg border border-line bg-surface p-0.5 shadow-float">
        {MODES.map((m) => {
          const selected = m === mode;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={selected}
              onClick={() => onMode(m)}
              title={m === 'auto' ? 'Detail changes automatically with zoom' : `Always show ${LEVEL_LABELS[m].plural.toLowerCase()}`}
              className={`h-full rounded-md px-2 text-[12.5px] md:px-2.5 font-medium whitespace-nowrap transition-colors ${
                selected ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {m === 'auto' ? 'Auto' : LEVEL_LABELS[m].short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
