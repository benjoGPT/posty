// Approximate postcode boundaries from postcode reference points.
//
// There is no open, official polygon dataset for UK postcodes. What the open
// data does give us is one reference coordinate per postcode unit. We build a
// Voronoi diagram of those points (each cell = the land closer to that
// postcode's reference point than to any other) and dissolve the cells into
// sectors, districts and areas. The result is an *approximation*: it is
// labelled as such everywhere it is shown.
//
// Instead of materialising 1.8M cell polygons and unioning them, we walk the
// Delaunay triangulation once: a Voronoi edge separates two neighbouring
// points, and it is part of a boundary exactly when the two points belong to
// different codes. Those edges are chained into rings per code.

import Delaunator from 'delaunator';
import proj4 from 'proj4';

// A transverse Mercator centred on Great Britain (same parameters as the
// British National Grid, on the WGS84 ellipsoid). Equal-ish distances in metres
// make the Voronoi cells meaningful; forward and inverse use the same
// definition, so no datum shift is involved.
const TM = '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=WGS84 +units=m +no_defs';
const projector = proj4('EPSG:4326', TM);
export const project = (lng, lat) => projector.forward([lng, lat]);
export const unproject = (x, y) => projector.inverse([x, y]);

/**
 * Collapses records that share a reference coordinate (to the metre) into a
 * single site. Each site takes the sector held by most of its records, and its
 * district and area are derived from that sector so the levels always nest.
 *
 * @param {Float64Array} lngs
 * @param {Float64Array} lats
 * @param {Int32Array} recordSector sector id per record
 * @returns {{ x: Float64Array, y: Float64Array, sector: Int32Array, siteOf: Int32Array, mixed: number }}
 */
export function buildSites(lngs, lats, recordSector) {
  const n = lngs.length;
  const siteOf = new Int32Array(n);
  const key = new Map();
  const xs = [];
  const ys = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = project(lngs[i], lats[i]);
    const rx = Math.round(x);
    const ry = Math.round(y);
    const k = (rx + 1_000_000) * 4_194_304 + (ry + 1_000_000);
    let s = key.get(k);
    if (s === undefined) {
      s = xs.length;
      key.set(k, s);
      xs.push(rx);
      ys.push(ry);
    }
    siteOf[i] = s;
  }

  const nSites = xs.length;
  const sector = new Int32Array(nSites).fill(-1);
  const mixedSites = new Set();
  for (let i = 0; i < n; i++) {
    const s = siteOf[i];
    if (sector[s] === -1) sector[s] = recordSector[i];
    else if (sector[s] !== recordSector[i]) mixedSites.add(s);
  }
  if (mixedSites.size) {
    const tallies = new Map();
    for (let i = 0; i < n; i++) {
      const s = siteOf[i];
      if (!mixedSites.has(s)) continue;
      let t = tallies.get(s);
      if (!t) tallies.set(s, (t = new Map()));
      t.set(recordSector[i], (t.get(recordSector[i]) ?? 0) + 1);
    }
    for (const [s, t] of tallies) {
      let best = -1;
      let bestCount = -1;
      for (const [c, count] of t) {
        if (count > bestCount || (count === bestCount && c < best)) { best = c; bestCount = count; }
      }
      sector[s] = best;
    }
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), sector, siteOf, mixed: mixedSites.size };
}

/**
 * Triangulates the sites plus a ring of "sea" sentinels far outside them, so
 * that every real site has a bounded Voronoi cell.
 */
export function triangulate(x, y, margin = 60_000) {
  const n = x.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i];
    if (x[i] > maxX) maxX = x[i];
    if (y[i] < minY) minY = y[i];
    if (y[i] > maxY) maxY = y[i];
  }
  const sentinels = [];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = Math.hypot(maxX - minX, maxY - minY) / 2 + margin;
  const k = 64;
  for (let i = 0; i < k; i++) {
    const a = (2 * Math.PI * i) / k;
    sentinels.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  const coords = new Float64Array(2 * n + sentinels.length);
  for (let i = 0; i < n; i++) {
    coords[2 * i] = x[i];
    coords[2 * i + 1] = y[i];
  }
  coords.set(sentinels, 2 * n);
  const d = new Delaunator(coords);

  // Circumcentres are the Voronoi vertices.
  const nt = d.triangles.length / 3;
  const ccx = new Float64Array(nt);
  const ccy = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = d.triangles[3 * t], b = d.triangles[3 * t + 1], c = d.triangles[3 * t + 2];
    const ax = coords[2 * a], ay = coords[2 * a + 1];
    const bx = coords[2 * b] - ax, by = coords[2 * b + 1] - ay;
    const cxx = coords[2 * c] - ax, cyy = coords[2 * c + 1] - ay;
    const den = 2 * (bx * cyy - by * cxx);
    const bl = bx * bx + by * by;
    const cl = cxx * cxx + cyy * cyy;
    ccx[t] = ax + (cyy * bl - by * cl) / den;
    ccy[t] = ay + (bx * cl - cxx * bl) / den;
  }

  // Co-circular points (common with metre-rounded coordinates) give
  // neighbouring triangles the same circumcentre. Merge those into one node
  // so rings stay connected through zero-length Voronoi edges.
  const parent = new Int32Array(nt);
  for (let t = 0; t < nt; t++) parent[t] = t;
  const find = (t) => {
    while (parent[t] !== t) { parent[t] = parent[parent[t]]; t = parent[t]; }
    return t;
  };
  const { halfedges } = d;
  for (let e = 0; e < halfedges.length; e++) {
    const o = halfedges[e];
    if (o < e) continue;
    const t1 = (e / 3) | 0, t2 = (o / 3) | 0;
    if (Math.abs(ccx[t1] - ccx[t2]) < 1e-3 && Math.abs(ccy[t1] - ccy[t2]) < 1e-3) {
      const r1 = find(t1), r2 = find(t2);
      if (r1 !== r2) parent[r1] = r2;
    }
  }
  const node = new Int32Array(nt);
  for (let t = 0; t < nt; t++) node[t] = find(t);

  return { coords, delaunay: d, ccx, ccy, node, nReal: n };
}

/**
 * Dissolves Voronoi cells into one (multi)polygon per code.
 *
 * @param {ReturnType<typeof triangulate>} tri
 * @param {Int32Array} siteCode code id per real site (sentinels are treated as -1 = sea)
 * @param {number} nCodes
 * @returns {Array<Array<Array<[number, number]>>|null>} per code: list of polygons, each [outer, ...holes] in projected metres
 */
export function dissolve(tri, siteCode, nCodes) {
  const { coords, delaunay, ccx, ccy, node, nReal } = tri;
  const { triangles, halfedges } = delaunay;
  const codeOf = (p) => (p < nReal ? siteCode[p] : -1);

  // Directed boundary segments, oriented so their code lies on the left.
  let cap = 1 << 20;
  let segCode = new Int32Array(cap), segFrom = new Int32Array(cap), segTo = new Int32Array(cap);
  let ns = 0;
  const push = (c, a, b) => {
    if (ns === cap) {
      cap *= 2;
      const grow = (arr) => { const next = new Int32Array(cap); next.set(arr); return next; };
      segCode = grow(segCode); segFrom = grow(segFrom); segTo = grow(segTo);
    }
    segCode[ns] = c; segFrom[ns] = a; segTo[ns] = b; ns++;
  };

  for (let e = 0; e < halfedges.length; e++) {
    const o = halfedges[e];
    if (o === -1 || o < e) continue; // hull edges join sentinels; each pair is visited once
    const p = triangles[e];
    const q = triangles[e % 3 === 2 ? e - 2 : e + 1];
    const cp = codeOf(p), cq = codeOf(q);
    if (cp === cq) continue;
    const a = node[(e / 3) | 0], b = node[(o / 3) | 0];
    if (a === b) continue;
    const px = coords[2 * p], py = coords[2 * p + 1];
    const cross = (ccx[b] - ccx[a]) * (py - ccy[a]) - (ccy[b] - ccy[a]) * (px - ccx[a]);
    const [from, to] = cross > 0 ? [a, b] : [b, a];
    if (cp >= 0) push(cp, from, to);
    if (cq >= 0) push(cq, to, from);
  }

  // Bucket segments by code (counting sort).
  const start = new Int32Array(nCodes + 1);
  for (let i = 0; i < ns; i++) start[segCode[i] + 1]++;
  for (let c = 0; c < nCodes; c++) start[c + 1] += start[c];
  const order = new Int32Array(ns);
  const fill = start.slice(0, nCodes);
  for (let i = 0; i < ns; i++) order[fill[segCode[i]]++] = i;

  const result = new Array(nCodes).fill(null);
  let broken = 0;
  for (let c = 0; c < nCodes; c++) {
    const lo = start[c], hi = start[c + 1];
    if (lo === hi) continue;
    const outgoing = new Map();
    for (let k = lo; k < hi; k++) {
      const s = order[k];
      const list = outgoing.get(segFrom[s]);
      if (list) list.push(s);
      else outgoing.set(segFrom[s], [s]);
    }
    const used = new Set();
    const rings = [];
    for (let k = lo; k < hi; k++) {
      const s0 = order[k];
      if (used.has(s0)) continue;
      used.add(s0);
      const first = segFrom[s0];
      const ring = [first];
      let cur = segTo[s0];
      let ok = true;
      while (cur !== first) {
        ring.push(cur);
        const next = outgoing.get(cur)?.find((s) => !used.has(s));
        if (next === undefined) { ok = false; break; }
        used.add(next);
        cur = segTo[next];
      }
      if (!ok || ring.length < 3) { broken++; continue; }
      const pts = ring.map((nd) => [ccx[nd], ccy[nd]]);
      pts.push(pts[0]);
      rings.push(pts);
    }
    result[c] = assemblePolygons(rings);
  }
  return { polygons: result, brokenRings: broken };
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return a / 2;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Groups counter-clockwise outer rings with the clockwise holes they contain. */
export function assemblePolygons(rings) {
  const outers = [];
  const holes = [];
  for (const r of rings) {
    const a = signedArea(r);
    if (a > 0) outers.push({ ring: r, area: a, holes: [] });
    else if (a < 0) holes.push({ ring: r, area: -a });
  }
  outers.sort((p, q) => p.area - q.area);
  for (const h of holes) {
    // The smallest outer ring that contains the hole is its parent. Test the
    // midpoint of the hole's first edge to avoid shared vertices.
    const probe = [(h.ring[0][0] + h.ring[1][0]) / 2, (h.ring[0][1] + h.ring[1][1]) / 2];
    const parent = outers.find((o) => o.area > h.area && pointInRing(probe, o.ring));
    if (parent) parent.holes.push(h.ring);
  }
  return outers.map((o) => [o.ring, ...o.holes]);
}

/** Converts projected polygons to a GeoJSON MultiPolygon in WGS84. */
export function toLngLat(polygons) {
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map((poly) =>
      poly.map((ring) => ring.map(([x, y]) => {
        const [lng, lat] = unproject(x, y);
        return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
      })),
    ),
  };
}

/**
 * Boundary clean-up: a code's reference points sometimes include a few
 * outliers far from the rest (PO boxes placed at a sorting office, large
 * users, positional errors). Drawn literally they become tiny detached
 * islands inside other codes. Each code keeps its largest connected group of
 * points; detached groups of up to `maxSites` points are drawn as part of the
 * code that surrounds them. Only the boundaries change: the points keep their
 * real codes everywhere else in the app.
 *
 * @returns {{ codes: Int32Array, absorbed: number }}
 */
export function absorbFragments(tri, siteCode, maxSites = 3) {
  const { delaunay: { triangles, halfedges }, nReal: n } = tri;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const eachEdge = (fn) => {
    for (let e = 0; e < halfedges.length; e++) {
      const o = halfedges[e];
      if (o !== -1 && o < e) continue;
      const p = triangles[e];
      const q = triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (p < n && q < n) fn(p, q);
    }
  };
  eachEdge((p, q) => {
    if (siteCode[p] !== siteCode[q]) return;
    const a = find(p), b = find(q);
    if (a !== b) parent[a] = b;
  });

  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) size[find(i)]++;
  const largest = new Map(); // code -> root of its largest component
  for (let i = 0; i < n; i++) {
    if (parent[i] !== i) continue;
    const best = largest.get(siteCode[i]);
    if (best === undefined || size[i] > size[best]) largest.set(siteCode[i], i);
  }
  const isFragment = (root) => size[root] <= maxSites && largest.get(siteCode[root]) !== root;

  const tallies = new Map(); // fragment root -> Map(code -> shared edges)
  const tally = (p, q) => {
    const r = find(p);
    if (!isFragment(r) || find(q) === r) return;
    let t = tallies.get(r);
    if (!t) tallies.set(r, (t = new Map()));
    t.set(siteCode[q], (t.get(siteCode[q]) ?? 0) + 1);
  };
  eachEdge((p, q) => { tally(p, q); tally(q, p); });

  const replacement = new Map();
  for (const [root, t] of tallies) {
    let best = -1, bestCount = -1;
    for (const [c, k] of t) if (k > bestCount) { best = c; bestCount = k; }
    replacement.set(root, best);
  }
  const codes = Int32Array.from(siteCode);
  let absorbed = 0;
  for (let i = 0; i < n; i++) {
    const r = replacement.get(find(i));
    if (r !== undefined) { codes[i] = r; absorbed++; }
  }
  return { codes, absorbed };
}
