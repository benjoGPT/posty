'use client';

import type { ReactNode } from 'react';
import { HomeIcon, InfoIcon, MinusIcon, MoonIcon, PlusIcon, SunIcon, UkIcon } from './Icons';

interface Props {
  theme: 'light' | 'dark';
  homeName: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  onUk: () => void;
  onTheme: () => void;
  onAbout: () => void;
}

function Btn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center text-muted transition-colors hover:bg-surface-hover hover:text-ink"
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
        <Btn label="Zoom in" onClick={p.onZoomIn}><PlusIcon /></Btn>
        <Btn label="Zoom out" onClick={p.onZoomOut}><MinusIcon /></Btn>
      </div>
      <div className={group}>
        <Btn label={`Reset map to ${p.homeName}`} onClick={p.onHome}><HomeIcon /></Btn>
        <Btn label="View entire UK" onClick={p.onUk}><UkIcon /></Btn>
      </div>
      <div className={group}>
        <Btn label={p.theme === 'light' ? 'Switch to dark map' : 'Switch to light map'} onClick={p.onTheme}>
          {p.theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </Btn>
        <Btn label="About the data" onClick={p.onAbout}><InfoIcon /></Btn>
      </div>
    </div>
  );
}
