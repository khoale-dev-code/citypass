import test from 'node:test';
import assert from 'node:assert/strict';
import { selectVisible } from '../src/lib/viewport.ts';
const bounds = { south: 10.5, north: 11.0, west: 106.5, east: 107.0 };
const point = item => [item.lat, item.lng];
test('keeps only in-view markers and leaves input untouched', () => {
  const source = [{ lat: 10.78, lng: 106.68 }, { lat: 11.2, lng: 106.68 }, { lat: 10.7, lng: 107.3 }];
  assert.deepEqual(selectVisible(source, point, bounds, 85), [source[0]]);
  assert.equal(source.length, 3);
});
test('caps dense camera markers to mobile budget', () => {
  const source = Array.from({ length: 300 }, (_, i) => ({ lat: 10.75, lng: 106.7, id: i }));
  assert.equal(selectVisible(source, point, bounds, 85).length, 85);
});
test('drops invalid coordinate and empty limit', () => {
  const source = [{ lat: NaN, lng: 106.7 }, { lat: 10.8, lng: 106.7 }];
  assert.equal(selectVisible(source, point, bounds, 85).length, 1);
  assert.deepEqual(selectVisible(source, point, bounds, 0), []);
});
test('supports bounds crossing anti-meridian', () => {
  const box = { south: -10, north: 10, west: 170, east: -170 };
  assert.equal(selectVisible([{ lat: 0, lng: 175 }, { lat: 0, lng: -175 }, { lat: 0, lng: 120 }], point, box, 10).length, 2);
});
