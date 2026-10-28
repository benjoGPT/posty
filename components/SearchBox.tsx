'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { PostcodeData } from '@/lib/data';
import { resolveQuery, suggest, type RegionKind, type Suggestion } from '@/lib/search';
import { AlertIcon, CloseIcon, SearchIcon } from './Icons';

export type NavTarget = { kind: RegionKind | 'unit'; code: string };
export type NavResult = { ok: true } | { ok: false; message: string };

interface Props {
  data: PostcodeData | null;
  onNavigate: (target: NavTarget) => Promise<NavResult>;
  /** Recently opened searches, newest first, shown while the box is empty. */
  recent: NavTarget[];
}

export interface SearchBoxHandle {
  focus: () => void;
}

const KIND_LABEL: Record<Suggestion['kind'], string> = { area: 'Area', district: 'District', sector: 'Sector', unit: 'Postcode' };

export const SearchBox = forwardRef<SearchBoxHandle, Props>(function SearchBox({ data, onNavigate, recent }, ref) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  useEffect(() => {
    if (!data || !query.trim()) { setItems([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const s = await suggest(query, data, ctrl.signal).catch(() => []);
      if (!ctrl.signal.aborted) { setItems(s); setActive(-1); }
    }, 120);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, data]);

  async function go(target: NavTarget) {
    setBusy(true);
    setMessage(null);
    const r = await onNavigate(target);
    setBusy(false);
    setOpen(false);
    if (r.ok) {
      setQuery(target.code);
      inputRef.current?.blur();
    } else setMessage(r.message);
  }

  async function submit() {
    if (!data) return;
    if (active >= 0 && shown[active]) return go(shown[active]);
    setBusy(true);
    const r = await resolveQuery(query, data);
    setBusy(false);
    if (r.ok) return go(r.target);
    setOpen(false);
    setMessage(r.message);
  }

  const recentItems: Suggestion[] = recent.map((t) => ({ kind: t.kind, code: t.code, title: t.code, subtitle: 'Recent search' }));
  const shown = query.trim() ? items : recentItems;
  const showList = open && shown.length > 0;

  return (
    <div className="pointer-events-auto relative w-full md:w-[380px]">
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 shadow-float"
      >
        <SearchIcon className={busy ? 'animate-pulse text-accent' : 'text-faint'} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setMessage(null); }}
          onFocus={() => { setOpen(true); setActive(-1); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(shown.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
            else if (e.key === 'Escape') { if (open && items.length) setOpen(false); else inputRef.current?.blur(); }
          }}
          placeholder="Search a postcode or area"
          aria-label="Search postcodes"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint md:text-[15px]"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setItems([]); setMessage(null); inputRef.current?.focus(); }}
            className="grid size-7 place-items-center rounded-md text-faint hover:bg-surface-hover hover:text-ink"
            aria-label="Clear search"
          >
            <CloseIcon width={16} height={16} />
          </button>
        )}
      </form>

      {showList && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="animate-in absolute inset-x-0 top-[52px] z-30 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-float">
          {shown.map((s, i) => (
            <li
              key={`${s.kind}:${s.code}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); void go(s); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3.5 py-2 ${i === active ? 'bg-surface-hover' : ''}`}
            >
              <span className="w-[62px] shrink-0 text-[11px] font-medium tracking-wide text-faint uppercase">{KIND_LABEL[s.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="pc-code block truncate text-[14px] font-semibold text-ink">{s.title}</span>
                <span className="block truncate text-[12px] text-muted">{s.subtitle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {message && !showList && (
        <div role="alert" className="animate-in absolute inset-x-0 top-[52px] z-30 flex gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] leading-snug text-ink shadow-float">
          <AlertIcon className="mt-px shrink-0 text-warn" width={16} height={16} />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
});
