'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { js, syntheticClimate } = require('./helpers.js');
const Scenario = js('scenario-engine.js');
const Cooling = js('cooling-model.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const Q = Array.from({ length: 101 }, (_, i) => i / 1000);
const refs = { femaQuantiles: Q };
const cool = syntheticClimate({ mean: 9, annualAmp: 11, rh: 60 });
const hot = syntheticClimate({ mean: 23, annualAmp: 8, rh: 65 });
const loc = (over = {}) => ({ id: 'L1', label: 'Test site', lat: 39, lon: -77, state: 'VA', climate: cool, priceCentsPerKwh: 8, saidiMinutes: 120, ealRate: 0.02, nearbyFacilities: 30, ...over });

test('default scenario matches the documented ranges and weights', () => {
  const d = Scenario.defaultScenario();
  assert.ok(d.itMW >= 5 && d.itMW <= 200);
  assert.equal(d.hoursPerYear, 8760);
  assert.equal(d.offsetC, 0);
  assert.equal(d.priceOverrideCentsPerKwh, null);
  assert.deepEqual(d.weights, { climate: 25, electricity: 25, grid: 25, environment: 15, market: 10 });
});

test('annual cost = facility energy x price, with 1 cent/kWh = $10/MWh', () => {
  const r = Scenario.evaluate(loc(), { itMW: 20 }, refs);
  assert.equal(r.price.centsPerKwh, 8);
  assert.equal(r.price.source, 'EIA state average industrial price');
  near(r.cooling.pricePerMWh, 80, 1e-12);
  near(r.cost.annualUsd, r.cooling.facilityEnergyMWh * 80, 1e-6);
  near(r.cost.coolingUsd, r.cooling.coolingEnergyMWh * 80, 1e-6);
  // sanity on magnitude: 20 MW x 8760 h = 175,200 MWh of IT energy; at a PUE of about 1.3 that is about 228,000 MWh,
  // and at $80/MWh about $18 million a year
  assert.ok(r.cooling.annualPue > 1.2 && r.cooling.annualPue < 1.4, String(r.cooling.annualPue));
  near(r.cost.annualUsd, 175200 * r.cooling.annualPue * 80, 1e-3);
  assert.ok(r.cost.annualUsd > 16e6 && r.cost.annualUsd < 20e6, String(r.cost.annualUsd));
});

test('a price you enter beats the state average, and the source says so', () => {
  const r = Scenario.evaluate(loc(), { priceOverrideCentsPerKwh: 5 }, refs);
  assert.equal(r.price.centsPerKwh, 5);
  assert.equal(r.price.source, 'entered by you');
  const base = Scenario.evaluate(loc(), {}, refs);
  near(r.cost.annualUsd / base.cost.annualUsd, 5 / 8, 1e-12);
});

test('no price anywhere: no cost is invented and electricity economics is Not Assessed', () => {
  const r = Scenario.evaluate(loc({ priceCentsPerKwh: null }), {}, refs);
  assert.equal(r.cost, null);
  assert.equal(r.price.centsPerKwh, null);
  assert.equal(r.price.source, null);
  assert.equal(r.scoring.factors.find((f) => f.id === 'electricity').status, 'not-assessed');
  assert.ok(r.cooling.annualPue > 1, 'the physical results are still produced');
});

test('multi-year cost is a plain undiscounted sum, with optional fixed escalation', () => {
  const flat = Scenario.evaluate(loc(), { horizonYears: 10 }, refs);
  near(flat.cost.horizonUsd, 10 * flat.cost.annualUsd, 1e-3);
  const esc = Scenario.evaluate(loc(), { horizonYears: 3, priceEscalationPct: 5 }, refs);
  near(esc.cost.horizonUsd, esc.cost.annualUsd * (1 + 1.05 + 1.05 * 1.05), 1e-3);
  assert.equal(flat.cost.discounted, false);
  assert.match(flat.cost.note, /not a return on investment/);
});

test('there is no ROI, NPV or payback anywhere in a result', () => {
  const text = JSON.stringify(Scenario.evaluate(loc(), {}, refs)).toLowerCase();
  ['"roi', 'npv', 'payback', 'irr"', 'revenue'].forEach((w) => assert.ok(!text.includes(w), 'found ' + w));
});

test('a hot location costs more to cool and scores lower on climate than a cool one', () => {
  const c = Scenario.evaluate(loc({ climate: cool }), {}, refs), h = Scenario.evaluate(loc({ climate: hot }), {}, refs);
  assert.ok(h.cooling.annualPue > c.cooling.annualPue);
  assert.ok(h.cost.annualUsd > c.cost.annualUsd);
  assert.ok(h.scoring.factors[0].score < c.scoring.factors[0].score);
});

test('failures are reported on the result instead of throwing, and leave climate Not Assessed', () => {
  const noWb = { ...cool, hist: { ...cool.hist, wb: null } };
  const r = Scenario.evaluate(loc({ climate: noWb }), { system: 'water-chiller' }, refs);
  assert.match(r.error, /wet-bulb/);
  assert.equal(r.cooling, null);
  assert.equal(r.scoring.overall.kind, 'insufficient');
  assert.equal(r.scoring.overall.score, null);
  const none = Scenario.evaluate(loc({ climate: null }), {}, refs);
  assert.match(none.error, /No climate data/);
  const badPue = Scenario.evaluate(loc(), { baselinePue: 1.01 }, refs);
  assert.match(badPue.error, /below the model minimum/);
});

test('comparison: deltas are relative to the first location, which has zero delta', () => {
  const cmp = Scenario.compare([loc({ id: 'A', climate: cool }), loc({ id: 'B', climate: hot, priceCentsPerKwh: 6 }), loc({ id: 'C', climate: cool, priceCentsPerKwh: 12 })], { itMW: 30 }, refs);
  assert.equal(cmp.rows.length, 3);
  assert.equal(cmp.deltas[0].annualCostUsd, 0);
  assert.equal(cmp.deltas[0].score, 0);
  near(cmp.deltas[1].annualCostUsd, cmp.rows[1].cost.annualUsd - cmp.rows[0].cost.annualUsd, 1e-6);
  near(cmp.deltas[2].annualCostPct, 100 * (cmp.rows[2].cost.annualUsd / cmp.rows[0].cost.annualUsd - 1), 1e-9);
  assert.ok(cmp.deltas[2].annualCostPct > 0, 'dearer power, same climate, costs more');
  assert.ok(cmp.deltas[2].score < 0, 'and scores lower');
});

test('comparison copes with a location that has no cost', () => {
  const cmp = Scenario.compare([loc(), loc({ id: 'B', priceCentsPerKwh: null })], {}, refs);
  assert.equal(cmp.deltas[1].annualCostUsd, null);
  assert.equal(cmp.deltas[1].annualCostPct, null);
});

test('sensitivity: price moves cost proportionally and the score in the right direction', () => {
  const s = Scenario.sensitivity(loc(), { itMW: 25 }, refs);
  const row = (id) => s.rows.find((r) => r.id === id);
  near(row('price+20').deltaCostPct, 20, 1e-9);
  near(row('price-20').deltaCostPct, -20, 1e-9);
  assert.ok(row('price+20').deltaScore < 0 && row('price-20').deltaScore > 0);
  assert.ok(row('pue+0.1').deltaCostUsd > 0 && row('pue-0.1').deltaCostUsd < 0);
  assert.ok(row('warm+2').deltaCostUsd > 0 && row('warm+4').deltaCostUsd > row('warm+2').deltaCostUsd, 'more warming, more cost');
  assert.equal(s.rows.filter((r) => r.group === 'Cooling system').length, Object.keys(Cooling.SYSTEMS).length - 1, 'every other cooling system is tried');
  assert.ok(!s.rows.some((r) => r.id === 'sys-' + s.base.scenario.system), 'the current system is not listed against itself');
});

test('sensitivity omits price cases when there is no price and the PUE case that would be impossible', () => {
  const noPrice = Scenario.sensitivity(loc({ priceCentsPerKwh: null }), {}, refs);
  assert.ok(!noPrice.rows.some((r) => r.group === 'Electricity price'));
  const lowPue = Scenario.sensitivity(loc(), { baselinePue: 1.12 }, refs);
  assert.ok(!lowPue.rows.some((r) => r.id === 'pue-0.1'), '1.02 is below the model minimum, so it is not offered');
  assert.ok(lowPue.rows.some((r) => r.id === 'pue+0.1'));
});

test('grid cell to location mapping uses state tables and leaves gaps as null', () => {
  const reference = { eia: { states: { VA: { industrialCentsPerKwh: 9.49, saidiMinutes: 177 }, WY: {} } } };
  const cell = { id: 'g_1', lat: 38, lon: -78, state: 'VA', anchor: false, climate: cool, hazard: { ealRate: 0.0021 } };
  const l = Scenario.locationFromCell(cell, reference, 12);
  assert.equal(l.priceCentsPerKwh, 9.49); assert.equal(l.saidiMinutes, 177); assert.equal(l.ealRate, 0.0021); assert.equal(l.nearbyFacilities, 12);
  const gap = Scenario.locationFromCell({ ...cell, state: 'WY', hazard: null }, reference, undefined);
  assert.equal(gap.priceCentsPerKwh, null); assert.equal(gap.saidiMinutes, null); assert.equal(gap.ealRate, null); assert.equal(gap.nearbyFacilities, null);
});

test('state summary averages cells per state and the ranking responds to the weights', () => {
  const reference = { eia: { states: { AA: { industrialCentsPerKwh: 6, saidiMinutes: 80 }, BB: { industrialCentsPerKwh: 18, saidiMinutes: 250 } } } };
  const cells = [
    { id: 'a1', lat: 40, lon: -100, state: 'AA', climate: cool, hazard: { ealRate: 0.01 } }, { id: 'a2', lat: 41, lon: -101, state: 'AA', climate: hot, hazard: { ealRate: 0.01 } },
    { id: 'b1', lat: 30, lon: -90, state: 'BB', climate: cool, hazard: { ealRate: 0.05 } }];
  const nearby = { a1: 40, a2: 40, b1: 40 };
  const sum = Scenario.stateSummary(cells, {}, refs, reference, nearby);
  const aa = sum.find((s) => s.state === 'AA'), bb = sum.find((s) => s.state === 'BB');
  assert.equal(aa.cells, 2); assert.equal(bb.cells, 1); assert.equal(aa.scored, 2);
  const e1 = Scenario.evaluate(Scenario.locationFromCell(cells[0], reference, 40), {}, refs).scoring.overall.score;
  const e2 = Scenario.evaluate(Scenario.locationFromCell(cells[1], reference, 40), {}, refs).scoring.overall.score;
  near(aa.meanScore, (e1 + e2) / 2, 1e-9);
  assert.ok(aa.minScore <= aa.meanScore && aa.meanScore <= aa.maxScore);
  // the extra fields the advisor explains from
  const r1 = Scenario.evaluate(Scenario.locationFromCell(cells[0], reference, 40), {}, refs), r2 = Scenario.evaluate(Scenario.locationFromCell(cells[1], reference, 40), {}, refs);
  near(aa.meanCoolingCostUsd, (r1.cost.coolingUsd + r2.cost.coolingUsd) / 2, 1e-6);
  near(aa.meanCoolingMWh, (r1.cooling.coolingEnergyMWh + r2.cooling.coolingEnergyMWh) / 2, 1e-6);
  near(aa.meanFullFreeCoolingHours, (r1.cooling.economizerHours.full + r2.cooling.economizerHours.full) / 2, 1e-9);
  near(aa.factorMeans.climate, (r1.scoring.factors[0].score + r2.scoring.factors[0].score) / 2, 1e-9);
  assert.deepEqual(Object.keys(aa.factorMeans).sort(), ['climate', 'electricity', 'environment', 'grid', 'market']);
  const ranked = Scenario.rankByScore(sum);
  assert.deepEqual(ranked.map((s) => s.state), ['AA', 'BB'], 'cheap, reliable, low-hazard AA ranks first');
  // put all weight on climate: BB (one cool cell) can overtake AA (one cool, one hot cell)
  const climateOnly = Scenario.rankByScore(Scenario.stateSummary(cells, { weights: { climate: 100, electricity: 0, grid: 0, environment: 0, market: 0 } }, refs, reference, nearby));
  assert.deepEqual(climateOnly.map((s) => s.state), ['BB', 'AA']);
});
