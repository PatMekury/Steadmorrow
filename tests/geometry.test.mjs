import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolygon, areaSquareMeters, polygonCenter } from '../geometry.js';

const square = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.001 },
  { lat: 0.001, lng: 0.001 },
  { lat: 0.001, lng: 0 },
];
const close = (actual, expected, tolerance) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

test('accepts an irregular quadrilateral in either perimeter direction', () => {
  const irregular = [square[0], square[1], { lat: 0.0015, lng: 0.0013 }, square[3]];
  assert.deepEqual(validatePolygon(irregular), { valid: true, message: '' });
  assert.equal(validatePolygon(irregular.toReversed()).valid, true);
});

test('accepts a concave quadrilateral with no crossed edges', () => {
  const concave = [square[0], square[1], { lat: 0.00025, lng: 0.00025 }, square[3]];
  assert.equal(validatePolygon(concave).valid, true);
  assert.equal(validatePolygon(concave.toReversed()).valid, true);
});

test('requires exactly four finite supported coordinates', () => {
  for (const points of [undefined, null, [], square.slice(1), [...square, square[0]]]) {
    assert.equal(validatePolygon(points).valid, false);
  }
  for (const badPoint of [null, {}, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity },
    { lat: 86, lng: 0 }, { lat: -86, lng: 0 }, { lat: 0, lng: 181 }, { lat: '0', lng: 0 }]) {
    assert.equal(validatePolygon([badPoint, ...square.slice(1)]).valid, false);
  }
});

test('rejects duplicate and near-identical corners, including nonadjacent ones', () => {
  assert.match(validatePolygon([square[0], square[1], square[0], square[3]]).message, /farther apart/);
  const near = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.0000001 }, square[2], square[3]];
  assert.match(validatePolygon(near).message, /farther apart/);
});

test('rejects a bow tie even when its signed area is not zero', () => {
  const bowTie = [square[0], { lat: 0.002, lng: 0.001 }, square[1], square[3]];
  assert.match(validatePolygon(bowTie).message, /cross or touch/);
});

test('rejects a corner touching the interior of a nonadjacent edge', () => {
  const touching = [square[0], { lat: 0, lng: 0.002 }, square[2], { lat: 0, lng: 0.001 }];
  assert.match(validatePolygon(touching).message, /cross or touch/);
});

test('rejects collinear and negligible-area shapes', () => {
  const line = [0, 1, 2, 3].map(value => ({ lat: 0, lng: value * 0.001 }));
  assert.equal(validatePolygon(line).valid, false);
  const narrow = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 },
    { lat: 0.00000000001, lng: 0.002 }, { lat: 0.00000000001, lng: 0.001 }];
  assert.equal(validatePolygon(narrow).valid, false);
});

test('measures a known small equatorial square and is invariant to direction', () => {
  const expected = (6371008.8 * Math.PI / 180 * 0.001) ** 2;
  close(areaSquareMeters(square), expected, 0.001);
  close(areaSquareMeters(square.toReversed()), expected, 0.001);
  close(areaSquareMeters(square.map(point => ({ lat: point.lat + 60, lng: point.lng }))), expected * 0.5, 0.2);
});

test('handles a small quadrilateral crossing the antimeridian', () => {
  const dateline = square.map(point => ({ lat: point.lat, lng: point.lng === 0 ? 179.9995 : -179.9995 }));
  assert.equal(validatePolygon(dateline).valid, true);
  close(areaSquareMeters(dateline), areaSquareMeters(square), 0.001);
  const center = polygonCenter(dateline);
  close(center.lat, 0.0005, 1e-10);
  close(Math.abs(center.lng), 180, 1e-10);
  assert.equal(validatePolygon(dateline.toReversed()).valid, true);
});

test('computes the centroid independently of winding and provides a partial-selection center', () => {
  const center = polygonCenter(square);
  close(center.lat, 0.0005, 1e-10);
  close(center.lng, 0.0005, 1e-10);
  close(polygonCenter(square.toReversed()).lat, center.lat, 1e-10);
  close(polygonCenter(square.toReversed()).lng, center.lng, 1e-10);
  assert.deepEqual(polygonCenter([{ lat: 45, lng: 120 }]), { lat: 45, lng: 120 });
  close(polygonCenter([square[0], square[1]]).lng, 0.0005, 1e-10);
  assert.equal(polygonCenter([]), null);
  assert.equal(areaSquareMeters([]), 0);
  assert.equal(areaSquareMeters([{ lat: NaN, lng: 0 }, ...square]), 0);
});

test('does not mutate caller-owned points', () => {
  const immutable = Object.freeze(square.map(point => Object.freeze({ ...point })));
  validatePolygon(immutable);
  areaSquareMeters(immutable);
  polygonCenter(immutable);
  assert.deepEqual(immutable, square);
});
