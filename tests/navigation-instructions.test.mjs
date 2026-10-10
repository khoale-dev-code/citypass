import test from 'node:test';
import assert from 'node:assert/strict';
import { instructionForProgress, instructionText, isValidNavigationRequest } from '../src/lib/navigation-progress.ts';
const turns = [
  { offsetMeters: 0, maneuver: 'DEPART' },
  { offsetMeters: 430, maneuver: 'TURN_RIGHT', street: 'Hai Bà Trưng' },
  { offsetMeters: 920, maneuver: 'TURN_LEFT', street: 'Nơ Trang Long' },
  { offsetMeters: 1200, maneuver: 'ARRIVE' }
];
test('next turn stays attached to the selected provider route distance', () => {
  const current = instructionForProgress(turns, 25, 1200);
  assert.equal(current?.instruction.maneuver, 'TURN_RIGHT');
  assert.equal(current?.distanceMeters, 130);
});
test('after the first turn switches to next real maneuver', () => {
  assert.equal(instructionForProgress(turns, 45, 1200)?.instruction.maneuver, 'TURN_LEFT');
});
test('malformed steps and fallback have no invented turn', () => {
  assert.equal(instructionForProgress([], 50, 1200), null);
  assert.equal(instructionForProgress([{ offsetMeters: NaN, maneuver: 'TURN_LEFT' }], 50, 1200), null);
});
test('provider maneuver uses short Vietnamese instructions', () => {
  assert.equal(instructionText(turns[1]), 'Rẽ phải vào Hai Bà Trưng');
  assert.equal(instructionText({offsetMeters:0,maneuver:'UNKNOWN'}),'Đi theo tuyến phía trước');
});
test('navigation request validates optional instructions', () => {
  const req = {routeId:'r0',geometry:[[10.7,106.7],[10.71,106.71]],from:[10.7,106.7],to:[10.71,106.71],vehicle:'motorcycle',durationSeconds:300,distanceMeters:1200,trafficAware:false,floodDataAvailable:false,instructions:turns};
  assert.equal(isValidNavigationRequest(req), true);
  assert.equal(isValidNavigationRequest({...req,instructions:[{offsetMeters:-1,maneuver:'TURN_RIGHT'}]}), false);
  assert.equal(isValidNavigationRequest({...req,instructions:[{offsetMeters:11,maneuver:123}]}), false);
});
