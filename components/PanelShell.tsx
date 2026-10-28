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
 * Bottom sheet (mobile). Starts collapsed showing the top of the content.
 * Drag up to expand and down to collapse or dismiss: from the handle at any
 * time, or from anywhere on the sheet while it is collapsed. Tapping the
 * handle (or the collapsed sheet) toggles.
 */
export function BottomSheet({
  children, label, onClose, resetKey, peek = SHEET_PEEK, startExpanded = false,
}: { children: ReactNode; label: string; onClose: () => void; resetKey: string; peek?: number; startExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [dragY, setDragY] = useState<number | null>(null);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => setExpanded(startExpanded), [resetKey, startExpanded]);

  const end = (dy: number, dt: number) => {
    const fast = Math.abs(dy) / Math.max(dt, 1) > 0.5;
    if (dy < -40 || (fast && dy < 0)) setExpanded(true);
    else if (dy > 40 || (fast && dy > 0)) {
      if (expanded && !startExpanded) setExpanded(false);
      else onClose();
    }
    setDragY(null);
  };

  const base = expanded ? '0px' : `calc(100% - ${peek}px)`;
  const transform = dragY == null ? `translateY(${base})` : `translateY(calc(${base} + ${dragY}px))`;

  return (
    <aside
      aria-label={label}
      className={`pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex max-h-[86dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-float ${expanded ? '' : 'touch-none select-none'} ${dragY != null ? 'select-none' : ''}`}
      style={{ transform, transition: dragY == null ? 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none' }}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        const onHandle = !!t.closest('[data-sheet-handle]');
        if (!onHandle && (expanded || t.closest('button, a, input, select, textarea'))) return;
        start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dy = e.clientY - start.current.y;
        if (Math.abs(dy) > 6) moved.current = true;
        if (moved.current) setDragY(expanded ? Math.max(0, dy) : dy);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const dy = e.clientY - start.current.y;
        const dt = performance.now() - start.current.t;
        start.current = null;
        if (!moved.current) { setDragY(null); if (!startExpanded || !expanded) setExpanded((x) => !x); return; }
        end(dy, dt);
      }}
      onPointerCancel={() => { start.current = null; setDragY(null); }}
    >
      <div data-sheet-handle role="button" tabIndex={0} aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((x) => !x); } }}
        className="flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center">
        <span className="h-1 w-10 rounded-full bg-line" />
      </div>
      <div className={`min-h-0 flex-1 ${expanded ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'} pb-[env(safe-area-inset-bottom)]`}>{children}</div>
    </aside>
  );
}
