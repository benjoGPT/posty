'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Floating side panel (desktop). */
export function SidePanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside
      aria-label={label}
      className="animate-in pointer-events-auto absolute top-3 right-3 bottom-3 w-[372px] overflow-hidden"
    >
      <div className="max-h-full overflow-y-auto rounded-2xl border border-line bg-surface shadow-float">{children}</div>
    </aside>
  );
}

export const SHEET_PEEK = 248;

/**
 * Bottom sheet (mobile). Starts collapsed showing the top of the content;
 * drag the handle up to expand, down to collapse or dismiss. Tapping the
 * handle toggles.
 */
export function BottomSheet({ children, label, onClose, resetKey }: { children: ReactNode; label: string; onClose: () => void; resetKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const start = useRef<{ y: number; t: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => setExpanded(false), [resetKey]);

  const end = (dy: number, dt: number) => {
    const fast = Math.abs(dy) / Math.max(dt, 1) > 0.5;
    if (dy < -40 || (fast && dy < 0)) setExpanded(true);
    else if (dy > 40 || (fast && dy > 0)) {
      if (expanded) setExpanded(false);
      else onClose();
    }
    setDragY(null);
  };

  const base = expanded ? '0px' : `calc(100% - ${SHEET_PEEK}px)`;
  const transform = dragY == null ? `translateY(${base})` : `translateY(calc(${base} + ${dragY}px))`;

  return (
    <aside
      aria-label={label}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex max-h-[86dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-float"
      style={{ transform, transition: dragY == null ? 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}
    >
      <button
        type="button"
        aria-label={expanded ? 'Collapse details' : 'Expand details'}
        aria-expanded={expanded}
        className="flex h-6 w-full shrink-0 touch-none items-center justify-center"
        onPointerDown={(e) => {
          start.current = { y: e.clientY, t: performance.now() };
          moved.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dy = e.clientY - start.current.y;
          if (Math.abs(dy) > 4) moved.current = true;
          setDragY(expanded ? Math.max(0, dy) : dy);
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const dy = e.clientY - start.current.y;
          const dt = performance.now() - start.current.t;
          start.current = null;
          if (!moved.current) { setDragY(null); setExpanded((x) => !x); return; }
          end(dy, dt);
        }}
        onPointerCancel={() => { start.current = null; setDragY(null); }}
      >
        <span className="h-1 w-10 rounded-full bg-line" />
      </button>
      <div className={`min-h-0 flex-1 ${expanded ? 'overflow-y-auto' : 'overflow-hidden'} pb-[env(safe-area-inset-bottom)]`}>{children}</div>
    </aside>
  );
}
