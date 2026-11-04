'use strict';
// The in-browser engine against the symposium packet (v6.0.1, V2) battery rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JS = path.join(__dirname, '..', '..', 'peak-power', 'js');
const w = {};
new Function('window', fs.readFileSync(path.join(JS, 'data', 'reference-data.js'), 'utf8'))(w);
const REF = w.PEAKPOWER_REFERENCE;
const E = require(path.join(JS, 'engine.js'));

const ETA = Math.sqrt(0.85);
const caps = { wind: 100, utility_solar: 50, battery_4h: 30, gas_turbine: 25 };
const I = E.buildInputs(REF.ref, 20, {});
const O = E.dispatch(I, REF.res, caps, 'when_cheaper', 'cost');
const A = E.account(I, REF.res, caps, O);

test('catalogue comes from the V2 packet', () => {
  assert.equal(REF.res.wind.payment_usd_per_mwh, 45);
  assert.equal(REF.res.battery_4h.capex_usd_per_kw, 1220);
  assert.equal(REF.res.battery_4h.max_mw, 53);
  assert.equal(REF.res.battery_4h.land_acres_per_mw, 0.15);
});

test('hourly energy balance and the shared grid cap hold with a battery', () => {
  let worstBalance = 0, worstCap = 0;
  for (let t = 0; t < E.N; t++) {
    const contracts = O.wind[t] + O.solar[t] + O.nuclear[t];
    const gas = O.fuel_cell[t] + O.gas_engine[t] + O.gas_turbine[t];
    const lhs = O.grid[t] + contracts + gas + O.di[t];
    const rhs = I.L[t] - O.rel[t] - O.cur[t] - O.unserved[t] + O.ch[t];
    worstBalance = Math.max(worstBalance, Math.abs(lhs - rhs));
    worstCap = Math.max(worstCap, O.grid[t] + contracts - I.G[t]);
  }
  assert.ok(worstBalance < 1e-6, 'balance error ' + worstBalance);
  assert.ok(worstCap < 1e-6, 'import cap exceeded by ' + worstCap);
});

test('battery SOC, power, simultaneity, and cycle limits', () => {
  let soc = 0;
  const cyc = new Float64Array(10);
  for (let t = 0; t < E.N; t++) {
    soc += ETA * O.ch[t] - O.di[t] / ETA;
    assert.ok(Math.abs(soc - O.soc[t]) < 1e-6, 'SOC continuity at ' + t);
    assert.ok(O.soc[t] >= -1e-9 && O.soc[t] <= 4 * caps.battery_4h + 1e-9, 'SOC bounds at ' + t);
    assert.ok(O.ch[t] <= caps.battery_4h + 1e-9 && O.di[t] <= caps.battery_4h + 1e-9, 'power at ' + t);
    assert.ok(Math.min(O.ch[t], O.di[t]) < 1e-9, 'simultaneous charge and discharge at ' + t);
    if (I.month[t] < 14) assert.ok(O.ch[t] === 0 && O.di[t] === 0, 'battery used before it is available');
    cyc[I.year[t]] += O.di[t] / ETA;
  }
  assert.ok(Math.abs(O.soc[E.N - 1]) < 1e-6, 'final SOC is zero');
  for (let y = 0; y < 10; y++) assert.ok(cyc[y] <= 4 * caps.battery_4h * 365 + 1e-6, 'annual cycles, year ' + (y + 1));
});

test('V2: the battery charges from the grid, and clean-sourced charging is a subset', () => {
  let gridCharge = 0, cleanCharge = 0;
  for (let t = 0; t < E.N; t++) {
    assert.ok(O.cch[t] >= -1e-9 && O.cch[t] <= O.ch[t] + 1e-9, 'clean charge between 0 and total at ' + t);
    gridCharge += O.ch[t] - O.cch[t]; cleanCharge += O.cch[t];
  }
  assert.ok(gridCharge > 100, 'expected some grid-sourced charging, got ' + gridCharge);
  assert.ok(cleanCharge >= 0);
});

test('V2: discharge earns clean credit only in proportion to the year\'s clean charging', () => {
  for (let y = 0; y < 10; y++) {
    let ch = 0, cch = 0, di = 0, credit = 0;
    for (let t = y * E.HPY; t < (y + 1) * E.HPY; t++) { ch += O.ch[t]; cch += O.cch[t]; di += O.di[t]; credit += O.credit[t]; }
    const expected = -cch + di * (ch > 0 ? cch / ch : 0);
    assert.ok(Math.abs(credit - expected) < 1e-6, 'credit identity, year ' + (y + 1));
  }
  // clean MWh in the summary uses that credit, never more than the energy served
  const z = E.summarize(I, O, A);
  assert.ok(z.cleanShare >= 0 && z.cleanShare <= 1);
});

test('a plan with no battery is unaffected by the V2 battery code', () => {
  const none = { wind: 100, utility_solar: 50, gas_turbine: 25 };
  const O2 = E.dispatch(I, REF.res, none, 'when_cheaper', 'cost');
  assert.equal(O2.ch.reduce((a, v) => a + v, 0), 0);
  assert.equal(O2.credit.reduce((a, v) => a + Math.abs(v), 0), 0);
});
