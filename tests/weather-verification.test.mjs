import test from "node:test";
import assert from "node:assert/strict";
import { parseMeteo, parseOwm, compareWeather } from "../src/lib/weather-verification.ts";
const now = Date.parse("2026-10-09T05:00:00Z");
const meteo = (mm, code) => ({ current: { precipitation: mm, weather_code: code, time: "2026-10-09T12:00" } });
const owm = (code, mm) => ({ dt: Math.floor(now / 1000), weather: [{id:code}], rain: mm === null ? undefined : {"1h":mm} });
test("two independent rain signals are agreement, not street observation", () => {
  const result = compareWeather([parseMeteo(meteo(0.2, 61), now), parseOwm(owm(500,0.2),now)]);
  assert.equal(result.verdict,"two_sources_rain");assert.equal(result.agreement,"agree");
});
test("disagreement is not reported as dry or safe", () => {
  const result = compareWeather([parseMeteo(meteo(0, 1),now),parseOwm(owm(501,null),now)]);
  assert.equal(result.verdict,"disagreement");
});
test("unavailable OpenWeatherMap is one-source uncertainty", () => {
  const result = compareWeather([parseMeteo(meteo(0, 2), now),null]);
  assert.equal(result.agreement,"insufficient");
});
test("stale and future weather data are rejected", () => {
  assert.equal(parseMeteo({current:{precipitation:0.2,weather_code:61,time:"2026-10-09T07:00"}},now),null);
  assert.equal(parseOwm(owm(500,0), now+5*60*60_000),null);
});
test("missing amount in OWM is not automatically a missing reading", () => {
  assert.equal(parseOwm(owm(500,null), now)?.signal,"rain");
});
test("unknown when both fail", () => assert.equal(compareWeather([null,null]).verdict,"unknown"));
