import assert from "node:assert/strict";
import test from "node:test";
import { parseCameraSheet, nearbyPublicCameras, distanceKm } from "../src/lib/camera-catalog.ts";
const wrap = rows => `google.visualization.Query.setResponse(${JSON.stringify({ table: { rows: rows.map(values => ({ c: values.map(v => ({ v })) })) } })});`;
test("camera parser reads only validated camera rows", () => {
  const rows = [
    [10.7769, 106.7009, "Camera Q1", "abc-123"],
    [10.7769, 106.7009, "Duplicate", "abc-123"],
    [91, 106.7, "Out of range", "fail"],
    [10.77, 106.7, "Bad ID", "?id=<bad>"]
  ];
  const result = parseCameraSheet(wrap(rows));
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Camera Q1");
  assert.match(result[0].snapshot_url, /^https:\/\/giaothong\.hochiminhcity\.gov\.vn\//);
});
test("camera parser does not execute JS", () => {
  assert.throws(() => parseCameraSheet("alert(1);"));
  assert.throws(() => parseCameraSheet("google.visualization.Query.setResponse({not-valid-json})"));
});
test("camera results filter and sort by distance", () => {
  const items = parseCameraSheet(wrap([
    [10.81, 106.71, "Far", "far"],
    [10.777, 106.701, "Close", "close"]
  ]));
  const nearby = nearbyPublicCameras(items, 10.777, 106.701, 10);
  assert.deepEqual(nearby.map(c => c.id), ["public-close", "public-far"]);
  assert.equal(nearbyPublicCameras(items, 10.777, 106.701, .1).length, 1);
  assert.equal(distanceKm(10, 106, 10, 106), 0);
});
