import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTileResponse, makePrecipitationUrl, precipitationStatus } from '../src/lib/precipitation-provider.ts';

test('official OWM precipitation tile URL', () => {
  const url = makePrecipitationUrl(7,101,60,'example');
  assert.equal(url.origin, 'https://tile.openweathermap.org');
  assert.equal(url.pathname, '/map/precipitation_new/7/101/60.png');
});
test('classify upstream statuses', () => {
  assert.equal(classifyTileResponse(401,'application/json').code,'unauthorized');
  assert.equal(classifyTileResponse(403,'').code,'forbidden');
  assert.equal(classifyTileResponse(429,'').code,'rate_limited');
  assert.equal(classifyTileResponse(502,'').code,'upstream_error');
  assert.equal(classifyTileResponse(200,'image/png').available,true);
  assert.equal(classifyTileResponse(200,'application/json').code,'invalid_image');
});
test('without key the app uses Open-Meteo without making network requests', async () => {
  delete process.env.OPENWEATHER_API_KEY;
  const s=await precipitationStatus();
  assert.equal(s.available,false);
  assert.equal(s.code,'missing_key');
});
