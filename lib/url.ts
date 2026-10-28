// Shareable URLs. The map position lives in the hash (#map=zoom/lat/lng,
// maintained by MapLibre) and the selection and detail mode in the query
// string, e.g. /?pc=SY1+1AD&detail=units#map=16/52.7055/-2.7506

import type { DetailMode } from './levels';
import { LEVELS } from './levels';
import { normaliseUnit } from './postcode';
import type { RegionKind } from './search';

export interface UrlState {
  target?: { kind: RegionKind | 'unit'; code: string };
  detail: DetailMode;
  hasPosition: boolean;
}

export function readUrlState(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const detailParam = p.get('detail');
  const detail: DetailMode = detailParam && (LEVELS as string[]).includes(detailParam) ? (detailParam as DetailMode) : 'auto';
  const hasPosition = /(^#|&)map=/.test(window.location.hash);
  const pc = p.get('pc');
  if (pc) {
    const unit = normaliseUnit(pc);
    if (unit) return { target: { kind: 'unit', code: unit }, detail, hasPosition };
  }
  for (const kind of ['sector', 'district', 'area'] as const) {
    const v = p.get(kind);
    if (v) return { target: { kind, code: v.toUpperCase().replace(/\s+/g, ' ').trim() }, detail, hasPosition };
  }
  return { detail, hasPosition };
}

export function writeUrlState(target: { kind: RegionKind | 'unit'; code: string } | null, detail: DetailMode): void {
  const p = new URLSearchParams();
  if (target) p.set(target.kind === 'unit' ? 'pc' : target.kind, target.code);
  if (detail !== 'auto') p.set('detail', detail);
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}
