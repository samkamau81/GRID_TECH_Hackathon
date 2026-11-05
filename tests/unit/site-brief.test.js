// Unit tests for the site brief logic (county lookup, nearby generation, factor facts, delay scenario) and the cooling-climate summary.
// Run: node --test tests/unit/*.test.js     No network, no browser. Uses the real generated data files.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SB = require('../../peak-power/js/site-brief.js');
const W = require('../../peak-power/js/climate-weather.js');

const ROOT = path.join(__dirname, '..', '..', 'peak-power');
const outlines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'processed', 'county-outlines.json'), 'utf8'));
const plantsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'processed', 'eia860-plants.json'), 'utf8'));
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'data', 'site-grades.js'), 'utf8'))(win);
const G = win.PEAKPOWER_SITE_GRADES;
const index = SB.decodeOutlines(outlines);

test('county lookup finds known counties and rejects open ocean', () => {
  const at = (lat, lon) => SB.findCounty(index, lat, lon);
  assert.deepStrictEqual(at(39.04, -77.49), { f: '51107', near: false });   // Ashburn, Loudoun VA
  assert.strictEqual(at(30.27, -97.74).f, '48453');                          // Austin, Travis TX
  assert.strictEqual(at(29.76, -95.37).f, '48201');                          // Houston, Harris TX
  assert.strictEqual(at(41.88, -87.63).f, '17031');                          // Chicago, Cook IL
  assert.strictEqual(at(33.45, -112.07).f, '04013');                         // Phoenix, Maricopa AZ
  assert.strictEqual(at(35, -60), null);                                     // Atlantic Ocean
  assert.strictEqual(at(51.5, -0.12), null);                                 // London
});

test('every outlined county has grades, facts and a state', () => {
  assert.ok(index.length > 3000);
  for (const c of index) {
    assert.match(G.g[c.f], /^[0-4]{9}$/, c.f);
    assert.ok(G.k[c.f] && G.states[c.f.slice(0, 2)], c.f);
  }
});

test('outline bounding boxes are inside the contiguous US', () => {
  for (const c of index) assert.ok(c.box[0] > -125.5 && c.box[2] < -66 && c.box[1] > 24 && c.box[3] < 50, c.f + ' ' + c.box);
});

test('nearby plants sums capacity by group and ranks named plants', () => {
  const plants = plantsDoc.plants;
  const r = SB.nearbyPlants(plants, 30.27, -97.74, 50);
  assert.ok(r.n > 5);
  assert.strictEqual(r.op.length, 8);
  assert.ok(r.top.length > 0 && r.top.length <= 5);
  for (let i = 1; i < r.top.length; i++) assert.ok(r.top[i - 1].mw >= r.top[i].mw);
  for (const t of r.top) assert.ok(t.miles <= 50);
  // a bigger radius can only add capacity
  const big = SB.nearbyPlants(plants, 30.27, -97.74, 100);
  assert.ok(big.n >= r.n);
  r.op.forEach((v, g) => assert.ok(big.op[g] >= v));
  // nothing in the middle of the Pacific
  assert.strictEqual(SB.nearbyPlants(plants, 30, -140, 50).n, 0);
});

test('zero-carbon share ignores batteries and handles empty input', () => {
  assert.strictEqual(SB.zeroCarbonShare([50, 0, 0, 0, 25, 25, 100, 0]), 0.5);
  assert.strictEqual(SB.zeroCarbonShare([0, 0, 0, 0, 0, 0, 40, 0]), null);
});

test('factor facts come from the Prototype export', () => {
  const f = SB.factorFacts(G, '48453');   // Travis TX
  assert.strictEqual(f.county, 'Travis');
  assert.strictEqual(f.state.a, 'TX');
  assert.match(f.facts.en, /ERCOT/);
  assert.match(f.facts.pwr, /ERCOT area: median 3\.8 years/);
  assert.strictEqual(f.grades.pwr, 0);
  const v = SB.factorFacts(G, '51107');   // Loudoun VA: not graded for energy
  assert.match(v.facts.en, /Not graded outside Texas/);
  assert.strictEqual(v.grades.en, 3);
  assert.match(v.facts.pwr, /PJM/);
});

test('delay scenario: grade maps to months and deltas come from the engine results', () => {
  assert.strictEqual(SB.delayScenario(G, 3), null);
  const good = SB.delayScenario(G, 0);
  assert.strictEqual(good.months, 0); assert.strictEqual(good.dOpen, 0); assert.strictEqual(good.dProfit, 0);
  const mod = SB.delayScenario(G, 1), bad = SB.delayScenario(G, 2);
  assert.strictEqual(mod.months, 6); assert.strictEqual(bad.months, 12);
  assert.ok(mod.dOpen > 0 && bad.dOpen >= mod.dOpen);
  assert.ok(mod.dProfit < 0 && bad.dProfit < mod.dProfit, 'a later grid connection costs profit');
});

test('cooling climate: hot-humid, mild and in-between hours are graded as documented', () => {
  const series = (fn) => {
    const time = [], t = [], h = [];
    for (let d = 0; d < 365 * 3; d++) for (let hr = 0; hr < 24; hr++) {
      const date = new Date(Date.UTC(2023, 0, 1 + d, hr));
      time.push(date.toISOString().slice(0, 13) + ':00'); const v = fn(date, hr); t.push(v[0]); h.push(v[1]);
    }
    return [time, t, h];
  };
  const mild = W.summarizeClimate(...series(() => [55, 50]));
  assert.strictEqual(mild.grade, 0); assert.ok(mild.free === 1 && mild.cdd === 0 && mild.hotHours === 0);
  const swamp = W.summarizeClimate(...series(() => [90, 80]));
  assert.strictEqual(swamp.grade, 2); assert.ok(swamp.humidHours > 8000 && swamp.cdd > 8000);
  const desert = W.summarizeClimate(...series(() => [100, 10]));
  assert.strictEqual(desert.grade, 2); assert.ok(desert.hotHours > 8000);
  const mid = W.summarizeClimate(...series((d) => [d.getUTCMonth() >= 3 && d.getUTCMonth() <= 9 ? 82 : 50, 50]));
  assert.strictEqual(mid.grade, 1);
  assert.strictEqual(mid.monthCdd.length, 12);
  assert.ok(mid.monthCdd[6] > 400 && mid.monthCdd[0] === 0);
  assert.ok(Math.abs(mid.bands.cool + mid.bands.mid + mid.bands.hot - 1) < 1e-9);
});

test('cooling climate skips missing hours and returns null when nothing is usable', () => {
  assert.strictEqual(W.summarizeClimate(['2024-01-01T00:00'], [null], [50]), null);
  const s = W.summarizeClimate(['2024-07-01T00:00', '2024-07-01T01:00'], [90, null], [40, 40]);
  assert.strictEqual(s.hours, 1);
});

test('wet-bulb matches Stull at a known point (20 C, 50% -> about 13.7 C)', () => {
  const f = W.wetBulbF(68, 50);
  assert.ok(Math.abs((f - 32) * 5 / 9 - 13.7) < 0.3, String(f));
});

test('climate history: request shape, caching, errors', async () => {
  W.reset();
  const calls = [];
  const hourly = { time: [], temperature_2m: [], relative_humidity_2m: [] };
  for (let i = 0; i < 24 * 365; i++) { hourly.time.push(new Date(Date.UTC(2025, 0, 1, i)).toISOString().slice(0, 13) + ':00'); hourly.temperature_2m.push(60); hourly.relative_humidity_2m.push(50); }
  const ok = (url) => { calls.push(String(url)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hourly }) }); };
  const now = Date.UTC(2026, 10, 5);
  const a = await W.getClimateHistory(39.04, -77.49, ok, now);
  assert.strictEqual(calls.length, 1);
  const u = new URL(calls[0]);
  assert.strictEqual(u.host, 'archive-api.open-meteo.com');
  assert.strictEqual(u.searchParams.get('start_date'), '2023-01-01');
  assert.strictEqual(u.searchParams.get('end_date'), '2025-12-31');
  assert.strictEqual(u.searchParams.get('hourly'), 'temperature_2m,relative_humidity_2m');
  assert.strictEqual(u.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.strictEqual(a.period, '2023–2025'); assert.strictEqual(a.cached, false);
  const b = await W.getClimateHistory(39.04, -77.49, ok, now + 1000);   // same cell: from cache
  assert.strictEqual(calls.length, 1); assert.strictEqual(b.cached, true);
  await W.getClimateHistory(39.2, -77.49, ok, now);                    // a different 0.1 degree cell: a new request
  assert.strictEqual(calls.length, 2);
  await assert.rejects(W.getClimateHistory(999, 0, ok, now), { code: 'invalid' });
  W.reset();
  await assert.rejects(W.getClimateHistory(10, 10, () => Promise.resolve({ ok: false, status: 500 }), now), { code: 'http' });
  await assert.rejects(W.getClimateHistory(11, 11, () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hourly: {} }) }), now), { code: 'format' });
});
