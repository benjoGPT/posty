// Map colouring: give every region one of K colours so that regions sharing a
// border get different colours where possible (K = 4, the four-colour theorem
// for planar maps). Postcode maps aren't strictly planar (detached parts), so
// any region that can't avoid a clash takes the colour that clashes along the
// shortest shared border, and the number of clashes is reported.

/**
 * Builds weighted adjacency between codes from Delaunay edges: two codes are
 * neighbours when points of each are joined by a Delaunay edge (their Voronoi
 * cells share a border). The weight counts those edges, a proxy for the length
 * of the shared border.
 * @returns {Map<number, Map<number, number>>}
 */
export function adjacency(tri, siteCode) {
  const { delaunay: { triangles, halfedges }, nReal: n } = tri;
  const adj = new Map();
  const link = (a, b) => {
    let m = adj.get(a);
    if (!m) adj.set(a, (m = new Map()));
    m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (let e = 0; e < halfedges.length; e++) {
    const o = halfedges[e];
    if (o !== -1 && o < e) continue;
    const p = triangles[e];
    const q = triangles[e % 3 === 2 ? e - 2 : e + 1];
    if (p >= n || q >= n) continue;
    const a = siteCode[p], b = siteCode[q];
    if (a === b || a < 0 || b < 0) continue;
    link(a, b);
    link(b, a);
  }
  return adj;
}

/**
 * DSatur graph colouring with at most `k` colours.
 * @param {number} nCodes
 * @param {Map<number, Map<number, number>>} adj
 * @returns {{ colours: Int8Array, clashes: number }}
 */
export function colourGraph(nCodes, adj, k = 4) {
  const colours = new Int8Array(nCodes).fill(-1);
  const saturation = Array.from({ length: nCodes }, () => new Set());
  const degree = (c) => adj.get(c)?.size ?? 0;
  const usage = new Array(k).fill(0);
  let clashes = 0;

  // A simple O(n²) pick is fine: a few thousand codes per level, at most ~11k.
  const remaining = new Set(Array.from({ length: nCodes }, (_, i) => i));
  while (remaining.size) {
    let best = -1;
    for (const c of remaining) {
      if (best === -1 || saturation[c].size > saturation[best].size || (saturation[c].size === saturation[best].size && degree(c) > degree(best))) best = c;
    }
    remaining.delete(best);
    const neighbours = adj.get(best) ?? new Map();
    // Prefer a free colour, choosing the least-used one for an even spread.
    let pick = -1;
    for (let col = 0; col < k; col++) {
      if (saturation[best].has(col)) continue;
      if (pick === -1 || usage[col] < usage[pick]) pick = col;
    }
    if (pick === -1) {
      // No free colour: take the one sharing the least border with neighbours.
      const cost = new Array(k).fill(0);
      for (const [nb, w] of neighbours) if (colours[nb] >= 0) cost[colours[nb]] += w;
      pick = cost.indexOf(Math.min(...cost));
      clashes++;
    }
    colours[best] = pick;
    usage[pick]++;
    for (const nb of neighbours.keys()) saturation[nb].add(pick);
  }
  if (clashes) repair(colours, adj, k);
  const clashBorder = clashWeight(colours, adj);
  const totalBorder = [...adj].reduce((sum, [a, m]) => sum + [...m].reduce((s2, [b, w]) => s2 + (a < b ? w : 0), 0), 0);
  clashes = [...adj].filter(([a, m]) => [...m.keys()].some((b) => colours[a] === colours[b])).length;
  return { colours, clashes, clashShare: totalBorder ? clashBorder / totalBorder : 0 };
}

/**
 * Min-conflicts repair: repeatedly move a clashing region to the colour with
 * the least shared border among its neighbours. Deterministic (seeded) so
 * rebuilds give the same colours. Returns the number of regions still clashing.
 */
function repair(colours, adj, k, passes = 200) {
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cost = (c, col) => {
    let w = 0;
    for (const [nb, x] of adj.get(c) ?? []) if (colours[nb] === col) w += x;
    return w;
  };
  const clashing = () => [...adj.keys()].filter((c) => cost(c, colours[c]) > 0);
  let best = Int8Array.from(colours);
  let bestWeight = clashWeight(colours, adj);
  let list = clashing();
  for (let p = 0; p < passes && list.length; p++) {
    for (const c of list) {
      const costs = Array.from({ length: k }, (_, col) => cost(c, col) + rand() * 0.5);
      // Occasionally accept a random move to escape local minima.
      colours[c] = rand() < 0.05 ? Math.floor(rand() * k) : costs.indexOf(Math.min(...costs));
    }
    const w = clashWeight(colours, adj);
    if (w < bestWeight) { bestWeight = w; best = Int8Array.from(colours); }
    list = clashing();
  }
  colours.set(best);
}

/** Total shared-border weight between same-coloured neighbours. */
function clashWeight(colours, adj) {
  let w = 0;
  for (const [a, m] of adj) for (const [b, x] of m) if (a < b && colours[a] === colours[b]) w += x;
  return w;
}
