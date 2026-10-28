'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import type { HoverInfo } from '@/lib/mapController';

export interface MapHoverHandle { update: (info: HoverInfo | null) => void }

// Pointer movement only updates this small tooltip, not the map controls and panels.
export const MapHover = forwardRef<MapHoverHandle, { active: boolean }>(function MapHover({ active }, ref) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  useImperativeHandle(ref, () => ({ update: (info) => setHover(active ? info : null) }), [active]);
  if (!active || !hover) return null;
  return (
    <div className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-[12px] shadow-float" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <div className="font-semibold text-ink">{hover.title}</div>
      <div className="text-[11px] text-muted">{hover.subtitle}</div>
    </div>
  );
});
