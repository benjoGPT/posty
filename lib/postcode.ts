// UK postcode structure, using SY1 1AD as the example:
//   area     SY       letters of the outward code
//   district SY1      the outward code
//   sector   SY1 1    outward code + first digit of the inward code
//   unit     SY1 1AD  the full postcode

export const OUTWARD_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;
const UNIT_RE = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/;
const SECTOR_RE = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9])$/;

/** Upper-cases and strips everything except letters, digits and single spaces. */
export function cleanQuery(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Returns "OUT IN" for a valid full postcode in any spacing/case, else null. */
export function normaliseUnit(raw: string): string | null {
  const m = UNIT_RE.exec(cleanQuery(raw).replace(/ /g, ''));
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Interprets input as a sector ("SY1 1", "sy11"). Without a space the input is
 * ambiguous ("SY11" could also be district SY11), so callers should offer both.
 */
export function asSector(raw: string): string | null {
  const q = cleanQuery(raw);
  const spaced = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ([0-9])$/.exec(q);
  if (spaced) return `${spaced[1]} ${spaced[2]}`;
  const m = SECTOR_RE.exec(q.replace(/ /g, ''));
  return m ? `${m[1]} ${m[2]}` : null;
}

export function areaOf(code: string): string {
  return /^[A-Z]+/.exec(code)?.[0] ?? '';
}
export function districtOf(code: string): string {
  return code.split(' ')[0];
}
export function sectorOf(unit: string): string {
  const [out, inward] = unit.split(' ');
  return `${out} ${inward[0]}`;
}

/** Natural sort for postcode codes: SY2 before SY10. */
export function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}
