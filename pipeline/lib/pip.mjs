// Point-in-polygon lookup with a simple grid index, fast enough to place
// ~1.8M postcode points in ~400 council polygons in a few seconds.

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * @param {Array<{ geometry: object }>} features (Multi)Polygon features
 * @param {number} cell grid cell size in degrees
 * @returns {(lng: number, lat: number) => number} index of the containing feature, or -1
 */
export function polygonIndex(features, cell = 0.05) {
  const parts = []; // { f, rings, bbox }
  features.forEach((f, idx) => {
    const g = f.geometry;
    if (!g) return;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of polys) {
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of rings[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
      parts.push({ f: idx, rings, b });
    }
  });
  const grid = new Map();
  const key = (gx, gy) => gx * 100000 + gy;
  parts.forEach((p, i) => {
    for (let gx = Math.floor(p.b[0] / cell); gx <= Math.floor(p.b[2] / cell); gx++)
      for (let gy = Math.floor(p.b[1] / cell); gy <= Math.floor(p.b[3] / cell); gy++) {
        const k = key(gx, gy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });
  return (lng, lat) => {
    const list = grid.get(key(Math.floor(lng / cell), Math.floor(lat / cell)));
    if (!list) return -1;
    for (const i of list) {
      const p = parts[i];
      if (lng < p.b[0] || lng > p.b[2] || lat < p.b[1] || lat > p.b[3]) continue;
      if (inRing(lng, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lng, lat, h))) return p.f;
    }
    return -1;
  };
}
