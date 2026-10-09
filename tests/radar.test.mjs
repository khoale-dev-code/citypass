import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRadarFrames, clampRadarIndex } from '../src/lib/radar.ts';
const valid = { host: 'https://tilecache.rainviewer.com', radar: { past: [
  { time: 200, path: '/v2/radar/200' },
  { time: 100, path: '/v2/radar/100' },
  { time: 200, path: '/v2/radar/200' }
] } };
test('radar timeline sorted, deduplicated, templated', () => {
  const frames = parseRadarFrames(valid);
  assert.deepEqual(frames.map(f => f.time), [100, 200]);
  assert.match(frames[1].tile_url, /\/256\/\{z\}\/\{x\}\/\{y\}\/2\/1_1\.png$/);
});
test('rejects external radar host and malformed frame', () => {
  assert.deepEqual(parseRadarFrames({ ...valid, host: 'https://evil.example' }), []);
  assert.deepEqual(parseRadarFrames({ ...valid, radar: { past: [{time: 123, path: '//evil'}] } }), []);
});
test('radar index clamped safely', () => {
  assert.equal(clampRadarIndex(17, 4), 3);
  assert.equal(clampRadarIndex(-4, 4), 0);
  assert.equal(clampRadarIndex(2, 0), 0);
});
