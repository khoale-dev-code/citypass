import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleMapsDirectionsUrl, sampleRouteWaypoints } from "../src/lib/google-maps.ts";
const from = [10.7490, 106.6733];
const to = [10.7585, 106.6615];
const geometry = [from, [10.7505, 106.6721], [10.7528, 106.6692], [10.7554, 106.6660], [10.7569, 106.6640], to];

test("directions link opens on Google Maps with precise origin and destination", () => {
  const result = buildGoogleMapsDirectionsUrl({ from, to, geometry, mode: "driving" });
  assert.ok(result);
  const url = new URL(result);
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("origin"), "10.74900,106.67330");
  assert.equal(url.searchParams.get("destination"), "10.75850,106.66150");
  assert.equal(url.searchParams.get("dir_action"), "navigate");
  assert.equal(url.searchParams.get("travelmode"), "driving");
  assert.equal(url.searchParams.get("waypoints")?.split("|").length, 3);
});

test("two-wheeler mode; user can disable CityPass waypoints", () => {
  const result = buildGoogleMapsDirectionsUrl({ from, to, geometry, mode: "two-wheeler", includeWaypoints: false });
  const url = new URL(result);
  assert.equal(url.searchParams.get("travelmode"), "two-wheeler");
  assert.equal(url.searchParams.has("waypoints"), false);
});

test("rejects invalid coordinates, same start/end and unsupported mode", () => {
  assert.equal(buildGoogleMapsDirectionsUrl({ from: [91, 0], to, geometry }), null);
  assert.equal(buildGoogleMapsDirectionsUrl({ from, to: from, geometry }), null);
  assert.equal(buildGoogleMapsDirectionsUrl({ from, to, geometry, mode: "fly" }), null);
});

test("distance sampling keeps order, limits to three and handles too-short or wrong route", () => {
  const result = sampleRouteWaypoints(geometry);
  assert.equal(result.length, 3);
  assert.ok(result[0][0] < result[1][0] && result[1][0] < result[2][0]);
  assert.deepEqual(sampleRouteWaypoints([from, to]), []);
  assert.deepEqual(sampleRouteWaypoints([[91, 0], from, to]), []);
});
