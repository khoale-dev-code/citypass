import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedHouseNumber, parseTomTomAddressResults } from '../src/lib/road-geocode.ts';
const where = { lat: 10.78124, lon: 106.68612 };
function result(type, streetNumber, position = where) {
  return { type, position, address: { streetNumber, streetName: 'Hai Bà Trưng', freeformAddress: `${streetNumber ?? ''} Hai Bà Trưng, Hồ Chí Minh` } };
}
test('understands house numbers commonly used in Viet Nam', () => {
  assert.equal(requestedHouseNumber('123 Hai Bà Trưng'), '123');
  assert.equal(requestedHouseNumber('12/5A Nơ Trang Long'), '12/5A');
  assert.equal(requestedHouseNumber('Số nhà 29A đường Cách Mạng Tháng Tám'), '29A');
  assert.equal(requestedHouseNumber('Hai Bà Trưng'), null);
});
test('returns point address before street, with complete house number label', () => {
  const data = { results: [result('Street', undefined), result('Point Address', '123')] };
  const items = parseTomTomAddressResults(data, '123 Hai Bà Trưng');
  assert.equal(items[0].precision, 'house');
  assert.equal(items[0].name, '123 Hai Bà Trưng');
  assert.match(items[0].precision_label, /Số nhà/);
});
test('does not treat an address range or street point as a verified house entrance', () => {
  const range = parseTomTomAddressResults({ results: [result('Address Range', '123')] }, '123 Hai Bà Trưng');
  assert.equal(range[0].precision, 'estimated');
  const street = parseTomTomAddressResults({ results: [result('Street', undefined)] }, '123 Hai Bà Trưng');
  assert.equal(street[0].precision, 'street');
});
test('filters incorrect numbered point address rather than suggesting 125 for 123', () => {
  const items = parseTomTomAddressResults({ results: [result('Point Address', '125'), result('Point Address', '123')] }, '123 Hai Bà Trưng');
  assert.equal(items.length, 1);
  assert.equal(items[0].house_number, '123');
});
test('supports POI names, without pretending POI is a verified house number', () => {
  const items = parseTomTomAddressResults({ results: [{ type: 'POI', position: where, poi: { name: 'Bệnh viện' }, address: { freeformAddress: 'Hai Bà Trưng, TP.HCM' } }] }, 'bệnh viện');
  assert.equal(items[0].precision, 'place');
  assert.equal(items[0].name, 'Bệnh viện');
});
test('filters malformed or out-of-bound results', () => {
  assert.deepEqual(parseTomTomAddressResults({}, '123 Hai Bà Trưng'), []);
  assert.deepEqual(parseTomTomAddressResults({ results: [result('Point Address', '123', { lat: 21.03, lon: 105.8 })] }, '123 Hai Bà Trưng'), []);
});
