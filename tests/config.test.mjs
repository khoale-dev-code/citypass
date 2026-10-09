import test from "node:test";
import assert from "node:assert/strict";
import { floodSeverity, haversineMeters, routeNearPoint, pointIsValid, getNumber } from "../src/lib/config.ts";

test("ngưỡng độ sâu 9, 10, 20, 35, 36 cm", () => {
  assert.deepEqual([9, 10, 20, 35, 36].map(floodSeverity), [0, 1, 2, 2, 3]);
});
test("không chấp nhận mực nước âm và NaN", () => {
  assert.throws(() => floodSeverity(-1));
  assert.throws(() => floodSeverity(NaN));
});
test("kiểm tra tọa độ, input query", () => {
  assert.equal(pointIsValid(10.8, 106.7), true);
  assert.equal(pointIsValid(97, 106), false);
  assert.equal(getNumber("Infinity", 0, 30), null);
  assert.equal(getNumber("12", 0, 30), 12);
});
test("nhận diện sự cố cách tuyến <130 m", () => {
  const route = [[10.78,106.69],[10.78,106.71]];
  assert.equal(routeNearPoint(route, [10.7803,106.7]), true);
  assert.equal(routeNearPoint(route, [10.784,106.7]), false);
  assert.ok(haversineMeters([10.78,106.69],[10.78,106.71]) > 2000);
});
