'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
const widthLimit = () => Math.max(MIN_WIDTH, Math.min(640, Math.floor(window.innerWidth * 0.45)));
const clampWidth = (width: number) => Math.max(MIN_WIDTH, Math.min(widthLimit(), width));

export function OptionsSidebar({ children, onClose,fullScreen=false }: { children: ReactNode; onClose: () => void;fullScreen?:boolean }) {
  const pane = useRef<HTMLElement>(null);
  const splitter = useRef<HTMLDivElement>(null);
  const current = useRef(DEFAULT_WIDTH);
  const frame = useRef(0);
  const drag = useRef<{ id: number; startX: number; startWidth: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [maximum, setMaximum] = useState(640);

  function commit(next: number) {
    const value = clampWidth(Math.round(next));
    current.current = value;
    if (pane.current&&!fullScreen) pane.current.style.width = `${value}px`;
    setWidth(value);
    try { localStorage.setItem('pc-options-width', String(value)); } catch { /* optional preference */ }
  }

  useEffect(() => {
    let saved = DEFAULT_WIDTH;
    try { const value = Number(localStorage.getItem('pc-options-width')); if (Number.isFinite(value) && value >= MIN_WIDTH) saved = value; } catch { /* optional preference */ }
    const initial = clampWidth(saved);
    current.current = initial;
    setWidth(initial);
    setMaximum(widthLimit());
    const resize = () => { if(window.innerWidth<768)return;setMaximum(widthLimit()); commit(current.current); };
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(frame.current); };
  }, [fullScreen]);

  function finish() {
    if (!drag.current) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    splitter.current?.removeAttribute('data-dragging');
    commit(current.current);
  }

  return (
    <aside ref={pane} id="map-options-sidebar" aria-label="Map options" style={{ width:fullScreen?'100%':width }} className={`${fullScreen?'fixed inset-0 z-40':'relative z-30'} flex h-full shrink-0 flex-col border-r border-line bg-surface`}>
      <div className="min-h-0 flex-1">{children}</div>
      {!fullScreen&&<><div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-muted">
        <span>Drag the right edge to resize</span>
        <button type="button" onClick={() => commit(DEFAULT_WIDTH)} className="rounded px-1 py-1 text-accent-text hover:bg-surface-hover">Reset width</button>
      </div>
      <div ref={splitter} role="separator" tabIndex={0} aria-label="Resize map options" aria-controls="map-options-sidebar" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={maximum} aria-valuenow={width} aria-valuetext={`${width} pixels`} title="Drag to resize. Arrow keys adjust width. Double-click to reset."
        className="group absolute inset-y-0 -right-1 z-50 flex w-3 cursor-col-resize touch-none select-none items-center justify-center outline-none hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent data-[dragging]:bg-accent/10"
        onDoubleClick={() => commit(DEFAULT_WIDTH)}
        onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, startX: e.clientX, startWidth: current.current }; e.currentTarget.setAttribute('data-dragging', ''); }}
        onPointerMove={e => {
          if (!drag.current || e.pointerId !== drag.current.id) return;
          current.current = clampWidth(Math.round(drag.current.startWidth + e.clientX - drag.current.startX));
          if (frame.current) return;
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            if (pane.current&&!fullScreen) pane.current.style.width = `${current.current}px`;
            splitter.current?.setAttribute('aria-valuenow', String(current.current));
            splitter.current?.setAttribute('aria-valuetext', `${current.current} pixels`);
          });
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onKeyDown={e => {
          let next: number;
          if (e.key === 'ArrowLeft') next = current.current - (e.shiftKey ? 50 : 20);
          else if (e.key === 'ArrowRight') next = current.current + (e.shiftKey ? 50 : 20);
          else if (e.key === 'Home') next = MIN_WIDTH;
          else if (e.key === 'End') next = widthLimit();
          else if (e.key === 'Enter') { e.preventDefault(); onClose(); return; }
          else return;
          e.preventDefault(); commit(next);
        }}>
        <span className="h-12 w-1 rounded-full bg-line group-hover:bg-accent group-focus-visible:bg-accent group-data-[dragging]:bg-accent" aria-hidden />
      </div></>}
    </aside>
  );
}
