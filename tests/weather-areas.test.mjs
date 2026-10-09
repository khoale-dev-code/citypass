import assert from "node:assert/strict";
import test from "node:test";
import { WEATHER_POINTS, classifyWeather, parseAreaWeather } from "../src/lib/weather-areas.ts";
const base = { current: { precipitation: 0, temperature_2m: 32.1, weather_code: 1, cloud_cover: 14, is_day: 1, time: "2026-10-08T10:30" }, hourly: { precipitation_probability: [25, 50, 35] } };
test("weather points cover different HCMC areas", () => { assert.ok(WEATHER_POINTS.length >= 18); assert.equal(new Set(WEATHER_POINTS.map(p=>p.id)).size, WEATHER_POINTS.length); });
test("weather is clear by day, not falsely sunny at night", () => { assert.equal(classifyWeather(0, 1, 10, true).conditionLabel, "Nắng / ít mây"); assert.equal(classifyWeather(0, 1, 10, false).conditionLabel, "Quang mây"); });
test("rain code and precipitation take priority over cloud", () => { assert.equal(classifyWeather(0.2, 1, 0, true).condition, "rain"); assert.equal(classifyWeather(0, 80, 12, true).condition, "rain"); assert.equal(classifyWeather(0, 3, 90, true).condition, "cloud"); });
test("weather parser validates and never silently invents readings", () => {
 const point = WEATHER_POINTS[0];
 assert.equal(parseAreaWeather(point, base)?.rainChanceNextHours, 50);
 assert.equal(parseAreaWeather(point, {current: {...base.current, precipitation: null}}), null);
 assert.equal(parseAreaWeather(point, {current: {...base.current, temperature_2m: "32"}}), null);
 assert.equal(parseAreaWeather(point, {current: {...base.current, cloud_cover: -1}}), null);
 assert.equal(parseAreaWeather(point, {}), null);
});
