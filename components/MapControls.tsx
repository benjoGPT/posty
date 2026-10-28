'use client';

import type { ReactNode } from 'react';
import { HomeIcon, LayersIcon, LocateIcon, MinusIcon, PlayIcon, PlusIcon, UkIcon } from './Icons';

interface Props {
  homeName: string;
  compact: boolean;
  locating: boolean;
  layersOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  onUk: () => void;
  onLocate: () => void;
  onLayers: () => void;
  onQuiz: () => void;
}

function Btn({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`grid size-11 place-items-center transition-colors md:size-10 ${pressed ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-hover hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

const group = 'flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float divide-y divide-line';

export function MapControls(p: Props) {
  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <div className={group}>
        <Btn label="Map options: style, colours and detail" onClick={p.onLayers} pressed={p.layersOpen}><LayersIcon /></Btn>
        <Btn label="Postcode quiz" onClick={p.onQuiz}><PlayIcon /></Btn>
      </div>
      <div className={group}>
        <Btn label="Find my nearest postcode" onClick={p.onLocate}>
          <LocateIcon className={p.locating ? 'animate-pulse text-accent' : ''} />
        </Btn>
        <Btn label={`Reset map to ${p.homeName}`} onClick={p.onHome}><HomeIcon /></Btn>
        <Btn label="View entire UK" onClick={p.onUk}><UkIcon /></Btn>
      </div>
      {/* Pinch-zoom covers this on touch screens. */}
      {!p.compact && (
        <div className={group}>
          <Btn label="Zoom in" onClick={p.onZoomIn}><PlusIcon /></Btn>
          <Btn label="Zoom out" onClick={p.onZoomOut}><MinusIcon /></Btn>
        </div>
      )}
    </div>
  );
}
