'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { js, readJson } = require('./helpers.js');
const Geo = js('us-geo.js');
const states = readJson('peak-power/data/processed/us-states.geojson');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

test('great-circle distance', () => {
  near(Geo.haversineKm(0, 0, 0, 1), 111.19, 0.1, 'one degree of longitude at the equator');
  near(Geo.haversineKm(40.7128, -74.006, 34.0522, -118.2437), 3936, 15, 'New York to Los Angeles');
  assert.equal(Geo.haversineKm(39, -77, 39, -77), 0);
  near(Geo.haversineKm(10, 20, 30, 40), Geo.haversineKm(30, 40, 10, 20), 1e-9, 'symmetric');
});

test('state lookup finds the right state for well-known places', () => {
  const cases = [['Ashburn VA', -77.49, 39.04, 'VA'], ['Phoenix AZ', -112.07, 33.45, 'AZ'], ['Dallas TX', -96.8, 32.8, 'TX'], ['The Dalles OR', -121.18, 45.6, 'OR'],
    ['Santa Clara CA', -121.96, 37.35, 'CA'], ['Chicago IL', -87.63, 41.88, 'IL'], ['Atlanta GA', -84.39, 33.75, 'GA'], ['Seattle WA', -122.33, 47.6, 'WA'],
    ['Honolulu HI', -157.86, 21.31, 'HI'], ['Anchorage AK', -149.9, 61.22, 'AK'], ['Salt Lake City UT', -111.89, 40.76, 'UT'], ['Omaha NE', -95.94, 41.26, 'NE']];
  cases.forEach(([name, lon, lat, want]) => assert.equal(Geo.stateAt(lon, lat, states), want, name));
});

test('points outside the United States have no state', () => {
  assert.equal(Geo.stateAt(-60, 35, states), null, 'Atlantic Ocean');
  assert.equal(Geo.stateAt(-79.38, 43.65, states), null, 'Toronto');
  assert.equal(Geo.stateAt(-99.13, 19.43, states), null, 'Mexico City');
  assert.equal(Geo.stateAt(2.35, 48.85, states), null, 'Paris');
});

test('holes are respected (a point inside a hole is not in the polygon)', () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { code: 'XX', name: 'Test' }, geometry: { type: 'MultiPolygon', coordinates: [[
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]] } }] };
  assert.equal(Geo.stateAt(2, 2, fc), 'XX');
  assert.equal(Geo.stateAt(5, 5, fc), null);
  assert.equal(Geo.stateAt(11, 5, fc), null);
});

test('state names and facility counts', () => {
  assert.equal(Geo.stateName('VA', states), 'Virginia');
  assert.equal(Geo.stateName('ZZ', states), 'ZZ');
  const pts = [{ lat: 39.0, lon: -77.5 }, { lat: 39.05, lon: -77.45 }, { lat: 40.0, lon: -77.5 }, { lat: 33.4, lon: -112.0 }];
  assert.equal(Geo.countWithin(pts, 39.04, -77.49, 10), 2);
  assert.equal(Geo.countWithin(pts, 39.04, -77.49, 150), 3);
  assert.equal(Geo.countWithin(pts, 39.04, -77.49, 1), 0);
  assert.equal(Geo.countWithin([], 39, -77, 100), 0);
});
