'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PostcodeData } from '@/lib/data';
import type { DetailMode } from '@/lib/levels';
import type { MapController, Padding } from '@/lib/mapController';
import { areaOf } from '@/lib/postcode';
import { CheckIcon, CloseIcon } from './Icons';

type QuizKind = 'districts' | 'areas';
interface Question { answer: string; options: string[] }

interface Props {
  data: PostcodeData;
  controller: MapController;
  padding: () => Padding;
  /** Detail mode to return to when the quiz closes. */
  restoreMode: DetailMode;
  onExit: () => void;
}

const BEST_KEY = 'pc-quiz-best';

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Picks a target and three nearby wrong answers (close neighbours make it a real test). */
function makeQuestion(data: PostcodeData, kind: QuizKind, previous?: string): Question {
  const pool =
    kind === 'areas'
      ? [...data.areas.values()].filter((a) => a.km2 && a.n > 500).map((a) => ({ c: a.c, l: a.l }))
      : [...data.districts.values()]
          // Districts numbered 90+ (e.g. SY99, WV99) are mostly non-geographic: PO boxes and large users.
          .filter((d) => data.isDetailArea(areaOf(d.c)) && d.km2 && d.n >= 50 && Number(d.c.replace(/^[A-Z]+/, '').replace(/\D.*$/, '')) < 90)
          .map((d) => ({ c: d.c, l: d.l }));
  let target = pool[Math.floor(Math.random() * pool.length)];
  if (target.c === previous && pool.length > 1) target = pool.find((p) => p.c !== previous)!;
  const near = pool
    .filter((p) => p.c !== target.c)
    .map((p) => ({ c: p.c, d: (p.l[0] - target.l[0]) ** 2 + (p.l[1] - target.l[1]) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  const wrong = shuffle(near).slice(0, 3).map((p) => p.c);
  return { answer: target.c, options: shuffle([target.c, ...wrong]) };
}

export function Quiz({ data, controller, padding, restoreMode, onExit }: Props) {
  const [kind, setKind] = useState<QuizKind | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 });
  const [best, setBest] = useState(0);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(BEST_KEY)) || 0); } catch { /* storage unavailable */ }
    controller.setSelection(null);
    return () => {
      controller.setLabelsHidden(false);
      controller.setMode(restoreMode);
      controller.setSelection(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  const show = useCallback((k: QuizKind, prev?: string) => {
    const next = makeQuestion(data, k, prev);
    setQ(next);
    setPicked(null);
    controller.setMode(k);
    controller.setLabelsHidden(true);
    const sel = { kind: k === 'areas' ? ('area' as const) : ('district' as const), code: next.answer };
    controller.setSelection(sel);
    const b = k === 'areas' ? data.areas.get(next.answer)!.b : data.districts.get(next.answer)!.b;
    // Leave room around the target so neighbouring shapes give context.
    const pad = padding();
    controller.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { ...pad, top: pad.top + 40, bottom: pad.bottom + 40 }, maxZoom: k === 'areas' ? 8 : 11.2, duration: 900 });
  }, [controller, data, padding]);

  const start = (k: QuizKind) => {
    setKind(k);
    setScore({ right: 0, total: 0, streak: 0 });
    show(k);
  };

  const answer = (code: string) => {
    if (!q || picked) return;
    setPicked(code);
    const correct = code === q.answer;
    setScore((s) => {
      const next = { right: s.right + (correct ? 1 : 0), total: s.total + 1, streak: correct ? s.streak + 1 : 0 };
      if (next.streak > best) {
        setBest(next.streak);
        try { localStorage.setItem(BEST_KEY, String(next.streak)); } catch { /* storage unavailable */ }
      }
      return next;
    });
    controller.setLabelsHidden(false);
  };

  // Keyboard: 1–4 answers, Enter or N for the next question.
  useEffect(() => {
    if (!kind || !q) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      const n = Number(e.key);
      if (!picked && n >= 1 && n <= q.options.length) { e.preventDefault(); answer(q.options[n - 1]); }
      else if (picked && (e.key === 'Enter' || e.key.toLowerCase() === 'n')) { e.preventDefault(); show(kind, q.answer); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const label = (code: string) => (kind === 'areas' ? `${code}${data.areas.get(code)?.name ? ` · ${data.areas.get(code)!.name}` : ''}` : code);
  const fact = (code: string) => {
    const info = kind === 'areas' ? data.areas.get(code) : data.districts.get(code);
    if (!info) return '';
    return `${info.n.toLocaleString()} postcodes · about ${Math.round(info.km2 ?? 0).toLocaleString()} km²`;
  };

  return (
    <section aria-label="Postcode quiz" className="animate-in pointer-events-auto w-full rounded-2xl border border-line bg-surface p-4 shadow-float md:w-[420px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Postcode quiz</h2>
        <div className="flex items-center gap-3">
          {kind && (
            <span className="tabular text-[12.5px] text-muted" aria-live="polite">
              {score.right}/{score.total} · streak {score.streak} · best {best}
            </span>
          )}
          <button onClick={onExit} aria-label="Exit quiz" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-surface-hover hover:text-ink">
            <CloseIcon />
          </button>
        </div>
      </div>

      {!kind && (
        <div className="space-y-2">
          <p className="text-[13px] text-muted">A shape is highlighted on the map with the labels hidden. Can you name it?</p>
          <button onClick={() => start('districts')} className="flex w-full flex-col rounded-xl border border-line px-3.5 py-2.5 text-left hover:border-accent hover:bg-accent-soft">
            <span className="text-[14px] font-semibold text-ink">Shropshire districts</span>
            <span className="text-[12px] text-muted">Name the district: SY, TF, WV and DY</span>
          </button>
          <button onClick={() => start('areas')} className="flex w-full flex-col rounded-xl border border-line px-3.5 py-2.5 text-left hover:border-accent hover:bg-accent-soft">
            <span className="text-[14px] font-semibold text-ink">UK postcode areas</span>
            <span className="text-[12px] text-muted">Name the area anywhere in Great Britain</span>
          </button>
        </div>
      )}

      {kind && q && (
        <>
          <p className="mb-2.5 text-[13.5px] text-ink">
            Which postcode {kind === 'areas' ? 'area' : 'district'} is highlighted?
            <span className="hidden text-faint md:inline"> Press 1–4.</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((o) => {
              const isAnswer = o === q.answer;
              const state = !picked ? 'idle' : isAnswer ? 'right' : o === picked ? 'wrong' : 'dim';
              return (
                <button
                  key={o}
                  onClick={() => answer(o)}
                  disabled={!!picked}
                  className={`pc-code flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-[14px] font-semibold transition-colors ${
                    state === 'idle' ? 'border-line text-ink hover:border-accent hover:bg-accent-soft'
                    : state === 'right' ? 'border-accent bg-accent text-white dark:text-[#0c1220]'
                    : state === 'wrong' ? 'border-danger bg-danger-soft text-danger'
                    : 'border-line text-faint'
                  }`}
                >
                  {state === 'right' && <CheckIcon width={16} height={16} />}
                  {label(o)}
                </button>
              );
            })}
          </div>
          {picked && (
            <div className="animate-in mt-3 flex items-center justify-between gap-3">
              <p className="text-[12.5px] leading-snug text-muted" role="status">
                <strong className={picked === q.answer ? 'text-accent-text' : 'text-danger'}>{picked === q.answer ? 'Correct!' : `It’s ${q.answer}.`}</strong> {fact(q.answer)}
              </p>
              <button onClick={() => show(kind, q.answer)} className="h-10 shrink-0 rounded-lg bg-accent px-4 text-[13px] font-semibold text-white dark:text-[#0c1220]" autoFocus>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
