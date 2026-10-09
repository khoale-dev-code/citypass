import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJourneyRoutes, extractPrecipitation, scoreJourneyRoute, selectRouteSamples } from '../src/lib/journey-analysis.ts';
const route = (id, minutes, risk = 0, delay = 0) => ({ id, distance_m: 3000, duration_s: minutes * 60, geometry: [[10.7,106.7],[10.71,106.71]], risk_count: risk ? 1 : 0, risk_score: risk, traffic_delay_s: delay * 60, nearby_incidents: [] });
test('samples by distance and includes start / end', () => {
 const points=selectRouteSamples([[10,100],[10.1,100],[10.101,100]],5);
 assert.equal(points.length,5);
 assert.deepEqual(points[0],[10,100]);
 assert.deepEqual(points[4],[10.101,100]);
 assert.ok(points[2][0] > 10.045 && points[2][0] < 10.055);
});
test('malformed geometry rejected', () => assert.deepEqual(selectRouteSamples([[NaN,106],[10,106]],5), []));
test('handles Open-Meteo multi-location and missing measurements', () => {
 const rows=extractPrecipitation([{current:{precipitation:0.4,time:'2026-10-09T09:00'}},{current:{precipitation:-4}},{oops:true}],3);
 assert.equal(rows[0].mm,0.4);
 assert.equal(rows[1].mm,null);
 assert.equal(rows[2].mm,null);
});
test('longer route can win with fewer weather signals and traffic delays', () => {
 const wet=scoreJourneyRoute(route('wet',12,0,6),Array(5).fill({mm:1,time:null}),false);
 const dry=scoreJourneyRoute(route('dry',17,0,0),Array(5).fill({mm:0,time:null}),false);
 assert.equal(compareJourneyRoutes([wet,dry])[0].id,'dry');
});
test('known flood risk is prioritized over minor time savings', () => {
 const hazardous=scoreJourneyRoute(route('hazardous',8,3),Array(5).fill({mm:0,time:null}),true);
 const other=scoreJourneyRoute(route('other',22),Array(5).fill({mm:0,time:null}),true);
 assert.equal(compareJourneyRoutes([hazardous,other])[0].id,'other');
});
test('unknown rainfall is not treated as an observed dry road', () => {
 const r=scoreJourneyRoute(route('unknown',12),[{mm:null,time:null}],false);
 assert.equal(r.weather_checked,0);
 assert.equal(r.rain_max_mm,null);
 assert.equal(r.rain_hits,0);
});
