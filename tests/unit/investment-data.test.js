'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { js, ROOT, syntheticClimate } = require('./helpers.js');
const Data = js('investment-data.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const PROCESSED = path.join(ROOT, 'peak-power', 'data', 'processed');
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
// serve the real processed files, and an in-memory FEMA response
function fileFetch(femaHandler) {
  return async (u) => {
    u = String(u);
    if (u.startsWith('http')) return femaHandler ? femaHandler(u) : ok({ features: [] });
    const f = path.join(PROCESSED, u.replace('data/processed/', ''));
    if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => ({}) };
    return ok(JSON.parse(fs.readFileSync(f, 'utf8')));
  };
}
const feature = (a) => ok({ features: [{ attributes: a }] });
const LOUDOUN = { COUNTY: 'Loudoun', STATEABBRV: 'VA', POPULATION: 418601, BUILDVALUE: 8e10, EAL_VALB: 1.6e8, RISK_RATNG: 'Relatively Low', HWAV_RISKR: 'Relatively Moderate', NRI_VER: 'December 2025' };

test('load reads the processed files, and tolerates a missing climate grid', async () => {
  const d = Data.create({ fetchImpl: fileFetch() });
  const data = await d.load();
  assert.equal(data.states.features.length, 51);
  assert.equal(data.facilities.length, 4802);
  assert.equal(data.usFacilities.length, 1789);
  assert.ok(data.reference.eia.states.VA.industrialCentsPerKwh > 0);
  assert.ok(Array.isArray(data.sources) && data.sources.length >= 5);
  assert.equal(await d.load(), data, 'loaded once');
  const noGrid = Data.create({ fetchImpl: async (u) => (String(u).includes('climate-grid') ? { ok: false, status: 404, json: async () => ({}) } : fileFetch()(u)) });
  assert.equal((await noGrid.load()).grid, null);
});

test('load fails loudly when a required file is missing', async () => {
  const d = Data.create({ fetchImpl: async (u) => (String(u).includes('us-reference') ? { ok: false, status: 404, json: async () => ({}) } : fileFetch()(u)) });
  await assert.rejects(() => d.load(), /us-reference\.json.*404/);
});

test('FEMA lookup: builds a point query and converts building loss to a rate', async () => {
  let seen;
  const d = Data.create({ fetchImpl: fileFetch((u) => { seen = new URL(u); return feature(LOUDOUN); }) });
  const h = await d.hazardAt(39.04, -77.49);
  assert.equal(seen.searchParams.get('geometry'), '-77.49,39.04', 'x is longitude, y is latitude');
  assert.equal(seen.searchParams.get('geometryType'), 'esriGeometryPoint');
  assert.equal(seen.searchParams.get('inSR'), '4326');
  assert.equal(seen.searchParams.get('returnGeometry'), 'false');
  near(h.ealRate, 0.002, 1e-12, '1.6e8 / 8e10');
  assert.equal(h.county, 'Loudoun');
  assert.equal(h.compositeRating, 'Relatively Low');
  assert.equal(h.hazards['Heat wave'], 'Relatively Moderate');
  assert.equal(h.nriVersion, 'December 2025');
});

test('FEMA lookup: no county is null, a failure is an error object, neither becomes a number', async () => {
  const none = Data.create({ fetchImpl: fileFetch(() => ok({ features: [] })) });
  assert.equal(await none.hazardAt(35, -60), null);
  const noValue = Data.create({ fetchImpl: fileFetch(() => feature({ ...LOUDOUN, BUILDVALUE: 0 })) });
  assert.equal(await noValue.hazardAt(39, -77), null, 'no building value, no rate');
  const down = Data.create({ fetchImpl: fileFetch(() => { throw new Error('offline'); }) });
  const r = await down.hazardAt(39.04, -77.49);
  assert.match(r.error, /not reachable.*offline/);
  const http = Data.create({ fetchImpl: fileFetch(() => ({ ok: false, status: 500, json: async () => ({}) })) });
  assert.match((await http.hazardAt(39, -77)).error, /HTTP 500/);
  const svcErr = Data.create({ fetchImpl: fileFetch(() => ok({ error: { message: 'Invalid token' } })) });
  assert.match((await svcErr.hazardAt(39, -77)).error, /Invalid token/);
});

test('FEMA lookups are cached, failures are not', async () => {
  let n = 0, fail = true;
  const d = Data.create({ fetchImpl: fileFetch(() => { n++; if (fail) throw new Error('offline'); return feature(LOUDOUN); }) });
  assert.ok((await d.hazardAt(39.04, -77.49)).error);
  fail = false;
  assert.equal((await d.hazardAt(39.04, -77.49)).county, 'Loudoun', 'a later click can succeed');
  await d.hazardAt(39.04, -77.49);
  assert.equal(n, 2, 'one failure, one success, then served from cache');
});

test('a location from a point gets its state, price, reliability and nearby facility count', async () => {
  const d = Data.create({ fetchImpl: fileFetch(() => feature(LOUDOUN)) });
  await d.load();
  const hz = await d.hazardAt(39.04, -77.49);
  const loc = d.locationFromPoint(39.04, -77.49, { climate: syntheticClimate({ mean: 13 }), hazard: hz, label: 'Ashburn' });
  assert.equal(loc.state, 'VA');
  assert.equal(loc.label, 'Ashburn');
  assert.equal(loc.priceCentsPerKwh, d.data.reference.eia.states.VA.industrialCentsPerKwh);
  assert.equal(loc.saidiMinutes, d.data.reference.eia.states.VA.saidiMinutes);
  near(loc.ealRate, 0.002, 1e-12);
  assert.ok(loc.nearbyFacilities > 100, 'Northern Virginia is the densest market in the data: ' + loc.nearbyFacilities);
});

test('a failed hazard lookup leaves the hazard Not Assessed (null), not zero', async () => {
  const d = Data.create({ fetchImpl: fileFetch() });
  await d.load();
  const loc = d.locationFromPoint(39.04, -77.49, { hazard: { error: 'offline' } });
  assert.equal(loc.ealRate, null);
  assert.equal(d.locationFromPoint(39.04, -77.49, {}).ealRate, null);
});

test('outside the United States there is no state and no price', async () => {
  const d = Data.create({ fetchImpl: fileFetch() });
  await d.load();
  const loc = d.locationFromPoint(43.65, -79.38, {});      // Toronto
  assert.equal(loc.state, null);
  assert.equal(loc.priceCentsPerKwh, null);
  assert.equal(loc.saidiMinutes, null);
});

test('nearest grid cell is found by distance (or null when there is no grid)', async () => {
  const d = Data.create({ fetchImpl: fileFetch() });
  const data = await d.load();
  const withGrid = data.grid ? d.nearestCell(39.04, -77.49) : null;
  if (data.grid) { assert.ok(withGrid.cell && withGrid.km >= 0); assert.ok(withGrid.km < 400, 'something within 400 km of Ashburn: ' + withGrid.km); }
  const empty = Data.create({ fetchImpl: async (u) => (String(u).includes('climate-grid') ? { ok: false, status: 404, json: async () => ({}) } : fileFetch()(u)) });
  await empty.load();
  assert.equal(empty.nearestCell(39, -77), null);
});
