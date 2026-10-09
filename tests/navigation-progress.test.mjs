import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationProgress, isValidNavigationRequest } from '../src/lib/navigation-progress.ts';
const line = [[10.75, 106.70], [10.76, 106.70], [10.77, 106.70]];
test('progress starts near zero and finishes near 100 percent', () => {
  assert.ok((navigationProgress(line, line[0])?.completedPercent ?? -1) <= 1);
  assert.equal(navigationProgress(line, line[2])?.completedPercent, 100);
});
test('distance remaining decreases as position moves forward', () => {
  const a = navigationProgress(line, [10.751, 106.70]);
  const b = navigationProgress(line, [10.765, 106.70]);
  assert.ok(a && b && a.remainingMeters > b.remainingMeters);
});
test('off-route distance grows on parallel street', () => {
  const p = navigationProgress(line, [10.76, 106.705]);
  assert.ok(p && p.offRouteMeters > 100);
});
test('navigation request checks full geometry, vehicle and numbers', () => {
  const req = { routeId: 'route-1', geometry: line, from: line[0], to: line[2], vehicle: 'motorcycle', durationSeconds: 500, distanceMeters: 2000, trafficAware: true, floodDataAvailable: false };
  assert.equal(isValidNavigationRequest(req), true);
  assert.equal(isValidNavigationRequest({ ...req, vehicle: 'boat' }), false);
  assert.equal(isValidNavigationRequest({ ...req, geometry: [] }), false);
});
