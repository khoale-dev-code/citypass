import test from 'node:test';
import assert from 'node:assert/strict';
import { inHcm, normalizeRoadQuery, classifyModelRain } from '../src/lib/road-insight.ts';
test('only accepts representative locations in Ho Chi Minh City bounding box', () => {
  assert.equal(inHcm(10.787, 106.69), true);
  assert.equal(inHcm(21.02, 105.85), false);
  assert.equal(inHcm(Number.NaN, 106.7), false);
});
test('normalizes Vietnamese street query and rejects HTML/control text', () => {
  assert.equal(normalizeRoadQuery('  Hai   Bà  Trưng '), 'Hai Bà Trưng');
  assert.equal(normalizeRoadQuery('<script>alert(1)</script>'), null);
  assert.equal(normalizeRoadQuery('A'), null);
});
test('never treats missing rain data as no rain', () => {
  assert.equal(classifyModelRain(null), 'unknown');
  assert.equal(classifyModelRain(-1), 'unknown');
  assert.equal(classifyModelRain(0), 'no_signal');
  assert.equal(classifyModelRain(0.1), 'rain');
});
