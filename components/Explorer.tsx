'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { APP_CONFIG, type Bounds } from '@/config/app';
import { PostcodeData } from '@/lib/data';
import type { DetailMode } from '@/lib/levels';
import type { HoverInfo, MapController, MapPick, MapViewState, Padding, StackedUnit } from '@/lib/mapController';
import type { Theme } from '@/lib/mapLayers';
import { areaOf } from '@/lib/postcode';
import { resolveUnit, type Selection } from '@/lib/search';
import { readUrlState, writeUrlState } from '@/lib/url';
import { AboutDialog } from './AboutDialog';
import { DetailsContent } from './DetailsPanel';
import { AlertIcon, CheckIcon, CloseIcon } from './Icons';
import { Legend } from './Legend';
import { LevelBar } from './LevelBar';
import { MapControls } from './MapControls';
import { BottomSheet, SHEET_PEEK, SidePanel } from './PanelShell';
import { SearchBox, type NavResult, type NavTarget, type SearchBoxHandle } from './SearchBox';

const MOBILE_QUERY = '(max-width: 767px)';
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(MOBILE_QUERY); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

function storedTheme(): Theme {
  try { return localStorage.getItem('pc-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export default function Explorer() {
  const mapEl = useRef<HTMLDivElement>(null);
  const ctrl = useRef<MapController | null>(null);
  const search = useRef<SearchBoxHandle>(null);
  const [data, setData] = useState<PostcodeData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [mode, setMode] = useState<DetailMode>('auto');
  const [view, setView] = useState<MapViewState | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [stack, setStack] = useState<StackedUnit[] | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [retry, setRetry] = useState(0);
  const isMobile = useIsMobile();
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const showToast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => setToast({ text, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 6000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const padding = useCallback((panelOpen: boolean): Padding => {
    if (mobileRef.current) return { top: 120, right: 24, bottom: panelOpen ? SHEET_PEEK + 24 : 40, left: 24 };
    return { top: 110, right: panelOpen ? 410 : 80, bottom: 50, left: 50 };
  }, []);

  const select = useCallback((sel: Selection | null, opts: { fly?: boolean; keepStack?: boolean } = {}) => {
    setSelection(sel);
    if (!opts.keepStack) setStack(null);
    ctrl.current?.setSelection(sel);
    if (sel && opts.fly) void ctrl.current?.focus(sel, padding(true));
  }, [padding]);

  /** Navigates to a search/link target, validating it against the data. */
  const navigate = useCallback(async (target: NavTarget, fly = true): Promise<NavResult> => {
    if (!data || !ctrl.current) return { ok: false, message: 'The map is still loading.' };
    if (target.kind === 'unit') {
      const r = await resolveUnit(target.code, data);
      if (!r.ok) return r;
      select(r.selection, { fly });
      return { ok: true };
    }
    const { kind, code } = target;
    if (kind === 'area' && !data.areas.has(code)) return { ok: false, message: `There is no postcode area called ${code}.` };
    if (kind === 'district' && !data.districts.has(code)) return { ok: false, message: `There is no postcode district called ${code}.` };
    if (kind === 'sector') {
      const box = await ctrl.current.regionBBox('sector', code);
      if (!box) {
        if (!data.isDetailArea(areaOf(code))) return { ok: false, message: `Sector boundaries for the ${areaOf(code)} area aren’t loaded yet (current detail: ${data.manifest.coverage.detailAreas.join(', ')}). Try the district instead.` };
        return { ok: false, message: `There is no postcode sector ${code}.` };
      }
    }
    select({ kind, code }, { fly });
    return { ok: true };
  }, [data, select]);

  // URL state as the page was opened (before MapLibre writes its own position into the hash).
  const initialUrl = useRef<ReturnType<typeof readUrlState> | null>(null);

  // Load data and create the map once.
  useEffect(() => {
    let cancelled = false;
    let controller: MapController | null = null;
    const initialTheme = storedTheme();
    const url = (initialUrl.current ??= readUrlState());
    setTheme(initialTheme);
    setMode(url.detail);
    document.documentElement.dataset.theme = initialTheme;

    (async () => {
      const d = new PostcodeData();
      try {
        await d.init();
      } catch (e) {
        if (!cancelled) setFatal((e as Error).message || 'Couldn’t load postcode data.');
        return;
      }
      if (cancelled || !mapEl.current) return;
      const { MapController } = await import('@/lib/mapController');
      if (cancelled || !mapEl.current) return;
      controller = await MapController.create(mapEl.current, d, {
        theme: initialTheme,
        mode: url.detail,
        initialBounds: url.hasPosition ? undefined : (APP_CONFIG.homeRegion.bounds as Bounds),
        callbacks: {
          onState: (s) => { if (!cancelled) setView(s); },
          onHover: (h) => { if (!cancelled) setHover(h); },
          onError: (m) => { if (!cancelled) showToast(m, 'error'); },
          onPick: (p: MapPick) => {
            if (cancelled) return;
            if (!p) { if (!mobileRef.current) select(null); return; }
            if (p.kind === 'units') {
              const u = p.units[0];
              select({ kind: 'unit', code: u.code, lng: u.lng, lat: u.lat, status: 'live', origin: 'local', quality: u.q });
              setStack(p.units.length > 1 ? p.units : null);
            } else select({ kind: p.kind, code: p.code });
          },
        },
      });
      if (cancelled) { controller.destroy(); return; }
      ctrl.current = controller;
      setData(d);
    })();

    return () => {
      cancelled = true;
      controller?.destroy();
      ctrl.current = null;
    };
  }, [retry, select, showToast]);

  // Apply the selection in the URL once everything is ready.
  const initialTarget = useRef(true);
  useEffect(() => {
    if (!data || !initialTarget.current) return;
    initialTarget.current = false;
    const url = initialUrl.current;
    if (url?.target) {
      void navigate(url.target, !url.hasPosition).then((r) => { if (!r.ok) showToast(r.message, 'error'); });
    }
  }, [data, navigate, showToast]);

  // Keep the URL shareable.
  useEffect(() => {
    if (!data) return;
    writeUrlState(selection ? { kind: selection.kind, code: selection.code } : null, mode);
  }, [selection, mode, data]);

  // Keyboard shortcuts: "/" focuses search, Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, dialog');
      if (e.key === '/' && !typing) { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape' && !typing && selectionRef.current) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pc-theme', next); } catch { /* private mode */ }
    void ctrl.current?.setTheme(next);
  };

  const changeMode = (m: DetailMode) => {
    setMode(m);
    ctrl.current?.setMode(m);
  };

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    showToast(ok ? `${what} copied: ${text}` : 'Couldn’t copy to the clipboard', ok ? 'ok' : 'error');
  };

  if (fatal) {
    return (
      <main className="grid h-dvh place-items-center bg-surface-2 p-6">
        <div role="alert" className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-float">
          <AlertIcon className="mx-auto mb-3 text-danger" width={28} height={28} />
          <h1 className="text-[17px] font-semibold text-ink">Postcode data unavailable</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">{fatal}</p>
          <p className="mt-1.5 text-[12.5px] text-faint">If you’re running this locally, build the dataset first: <code>npm run data:build</code></p>
          <button onClick={() => { setFatal(null); setRetry((r) => r + 1); }} className="mt-4 h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-white dark:text-[#0c1220]">
            Try again
          </button>
        </div>
      </main>
    );
  }

  const level = view?.level ?? 'districts';
  const panel = data && selection && (
    <DetailsContent
      data={data}
      selection={selection}
      stack={stack}
      onNavigate={(t) => void navigate(t).then((r) => { if (!r.ok) showToast(r.message, 'error'); })}
      onPickStacked={(u) => select({ kind: 'unit', code: u.code, lng: u.lng, lat: u.lat, status: 'live', origin: 'local', quality: u.q }, { keepStack: true })}
      onZoom={() => void ctrl.current?.focus(selection, padding(true))}
      onCopy={(t, w) => void copy(t, w)}
      onShare={() => void copy(window.location.href, 'Link')}
      onClose={() => select(null)}
    />
  );
  const showWarning = data && !data.manifest.source.verified && !warningDismissed;

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* MapLibre styles its container as position: relative, so it gets its own full-size element. */}
      <div className="absolute inset-0">
        <div ref={mapEl} className="h-full w-full" role="application" aria-label="Postcode map. Use arrow keys to pan and plus or minus to zoom." />
      </div>

      {!data && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] text-muted shadow-float">
            <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Loading postcode map…
          </div>
        </div>
      )}

      {hover && !isMobile && (
        <div className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-[12px] shadow-float" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="font-semibold text-ink">{hover.title}</div>
          <div className="text-[11px] text-muted">{hover.subtitle}</div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute top-3 right-3 left-3 flex flex-col gap-2 md:right-auto">
          <SearchBox ref={search} data={data} onNavigate={(t) => navigate(t)} />
          <LevelBar level={level} mode={mode} loading={view?.loading ?? !data} onMode={changeMode} />
          {showWarning && (
            <div role="note" className="pointer-events-auto flex max-w-[380px] items-start gap-2 rounded-lg border border-line bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn shadow-float">
              <AlertIcon width={15} height={15} className="mt-px shrink-0" />
              <span>
                {isMobile ? 'Unverified development data.' : 'Development data: postcode records come from an unverified copy of ONSPD.'}{' '}
                <button onClick={() => setAboutOpen(true)} className="font-semibold underline">Details</button>
              </span>
              <button onClick={() => setWarningDismissed(true)} aria-label="Dismiss" className="-mr-1 shrink-0 opacity-70 hover:opacity-100"><CloseIcon width={14} height={14} /></button>
            </div>
          )}
        </div>

        <div className={`absolute right-3 ${isMobile ? (selection ? 'hidden' : 'bottom-10') : selection ? 'right-[392px] bottom-8' : 'bottom-8'}`}>
          <MapControls
            theme={theme}
            homeName={APP_CONFIG.homeRegion.name}
            onZoomIn={() => ctrl.current?.zoomBy(1)}
            onZoomOut={() => ctrl.current?.zoomBy(-1)}
            onHome={() => ctrl.current?.fitBounds(APP_CONFIG.homeRegion.bounds as Bounds, padding(!!selection))}
            onUk={() => ctrl.current?.fitBounds(APP_CONFIG.ukBounds as Bounds, padding(!!selection))}
            onTheme={toggleTheme}
            onAbout={() => setAboutOpen(true)}
          />
        </div>

        {!(isMobile && selection) && (
          <div className="absolute bottom-16 left-3 md:bottom-8">
            <Legend key={String(isMobile)} level={level} basemap={view?.basemap ?? 'hosted'} defaultOpen={!isMobile} />
          </div>
        )}

        {view?.notice && !(isMobile && selection) && (
          <div className="absolute inset-x-0 bottom-20 flex justify-center px-16 md:bottom-8">
            <div role="status" className="animate-in pointer-events-auto max-w-[460px] rounded-lg border border-line bg-surface px-3.5 py-2 text-center text-[12.5px] leading-snug text-muted shadow-float">
              {view.notice === 'outside-detail'
                ? <>Sector and individual postcode detail currently covers <strong className="font-semibold text-ink">{data?.manifest.coverage.detailAreas.join(', ')}</strong>. Here the map shows districts — search still works for any UK postcode.</>
                : <>Zoom in further to load individual postcodes.</>}
            </div>
          </div>
        )}

        {panel && (isMobile
          ? <BottomSheet label="Postcode details" onClose={() => select(null)} resetKey={`${selection!.kind}:${selection!.code}`}>{panel}</BottomSheet>
          : <SidePanel label="Postcode details">{panel}</SidePanel>)}

        {toast && (
          <div className="absolute inset-x-0 top-[124px] flex justify-center px-4 md:top-4">
            <div role="status" className={`animate-in pointer-events-auto flex max-w-[480px] items-start gap-2 rounded-lg px-3.5 py-2 text-[13px] shadow-float ${toast.tone === 'ok' ? 'bg-ink text-surface' : 'border border-line bg-danger-soft text-danger'}`}>
              {toast.tone === 'ok' ? <CheckIcon width={16} height={16} className="mt-px shrink-0" /> : <AlertIcon width={16} height={16} className="mt-px shrink-0" />}
              <span className="break-all">{toast.text}</span>
            </div>
          </div>
        )}
      </div>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} manifest={data?.manifest ?? null} />
    </main>
  );
}
