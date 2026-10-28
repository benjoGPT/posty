// Client for postcodes.io (https://postcodes.io), a free, open-source UK
// postcode API built on ONS data. It is used for single-postcode lookups,
// autocomplete and administrative details, never as a viewport dataset.

import { APP_CONFIG } from '@/config/app';

export interface LivePostcode {
  postcode: string;
  longitude: number | null;
  latitude: number | null;
  country: string | null;
  region: string | null;
  admin_district: string | null;
  admin_county: string | null;
  admin_ward: string | null;
  parish: string | null;
  parliamentary_constituency: string | null;
  date_of_introduction: string | null;
}

export interface TerminatedPostcode {
  postcode: string;
  year_terminated: number;
  month_terminated: number;
  longitude: number | null;
  latitude: number | null;
}

export interface OutcodeInfo {
  outcode: string;
  admin_district: string[];
  admin_county: string[];
  country: string[];
}

export type LookupResult =
  | { status: 'live'; data: LivePostcode }
  | { status: 'terminated'; data: TerminatedPostcode }
  | { status: 'not_found' }
  | { status: 'unavailable'; message: string };

const TIMEOUT_MS = 6000;
const cache = new Map<string, Promise<unknown>>();

class ServiceError extends Error {}

async function get<T>(path: string): Promise<{ status: number; body: T | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${APP_CONFIG.lookupApiUrl}${path}`, { signal: ctrl.signal });
    if (r.status === 404) return { status: 404, body: null };
    if (!r.ok) throw new ServiceError(`postcodes.io returned HTTP ${r.status}`);
    const json = (await r.json()) as { result: T };
    return { status: r.status, body: json.result };
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    throw new ServiceError(ctrl.signal.aborted ? 'postcodes.io did not respond in time' : "Couldn't reach postcodes.io");
  } finally {
    clearTimeout(timer);
  }
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Full lookup: live postcode, else terminated postcode, else not found. */
export function lookupPostcode(postcode: string): Promise<LookupResult> {
  const enc = encodeURIComponent(postcode);
  return cached(`pc:${postcode}`, async (): Promise<LookupResult> => {
    try {
      const live = await get<LivePostcode>(`/postcodes/${enc}`);
      if (live.body) return { status: 'live', data: live.body };
      const term = await get<TerminatedPostcode>(`/terminated_postcodes/${enc}`);
      if (term.body) return { status: 'terminated', data: term.body };
      return { status: 'not_found' };
    } catch (e) {
      return { status: 'unavailable', message: (e as Error).message };
    }
  });
}

/** Postcode autocomplete (full postcodes only). Resolves [] when the service is unavailable. */
export async function autocomplete(partial: string, signal?: AbortSignal): Promise<string[]> {
  const q = partial.replace(/\s+/g, '');
  if (q.length < 2) return [];
  try {
    const r = await cached(`ac:${q}`, () => get<string[] | null>(`/postcodes/${encodeURIComponent(q)}/autocomplete?limit=8`));
    if (signal?.aborted) return [];
    return r.body ?? [];
  } catch {
    return [];
  }
}

/** Administrative areas that a postcode district (outcode) overlaps. */
export async function lookupOutcode(outcode: string): Promise<OutcodeInfo | null | 'unavailable'> {
  try {
    const r = await cached(`oc:${outcode}`, () => get<OutcodeInfo>(`/outcodes/${encodeURIComponent(outcode)}`));
    return r.body;
  } catch {
    return 'unavailable';
  }
}
