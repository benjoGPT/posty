// Search: autocomplete suggestions and resolution of a query to something the
// map can show. Local data is searched first (instant, works offline); for
// full postcodes outside local detail coverage, postcodes.io is used.

import type { PostcodeData } from './data';
import { autocomplete, lookupPostcode } from './lookup';
import { areaOf, asSector, cleanQuery, compareCodes, districtOf, normaliseUnit, OUTWARD_RE } from './postcode';

export type RegionKind = 'area' | 'district' | 'sector';

export type Selection =
  | { kind: RegionKind; code: string }
  | {
      kind: 'unit';
      code: string;
      lng: number;
      lat: number;
      status: 'live' | 'terminated';
      /** local = this map's dataset; remote = postcodes.io only */
      origin: 'local' | 'remote';
      quality?: number;
      terminated?: { year: number; month: number };
      notice?: string;
    };

export interface Suggestion {
  kind: RegionKind | 'unit';
  code: string;
  title: string;
  subtitle: string;
}

const MAX = 8;

export async function suggest(query: string, data: PostcodeData, signal?: AbortSignal): Promise<Suggestion[]> {
  const q = cleanQuery(query);
  const compact = q.replace(/ /g, '');
  if (!compact) return [];
  const out: Suggestion[] = [];
  const add = (s: Suggestion) => {
    if (!out.some((o) => o.kind === s.kind && o.code === s.code)) out.push(s);
  };

  // Areas by code ("SY") or by name ("Shrewsbury").
  if (/^[A-Z]{1,2}$/.test(compact)) {
    const exact = data.areas.get(compact);
    if (exact) add(areaSuggestion(exact.c, exact.name, exact.n));
    for (const a of data.areas.values()) if (a.c.startsWith(compact)) add(areaSuggestion(a.c, a.name, a.n));
  }
  if (/^[A-Z][A-Z -]{2,}$/.test(q)) {
    const needle = q.toLowerCase();
    for (const a of data.areas.values()) {
      if (a.name?.toLowerCase().split(/[\s-]+/).some((w) => w.startsWith(needle)) || a.name?.toLowerCase().startsWith(needle)) add(areaSuggestion(a.c, a.name, a.n));
    }
  }

  // Districts by prefix ("SY1" → SY1, SY10, SY11…).
  if (/^[A-Z]{1,2}[0-9][A-Z0-9]?$/.test(compact)) {
    const area = areaOf(compact);
    const matches = data.sortedDistricts(area).filter((d) => d.c.startsWith(compact));
    matches.sort((a, b) => (a.c === compact ? -1 : b.c === compact ? 1 : compareCodes(a.c, b.c)));
    for (const d of matches.slice(0, 5)) add({ kind: 'district', code: d.c, title: d.c, subtitle: `Postcode district · ${d.n.toLocaleString()} postcodes` });
  }

  // Sectors ("SY1 1", or "SY11" which could also be district SY11).
  const sector = asSector(q);
  if (sector && data.districts.has(districtOf(sector))) {
    const sectors = await data.loadSectors(areaOf(sector)).catch(() => null);
    const f = sectors?.features.find((x) => !x.properties.label && x.properties.c === sector);
    if (f) add({ kind: 'sector', code: sector, title: sector, subtitle: `Postcode sector · ${f.properties.n.toLocaleString()} postcodes` });
  }

  // Full and partial postcodes from local detail data.
  const unit = normaliseUnit(q);
  if (unit && (data.areas.has(areaOf(unit)) || unit.startsWith('BT'))) add({ kind: 'unit', code: unit, title: unit, subtitle: 'Postcode' });
  for (let k = 2; k <= 4 && k < compact.length; k++) {
    const outward = compact.slice(0, k);
    const rest = compact.slice(k);
    if (!OUTWARD_RE.test(outward) || !/^[0-9][A-Z]{0,2}$/.test(rest) || !data.districts.has(outward)) continue;
    if (!data.isDetailArea(areaOf(outward))) continue;
    const units = await data.loadUnits(outward).catch(() => []);
    const prefix = `${outward} ${rest}`;
    for (const u of units) {
      if (out.length >= MAX) break;
      if (u.properties.c.startsWith(prefix)) add({ kind: 'unit', code: u.properties.c, title: u.properties.c, subtitle: 'Postcode' });
    }
  }

  // Remote autocomplete fills in postcodes outside local coverage.
  if (out.length < MAX && compact.length >= 3 && /^[A-Z]{1,2}[0-9]/.test(compact)) {
    const area = areaOf(compact);
    if (!data.isDetailArea(area) && compact.length > 4) {
      for (const pc of await autocomplete(compact, signal)) add({ kind: 'unit', code: pc, title: pc, subtitle: 'Postcode · via postcodes.io' });
    }
  }
  return out.slice(0, MAX);
}

function areaSuggestion(code: string, name: string | null, n: number): Suggestion {
  return { kind: 'area', code, title: name ? `${code} · ${name}` : code, subtitle: `Postcode area · ${n.toLocaleString()} postcodes` };
}

export type UnitResolution = { ok: true; selection: Extract<Selection, { kind: 'unit' }> } | { ok: false; message: string };

/** Resolves a full postcode using local data first, then postcodes.io. */
export async function resolveUnit(postcode: string, data: PostcodeData): Promise<UnitResolution> {
  const area = areaOf(postcode);
  const detail = data.isDetailArea(area);
  const release = data.manifest.source.release;
  // Crown dependency and NI postcodes aren't in the local dataset but are real.
  if (!data.areas.has(area) && !['BT', 'GY', 'JE', 'IM'].includes(area)) {
    return { ok: false, message: `${postcode} isn't a UK postcode: there is no "${area}" postcode area.` };
  }

  let localError = false;
  if (detail) {
    try {
      const local = await data.findUnit(postcode);
      if (local) return { ok: true, selection: { kind: 'unit', code: postcode, lng: local.lng, lat: local.lat, status: 'live', origin: 'local', quality: local.quality } };
    } catch {
      localError = true;
    }
  }

  const remote = await lookupPostcode(postcode);
  switch (remote.status) {
    case 'live': {
      const { longitude, latitude } = remote.data;
      if (longitude == null || latitude == null) return { ok: false, message: `${postcode} is a live postcode but has no published coordinates, so it can't be placed on the map.` };
      return {
        ok: true,
        selection: {
          kind: 'unit', code: postcode, lng: longitude, lat: latitude, status: 'live', origin: 'remote',
          notice: detail && !localError ? `Not in this map's dataset (${release}). postcodes.io lists it as live, so it is probably newer than the map data.` : undefined,
        },
      };
    }
    case 'terminated': {
      const { longitude, latitude, year_terminated, month_terminated } = remote.data;
      const when = new Date(year_terminated, month_terminated - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (longitude == null || latitude == null) return { ok: false, message: `${postcode} was terminated in ${when} and has no recorded location.` };
      return {
        ok: true,
        selection: { kind: 'unit', code: postcode, lng: longitude, lat: latitude, status: 'terminated', origin: 'remote', terminated: { year: year_terminated, month: month_terminated } },
      };
    }
    case 'not_found':
      if (!data.areas.has(area) && !area.startsWith('BT')) return { ok: false, message: `${postcode} isn't a UK postcode: there is no "${area}" postcode area.` };
      return { ok: false, message: `${postcode} wasn't found. It isn't a live or terminated postcode — check for typos.` };
    case 'unavailable':
      if (detail && !localError) return { ok: false, message: `${postcode} isn't a live postcode in this map's dataset (${release}). ${remote.message}, so we couldn't check whether it was terminated or is newer.` };
      return {
        ok: false,
        message: `${remote.message}, so this postcode can't be looked up right now. Offline lookup covers ${data.manifest.coverage.detailAreas.join(', ')} postcodes.`,
      };
  }
}

export type QueryResolution =
  | { ok: true; target: { kind: RegionKind; code: string } | { kind: 'unit'; code: string } }
  | { ok: false; message: string };

/** Resolves free text (Enter without picking a suggestion). */
export async function resolveQuery(query: string, data: PostcodeData): Promise<QueryResolution> {
  const q = cleanQuery(query);
  if (!q) return { ok: false, message: 'Type a postcode, district or area.' };
  const unit = normaliseUnit(q);
  if (unit) return { ok: true, target: { kind: 'unit', code: unit } };
  const compact = q.replace(/ /g, '');
  if (data.areas.has(compact)) return { ok: true, target: { kind: 'area', code: compact } };
  if (data.districts.has(compact) && !q.includes(' ')) return { ok: true, target: { kind: 'district', code: compact } };
  const s = await suggest(q, data);
  if (s.length) return { ok: true, target: { kind: s[0].kind, code: s[0].code } };
  const sector = asSector(q);
  if (sector && data.districts.has(districtOf(sector))) {
    return data.isDetailArea(areaOf(sector))
      ? { ok: false, message: `There is no postcode sector ${sector}.` }
      : { ok: false, message: `Sector detail for the ${areaOf(sector)} area isn’t loaded yet. Try district ${districtOf(sector)} or a full postcode.` };
  }
  if (OUTWARD_RE.test(compact)) return { ok: false, message: `There is no postcode district called ${compact}.` };
  if (/^[A-Z]{1,2}$/.test(compact)) return { ok: false, message: `There is no postcode area called ${compact}.` };
  return { ok: false, message: 'Not a recognised UK postcode format. Try e.g. SY1 1AD, SY1 1, SY1 or SY.' };
}
