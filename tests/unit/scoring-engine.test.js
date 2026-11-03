'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { js } = require('./helpers.js');
const S = js('scoring-engine.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const Q = Array.from({ length: 101 }, (_, i) => i / 1000);          // quantiles 0.000 .. 0.100 in steps of 0.001
const refs = { femaQuantiles: Q };
// Inputs that score exactly 50 on every factor
const mid = { modelCoolingRatio: 0.19, priceCentsPerKwh: 13, saidiMinutes: 180, ealRate: 0.05, nearbyFacilities: Math.sqrt(101) - 1 };

test('default weights are the documented illustrative ones and sum to 100', () => {
  const w = S.defaultWeights();
  assert.deepEqual(w, { climate: 25, electricity: 25, grid: 25, environment: 15, market: 10 });
  assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100);
});

test('linear score: best anchor 100, worst anchor 0, clipped, either direction', () => {
  assert.equal(S.linearScore(6, 6, 20), 100);
  assert.equal(S.linearScore(20, 6, 20), 0);
  assert.equal(S.linearScore(13, 6, 20), 50);
  assert.equal(S.linearScore(2, 6, 20), 100, 'cheaper than best is capped');
  assert.equal(S.linearScore(40, 6, 20), 0, 'dearer than worst is capped');
  assert.equal(S.linearScore(50, 100, 0), 50, 'higher-is-better scale');
  assert.equal(S.linearScore(null, 6, 20), null);
  assert.equal(S.linearScore(NaN, 6, 20), null);
  assert.equal(S.linearScore(undefined, 6, 20), null);
});

test('percentile rank interpolates inside the quantile table and clips outside it', () => {
  near(S.percentileRank(0.0375, Q), 37.5, 1e-9);
  assert.equal(S.percentileRank(-1, Q), 0);
  assert.equal(S.percentileRank(1, Q), 100);
  assert.equal(S.percentileRank(0.05, Q), 50);
  assert.equal(S.percentileRank(0.05, null), null);
  assert.equal(S.percentileRank(null, Q), null);
  const flat = [0, 1, 1, 1, 2];      // repeated values must not divide by zero
  assert.ok(Number.isFinite(S.percentileRank(1, flat)));
});

test('market score is logarithmic: 0 facilities scores 0, 100 or more scores 100', () => {
  assert.equal(S.marketScore(0), 0);
  near(S.marketScore(100), 100, 1e-9);
  assert.equal(S.marketScore(5000), 100);
  near(S.marketScore(10), 100 * Math.log10(11) / Math.log10(101), 1e-9);
  assert.ok(S.marketScore(1) > 0 && S.marketScore(1) < S.marketScore(10));
  assert.equal(S.marketScore(-3), null);
  assert.equal(S.marketScore(null), null);
});

test('all five factors assessed: every score is 50, so the overall is 50 and marked complete', () => {
  const r = S.assess(mid, null, refs);
  r.factors.forEach((f) => near(f.score, 50, 1e-9, f.id));
  near(r.overall.score, 50, 1e-9);
  assert.equal(r.overall.kind, 'complete');
  assert.equal(r.overall.coverage, 1);
  assert.equal(r.notScored.map((n) => n.id).sort().join(), 'capacity,infrastructure,water', 'unavailable factors are listed, never scored');
});

test('overall is the weighted mean of the factor scores', () => {
  // climate 100, electricity 0, grid 50, environment 0 (percentile 100), market 100
  const inputs = { modelCoolingRatio: 0.08, priceCentsPerKwh: 20, saidiMinutes: 180, ealRate: 0.1, nearbyFacilities: 100 };
  const r = S.assess(inputs, { climate: 25, electricity: 25, grid: 25, environment: 15, market: 10 }, refs);
  near(r.overall.score, (100 * 25 + 0 * 25 + 50 * 25 + 0 * 15 + 100 * 10) / 100, 1e-9);
  const c = S.contributions(r);
  near(c.reduce((a, x) => a + x.points, 0), r.overall.score, 1e-9, 'contributions add up to the score');
});

test('weights are relative: scaling them all changes nothing; changing one moves the score as expected', () => {
  const inputs = { modelCoolingRatio: 0.08, priceCentsPerKwh: 20, saidiMinutes: 300, ealRate: 0.1, nearbyFacilities: 0 };   // 100, 0, 0, 0, 0
  const a = S.assess(inputs, { climate: 25, electricity: 25, grid: 25, environment: 15, market: 10 }, refs);
  const b = S.assess(inputs, { climate: 250, electricity: 250, grid: 250, environment: 150, market: 100 }, refs);
  near(a.overall.score, b.overall.score, 1e-9);
  near(a.overall.score, 25, 1e-9);
  const heavy = S.assess(inputs, { climate: 70, electricity: 10, grid: 10, environment: 5, market: 5 }, refs);
  near(heavy.overall.score, 70, 1e-9);
  assert.ok(heavy.overall.score > a.overall.score, 'more weight on the one good factor raises the score');
});

test('missing data is Not Assessed and is never assumed favourable or unfavourable', () => {
  const r = S.assess({ ...mid, priceCentsPerKwh: null }, null, refs);
  const e = r.factors.find((f) => f.id === 'electricity');
  assert.equal(e.status, 'not-assessed');
  assert.equal(e.score, null);
  assert.equal(e.effectiveWeight, 0);
  assert.equal(r.overall.kind, 'partial');
  near(r.overall.coverage, 0.75, 1e-9);
  near(r.overall.score, 50, 1e-9, 'the other four are all 50, so a neutral result shows nothing was filled in');
  // with the missing factor's weight redistributed, the climate share is 25 / 75
  near(r.factors.find((f) => f.id === 'climate').effectiveWeight, 25 / 75, 1e-9);
  // and a missing factor must not drag the result toward 0 or 100
  const lowRest = S.assess({ modelCoolingRatio: 0.30, priceCentsPerKwh: null, saidiMinutes: 300, ealRate: 0.1, nearbyFacilities: 0 }, null, refs);
  assert.equal(lowRest.overall.score, 0, 'all assessed factors are 0, so the score is 0, not pulled up by the missing one');
});

test('too little assessable weight falls back to a climate-only assessment', () => {
  const r = S.assess({ modelCoolingRatio: 0.12, nearbyFacilities: 50 }, null, refs);      // climate 25 + market 10 = 35 % of weight
  assert.equal(r.overall.kind, 'climate-only');
  near(r.overall.score, r.factors[0].score, 1e-12);
  near(r.overall.coverage, 0.35, 1e-9);
  const only = S.assess({ modelCoolingRatio: 0.12 }, null, refs);
  assert.equal(only.overall.kind, 'climate-only');
});

test('no climate data means no score at all', () => {
  const r = S.assess({ priceCentsPerKwh: 8, saidiMinutes: 100, ealRate: 0.01, nearbyFacilities: 50 }, null, refs);
  assert.equal(r.overall.score, null);
  assert.equal(r.overall.kind, 'insufficient');
});

test('a factor with zero weight is excluded from the score and from the coverage', () => {
  const inputs = { modelCoolingRatio: 0.08, priceCentsPerKwh: 20, saidiMinutes: 180, ealRate: 0.05, nearbyFacilities: 0 };
  const r = S.assess(inputs, { climate: 50, electricity: 0, grid: 50, environment: 0, market: 0 }, refs);
  near(r.overall.score, (100 + 50) / 2, 1e-9);
  assert.equal(r.factors.find((f) => f.id === 'electricity').effectiveWeight, 0);
  const none = S.assess(inputs, { climate: 0, electricity: 0, grid: 0, environment: 0, market: 0 }, refs);
  assert.equal(none.overall.kind, 'climate-only', 'no weight at all cannot support a blended score');
});

test('environment score is 100 minus the county percentile (higher hazard, lower score)', () => {
  const lo = S.assess({ ...mid, ealRate: 0.01 }, null, refs).factors.find((f) => f.id === 'environment');
  const hi = S.assess({ ...mid, ealRate: 0.09 }, null, refs).factors.find((f) => f.id === 'environment');
  near(lo.value, 10, 1e-9); near(lo.score, 90, 1e-9);
  near(hi.value, 90, 1e-9); near(hi.score, 10, 1e-9);
  assert.equal(S.assess({ ...mid, ealRate: null }, null, refs).factors.find((f) => f.id === 'environment').status, 'not-assessed');
  assert.equal(S.assess(mid, null, {}).factors.find((f) => f.id === 'environment').status, 'not-assessed', 'no quantile table, no hazard score');
});

test('every factor documents its direction, anchors and source', () => {
  S.FACTORS.forEach((f) => {
    assert.ok(f.label && f.unit && f.direction && f.source && f.how, f.id);
    assert.ok(f.anchors && typeof f.anchors.best === 'number' && typeof f.anchors.worst === 'number', f.id);
    assert.ok((f.direction === 'lower is better') === (f.anchors.best < f.anchors.worst), `${f.id}: direction matches the anchors`);
  });
});
