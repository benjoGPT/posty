// UK postcode structure:  SY1 1AD
//   area     SY       (letters of the outward code)
//   district SY1      (outward code)
//   sector   SY1 1    (outward code + first digit of the inward code)
//   unit     SY1 1AD  (full postcode)

const UNIT_RE = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9][A-Z]{2})$/;

/** Normalises a raw postcode to "OUT IN" form, or returns null if it is not a valid unit postcode. */
export function normalisePostcode(raw) {
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 5 || s.length > 7) return null;
  const m = UNIT_RE.exec(`${s.slice(0, -3)} ${s.slice(-3)}`);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Splits a normalised postcode into its hierarchy codes. */
export function splitPostcode(pc) {
  const [outward, inward] = pc.split(' ');
  return {
    area: outward.match(/^[A-Z]+/)[0],
    district: outward,
    sector: `${outward} ${inward[0]}`,
    unit: pc,
    inward,
  };
}

/** Sort comparator that orders postcode codes naturally (SY2 before SY10). */
export function compareCodes(a, b) {
  return a.localeCompare(b, 'en', { numeric: true });
}
