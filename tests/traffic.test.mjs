import assert from "node:assert/strict";
import test from "node:test";
import { TRAFFIC_POINTS, classifyFlow, parseFlow } from "../src/lib/traffic.ts";

test("sample locations are distinct and around HCMC", () => {
  assert.equal(TRAFFIC_POINTS.length, 10);
  assert.equal(new Set(TRAFFIC_POINTS.map(p => p.id)).size, 10);
  for (const p of TRAFFIC_POINTS) assert.ok(p.lat > 10.6 && p.lat < 11.0 && p.lng > 106.5 && p.lng < 107);
});
test("classify threshold boundary speeds, closure and invalid API data", () => {
  assert.equal(classifyFlow(75, 100)?.level, "clear");
  assert.equal(classifyFlow(50, 100)?.level, "slow");
  assert.equal(classifyFlow(25, 100)?.level, "jam");
  assert.equal(classifyFlow(24.9, 100)?.level, "heavy");
  assert.equal(classifyFlow(1, 100, true)?.level, "closed");
  assert.equal(classifyFlow(-1, 100), null);
  assert.equal(classifyFlow(50, 0), null);
});
test("parse TomTom flow validates raw payload and labels readings point-only", () => {
  const point = TRAFFIC_POINTS[0];
  const reading = parseFlow(point, { flowSegmentData: { currentSpeed: 23, freeFlowSpeed: 60, roadClosure: false } });
  assert.equal(reading?.level, "jam");
  assert.equal(reading?.currentSpeed, 23);
  assert.equal(parseFlow(point, { flowSegmentData: { currentSpeed: "23", freeFlowSpeed: 60 } }), null);
  assert.equal(parseFlow(point, {}), null);
});
