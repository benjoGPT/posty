import test from 'node:test';
import assert from 'node:assert/strict';
import { triangulate, dissolve } from '../lib/voronoi.mjs';
import { normalisePostcode, splitPostcode } from '../lib/postcode.mjs';

function area(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

test('dissolves a grid into two halves with an enclave', () => {
  const xs = [], ys = [], code = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
    // Jitter avoids a perfectly regular (fully co-circular) lattice.
    xs.push(i * 100 + ((i * 7 + j * 13) % 11)); ys.push(j * 100 + ((i * 3 + j * 5) % 7));
    const enclave = i >= 4 && i <= 6 && j >= 8 && j <= 10;
    code.push(enclave ? 2 : i < 10 ? 0 : 1);
  }
  const tri = triangulate(Float64Array.from(xs), Float64Array.from(ys), 500);
  const { polygons, brokenRings } = dissolve(tri, Int32Array.from(code), 3);
  assert.equal(brokenRings, 0);
  assert.equal(polygons[0].length, 1, 'left half is one polygon');
  assert.equal(polygons[0][0].length, 2, 'left half has the enclave as a hole');
  assert.equal(polygons[1].length, 1);
  assert.equal(polygons[1][0].length, 1);
  assert.equal(polygons[2].length, 1);
  const a0 = area(polygons[0][0][0]) + area(polygons[0][0][1]);
  const a2 = area(polygons[2][0][0]);
  assert.ok(Math.abs(-area(polygons[0][0][1]) - a2) < 1e-6, 'hole matches enclave exactly');
  assert.ok(a0 > 0 && a2 > 0);
});

test('handles exactly co-circular lattices', () => {
  const xs = [], ys = [], code = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { xs.push(i * 50); ys.push(j * 50); code.push(j < 5 ? 0 : 1); }
  const tri = triangulate(Float64Array.from(xs), Float64Array.from(ys), 200);
  const { polygons, brokenRings } = dissolve(tri, Int32Array.from(code), 2);
  assert.equal(brokenRings, 0);
  assert.equal(polygons[0].length, 1);
  assert.equal(polygons[1].length, 1);
});

test('normalises and splits postcodes', () => {
  assert.equal(normalisePostcode('sy11ad'), 'SY1 1AD');
  assert.equal(normalisePostcode(' tf3 4nt '), 'TF3 4NT');
  assert.equal(normalisePostcode('EC1A1BB'), 'EC1A 1BB');
  assert.equal(normalisePostcode('W1A 0AX'), 'W1A 0AX');
  assert.equal(normalisePostcode('SY1'), null);
  assert.equal(normalisePostcode('12345'), null);
  assert.deepEqual(splitPostcode('WV16 4AA'), { area: 'WV', district: 'WV16', sector: 'WV16 4', unit: 'WV16 4AA', inward: '4AA' });
});

test('absorbs small detached fragments but keeps each code', async () => {
  const { absorbFragments } = await import('../lib/voronoi.mjs');
  const xs = [], ys = [], code = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    xs.push(i * 100 + ((i * 7 + j * 13) % 11)); ys.push(j * 100 + ((i * 3 + j * 5) % 7));
    // Code 1 = a block on the right plus one stray point deep inside code 0.
    code.push(i >= 8 || (i === 2 && j === 6) ? 1 : 0);
  }
  const tri = triangulate(Float64Array.from(xs), Float64Array.from(ys), 300);
  const { codes, absorbed } = absorbFragments(tri, Int32Array.from(code), 3);
  assert.equal(absorbed, 1);
  assert.equal(codes[2 * 12 + 6], 0, 'stray point drawn as part of code 0');
  assert.equal(codes[11 * 12 + 11], 1, 'main block untouched');
});
