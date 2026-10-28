import test from 'node:test';
import assert from 'node:assert/strict';
import { urbanFlag } from '../sources/onspd.mjs';

test('collapses rural–urban classifications to urban/rural', () => {
  // 2021 England & Wales
  assert.equal(urbanFlag('UN1', null), true);
  assert.equal(urbanFlag('UF1', null), true);
  assert.equal(urbanFlag('RSN1', null), false);
  assert.equal(urbanFlag('RLF1', null), false);
  // 2011 England & Wales
  assert.equal(urbanFlag(null, 'A1'), true);
  assert.equal(urbanFlag(null, 'C2'), true);
  assert.equal(urbanFlag(null, 'E1'), false);
  // Scotland 8-fold: 1–5 settlements of 3,000+, 6–8 rural
  assert.equal(urbanFlag(null, '2'), true);
  assert.equal(urbanFlag(null, '5'), true);
  assert.equal(urbanFlag(null, '7'), false);
  // 2021 takes precedence; unknown codes stay unknown
  assert.equal(urbanFlag('RSF1', 'A1'), false);
  assert.equal(urbanFlag('', 'Z9'), null);
  assert.equal(urbanFlag(null, null), null);
});
