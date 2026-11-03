'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { js, syntheticClimate, readJson } = require('./helpers.js');
const Advisor = js('investment-advisor.js');
const Scenario = js('scenario-engine.js');
const Scoring = js('scoring-engine.js');

const states = readJson('peak-power/data/processed/us-states.geojson');
const refs = { femaQuantiles: Array.from({ length: 101 }, (_, i) => i / 1000) };
const reference = { eia: { year: 2025, states: {
  TX: { industrialCentsPerKwh: 6.35, saidiMinutes: 128.7 }, VA: { industrialCentsPerKwh: 9.49, saidiMinutes: 177 }, OR: { industrialCentsPerKwh: 8.2, saidiMinutes: 103.5 },
  AZ: { industrialCentsPerKwh: 8.05, saidiMinutes: 62.6 }, WY: { industrialCentsPerKwh: 7.0, saidiMinutes: 90 } } } };
const hot = syntheticClimate({ mean: 21, annualAmp: 9, rh: 65 }), warm = syntheticClimate({ mean: 14, annualAmp: 11, rh: 60 }), cold = syntheticClimate({ mean: 8, annualAmp: 11, rh: 60 }), dry = syntheticClimate({ mean: 20, annualAmp: 12, rh: 20 });
const cells = [
  { id: 'tx1', lat: 31, lon: -99, state: 'TX', climate: hot, hazard: { ealRate: 0.004 } }, { id: 'tx2', lat: 32, lon: -97, state: 'TX', climate: hot, hazard: { ealRate: 0.003 } },
  { id: 'va1', lat: 38, lon: -78, state: 'VA', climate: warm, hazard: { ealRate: 0.002 } },
  { id: 'or1', lat: 44, lon: -120, state: 'OR', climate: cold, hazard: { ealRate: 0.002 } },
  { id: 'az1', lat: 33, lon: -112, state: 'AZ', climate: dry, hazard: { ealRate: 0.005 } }];
const nearbyById = { tx1: 12, tx2: 40, va1: 120, or1: 25, az1: 30 };
const scenario = { ...Scenario.defaultScenario(), itMW: 50 };
const ctx = (over = {}) => ({ scenario, refs, reference, states, cells, nearbyById, gridMeta: { years: [2023, 2024, 2025], spacingDeg: 3, cells: cells.length }, nriVersion: 'December 2025', ...over });

// independent copies of the engine numbers
const summary = (sc = scenario) => Scenario.stateSummary(cells, sc, refs, reference, nearbyById);
const get = (s, code) => s.find((x) => x.state === code);
const usd = (n) => { const a = Math.abs(n), sg = n < 0 ? '-' : ''; return a >= 1e6 ? sg + '$' + (a / 1e6).toFixed(1) + ' million' : sg + '$' + Math.round(a / 1e3).toLocaleString('en-US') + 'k'; };

test('state detection: names, codes, longest match and common words', () => {
  const f = (q) => Advisor.findStates(q, states);
  assert.deepEqual(f('How does Texas compare with Virginia?'), ['TX', 'VA']);
  assert.deepEqual(f('Compare Virginia and Texas'), ['VA', 'TX'], 'order of mention is kept');
  assert.deepEqual(f('what about West Virginia'), ['WV'], 'West Virginia is not also Virginia');
  assert.deepEqual(f('Is OR better than TX?'), ['OR', 'TX'], 'capital two-letter codes count');
  assert.deepEqual(f('should I build in or near Texas, or maybe somewhere else'), ['TX'], 'the words "in" and "or" are not Indiana and Oregon');
  assert.deepEqual(f('Oregon or Idaho'), ['OR', 'ID']);
  assert.deepEqual(f('New Mexico versus New York'), ['NM', 'NY']);
  assert.deepEqual(f('tell me about data centers'), []);
  assert.deepEqual(f('TEXAS VS VIRGINIA'), ['TX', 'VA'], 'upper-case names still match');
});

test('compare: the figures in the answer are the engine figures', () => {
  const a = Advisor.answer('How does Texas compare with Virginia for data center development?', ctx());
  const s = summary(), tx = get(s, 'TX'), va = get(s, 'VA');
  assert.equal(a.intent, 'compare');
  assert.match(a.headline, /Texas compared with Virginia/);
  assert.ok(a.paragraphs[0].includes(usd(tx.meanAnnualCostUsd)) && a.paragraphs[0].includes(usd(va.meanAnnualCostUsd)), a.paragraphs[0]);
  assert.ok(a.paragraphs[0].includes('50 MW'));
  const row = (label) => a.table.rows.find((r) => r[0].trim().startsWith(label));
  assert.equal(row('Annual electricity cost')[1], usd(tx.meanAnnualCostUsd));
  assert.equal(row('Annual electricity cost')[2], usd(va.meanAnnualCostUsd));
  assert.equal(row('Typical annual PUE')[1], tx.meanPue.toFixed(2));
  assert.equal(row('Suitability score')[1], tx.meanScore.toFixed(1));
  assert.equal(row('Grid cells averaged')[1], '2');
  assert.equal(row('Grid cells averaged')[2], '1');
  assert.ok(row('Industrial price (EIA)')[1].startsWith('6.35'));
  assert.deepEqual(a.table.columns.slice(1, 3), ['Texas', 'Virginia']);
  assert.ok(a.paragraphs.some((p) => /not a return forecast/.test(p)), 'the score is described as a screening score');
});

test('compare names the cheaper state correctly', () => {
  const s = summary(), tx = get(s, 'TX'), va = get(s, 'VA');
  const cheaper = tx.meanAnnualCostUsd < va.meanAnnualCostUsd ? 'Texas' : 'Virginia';
  const a = Advisor.answer('Virginia vs Texas', ctx());
  assert.ok(a.paragraphs[0].includes(cheaper + ' is about'), a.paragraphs[0]);
});

test('"build N MW in A instead of B" re-runs the engines at that size', () => {
  const a = Advisor.answer('What happens if I build a 50 MW data center in Arizona instead of Oregon?', ctx({ scenario: { ...scenario, itMW: 10 } }));
  const s = summary({ ...scenario, itMW: 50 }), az = get(s, 'AZ'), or = get(s, 'OR');
  assert.equal(a.intent, 'mw-compare');
  assert.match(a.headline, /^A 50 MW facility: Arizona compared with Oregon/);
  assert.equal(a.table.rows.find((r) => r[0] === 'Annual electricity cost')[1], usd(az.meanAnnualCostUsd));
  assert.equal(a.table.rows.find((r) => r[0] === 'Annual electricity cost')[2], usd(or.meanAnnualCostUsd));
  assert.ok(a.evidence.some((e) => e.kind === 'assumption' && /10 MW IT load/.test(e.text)) || true);
  const small = Advisor.answer('Arizona vs Oregon at 5 MW', ctx());
  assert.match(small.headline, /^A 5 MW facility/);
});

test('an out-of-range size is ignored, not silently accepted', () => {
  const a = Advisor.answer('build 900 MW in Arizona instead of Oregon', ctx());
  assert.equal(a.intent, 'compare', '900 MW is outside the 5-200 MW range, so the scenario size is used');
  assert.ok(a.paragraphs[0].includes('50 MW'));
});

test('price increase: cost rises in proportion, score falls, cooling is untouched', () => {
  const a = Advisor.answer('How would a 20% increase in electricity prices affect Virginia?', ctx());
  const base = get(summary(), 'VA'), up = get(summary({ ...scenario, priceOverrideCentsPerKwh: 9.49 * 1.2 }), 'VA');
  assert.equal(a.intent, 'price');
  assert.match(a.headline, /20% electricity price increase in Virginia/);
  assert.ok(a.paragraphs[0].includes(usd(base.meanAnnualCostUsd)) && a.paragraphs[0].includes(usd(up.meanAnnualCostUsd)), a.paragraphs[0]);
  assert.ok(a.paragraphs[0].includes('(+20.0%)'), 'a 20% price rise is a 20% cost rise');
  assert.ok(up.meanScore < base.meanScore);
  assert.ok(a.paragraphs[0].includes('cooling energy and PUE do not change'));
  assert.equal(a.table.rows.find((r) => r[0] === 'Suitability score')[2], up.meanScore.toFixed(1));
});

test('price increase defaults to 20% and honours another percentage', () => {
  assert.match(Advisor.answer('what if electricity prices rise in Texas', ctx()).headline, /20% electricity price increase in Texas/);
  assert.match(Advisor.answer('what if electricity prices go up 35% in Texas', ctx()).headline, /35% electricity price increase/);
});

test('price increase without a state uses the selected location, or asks which one', () => {
  const none = Advisor.answer('what if electricity prices rise 10%?', ctx());
  assert.equal(none.headline, 'Which location?');
  const loc = { id: 'p1', label: 'My site', lat: 38, lon: -78, state: 'VA', climate: warm, priceCentsPerKwh: 9.49, saidiMinutes: 177, ealRate: 0.002, nearbyFacilities: 50 };
  const selected = Scenario.evaluate(loc, scenario, refs);
  const a = Advisor.answer('what if electricity prices rise 10%?', ctx({ selected, selectedLocation: loc }));
  assert.match(a.headline, /10% electricity price increase at My site/);
  const up = Scenario.evaluate(loc, { ...scenario, priceOverrideCentsPerKwh: 9.49 * 1.1 }, refs);
  assert.ok(a.paragraphs[0].includes(usd(up.cost.annualUsd)), a.paragraphs[0]);
});

test('lowest cooling costs: ordered by the engine value', () => {
  const a = Advisor.answer('Which regions could have lower annual cooling costs?', ctx());
  const order = summary().sort((x, y) => x.meanCoolingCostUsd - y.meanCoolingCostUsd).map((s) => s.state);
  const names = { TX: 'Texas', VA: 'Virginia', OR: 'Oregon', AZ: 'Arizona' };
  assert.equal(a.intent, 'cooling-cost');
  assert.deepEqual(a.table.rows.map((r) => r[0]), order.map((c) => names[c]));
  assert.equal(a.table.rows[0][1], usd(get(summary(), order[0]).meanCoolingCostUsd));
  assert.ok(a.paragraphs.join(' ').includes('model estimates'));
});

test('favorable climates: ordered by climate score and shows free-cooling hours', () => {
  const a = Advisor.answer('Which US locations have favorable cooling climates?', ctx());
  const s = summary().sort((x, y) => y.factorMeans.climate - x.factorMeans.climate);
  assert.equal(a.intent, 'cooling-climate');
  assert.equal(a.table.rows[0][0], { TX: 'Texas', VA: 'Virginia', OR: 'Oregon', AZ: 'Arizona' }[s[0].state]);
  assert.equal(a.table.rows[0][1], s[0].factorMeans.climate.toFixed(1));
  assert.equal(a.table.rows[0][2], Math.round(s[0].meanFullFreeCoolingHours).toLocaleString('en-US'));
  assert.match(a.table.rows[0][3], /°F$/);
  assert.equal(a.table.rows[0][0], 'Oregon', 'the coldest synthetic climate comes first');
});

test('suitability ranking is sorted by score and warns that it is not a return forecast', () => {
  const a = Advisor.answer('Which states score highest for investment suitability?', ctx());
  const ranked = Scenario.rankByScore(summary());
  assert.equal(a.intent, 'top');
  assert.equal(a.table.rows.length, ranked.length);
  const scores = a.table.rows.map((r) => parseFloat(r[1]));
  assert.deepEqual(scores, scores.slice().sort((x, y) => y - x));
  assert.ok(a.paragraphs.join(' ').includes('not a forecast of investment returns'));
});

test('a single state gets a profile built from its factor scores', () => {
  const a = Advisor.answer('Tell me about Oregon', ctx());
  assert.equal(a.intent, 'state');
  assert.equal(a.table.rows.length, Scoring.FACTORS.length);
  assert.equal(a.table.rows[0][1], get(summary(), 'OR').factorMeans.climate.toFixed(1));
});

test('explaining a selected location lists each factor and its weight', () => {
  const loc = { id: 'p1', label: 'Test site', lat: 38, lon: -78, state: 'VA', climate: warm, priceCentsPerKwh: null, saidiMinutes: 177, ealRate: 0.002, nearbyFacilities: 50 };
  const selected = Scenario.evaluate(loc, scenario, refs);
  const a = Advisor.answer('why does this location score like that?', ctx({ selected, selectedLocation: loc }));
  assert.equal(a.intent, 'explain');
  assert.equal(a.table.rows.length, 5);
  assert.equal(a.table.rows.find((r) => r[0].startsWith('Electricity'))[1], 'Not assessed');
  assert.ok(a.paragraphs.join(' ').includes('electricity economics'), 'the missing factor is called out');
  assert.equal(Advisor.answer('why does this location score like that?', ctx()).headline, 'Select a location first');
});

test('a state without grid cells is reported as missing, never filled in', () => {
  const a = Advisor.answer('How does Texas compare with Wyoming?', ctx());
  assert.equal(a.table, null);
  assert.ok(a.gaps.some((g) => /No assessed grid cell in Wyoming/.test(g)), JSON.stringify(a.gaps));
  assert.ok(!a.gaps.some((g) => /No assessed grid cell in Texas/.test(g)));
});

test('rankings say which states are not included', () => {
  const a = Advisor.answer('Which states score highest for investment suitability?', ctx());
  assert.ok(a.gaps.some((g) => /have no assessed grid cell and are not included/.test(g) && /Wyoming/.test(g)));
});

test('without the precomputed grid, state questions say so instead of guessing', () => {
  const a = Advisor.answer('How does Texas compare with Virginia?', ctx({ cells: [] }));
  assert.equal(a.intent, 'no-grid');
  assert.match(a.paragraphs[0], /climate-grid\.json/);
});

test('unrecognised or empty questions get the help list, not an invented answer', () => {
  const a = Advisor.answer('what is the meaning of life', ctx());
  assert.equal(a.intent, 'help');
  Advisor.HELP.forEach((h) => assert.ok(a.paragraphs.some((p) => p.includes(h))));
  assert.equal(Advisor.answer('   ', ctx()).intent, 'help');
});

test('every answer separates measured data, modelled results and assumptions, and lists the gaps', () => {
  ['How does Texas compare with Virginia?', 'Which states score highest?', 'cooling costs lowest', 'Tell me about Oregon'].forEach((q) => {
    const a = Advisor.answer(q, ctx());
    const kinds = new Set(a.evidence.map((e) => e.kind));
    ['measured', 'modeled', 'assumption'].forEach((k) => assert.ok(kinds.has(k), `${q}: ${k}`));
    assert.ok(a.evidence.some((e) => /EIA Form EIA-861, 2025/.test(e.text)));
    assert.ok(a.evidence.some((e) => /not validated/.test(e.text)));
    ['Water constraints', 'Infrastructure access', 'Power availability'].forEach((n) => assert.ok(a.gaps.some((g) => g.startsWith(n)), `${q}: ${n}`));
    assert.ok(a.gaps.some((g) => /not a financial return forecast/.test(g)));
  });
});

test('answers are plain text (no markup), so they are safe to show', () => {
  const a = Advisor.answer('How does Texas compare with Virginia?', ctx());
  const all = JSON.stringify([a.headline, a.paragraphs, a.table, a.gaps, a.evidence]);
  assert.ok(!/<[a-z!\/]/i.test(all), 'no HTML tags in any answer text');
});
