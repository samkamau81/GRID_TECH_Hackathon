/* Investment suitability scoring: an interpretable weighted multi-criteria score, deliberately not a trained model.

   STATUS: an illustrative screening score. The default weights are examples, not validated investment preferences, and the
   normalization ranges are round-number assumptions. A score says how a location compares on the factors that could be assessed;
   it is NOT a financial return forecast and does not include capital cost, revenue, land, taxes, incentives or permitting.

   Each factor is turned into 0-100 (higher is more suitable) with a linear scale between a "best" and a "worst" anchor value.
   Weights are then re-normalised over the factors that could actually be assessed, so a missing factor is never silently
   treated as good or bad: it is reported as Not Assessed, and the result says how much of the weight it rests on.
   Pure functions, no dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PeakPowerScoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* The five factors that are scored, with default weights (percent). `anchors` map a raw value to 0..100:
     the `best` value scores 100, the `worst` value scores 0, linearly in between and clipped outside. */
  var FACTORS = [
    { id: 'climate', label: 'Climate & cooling efficiency', defaultWeight: 25, unit: 'cooling kWh per IT kWh', direction: 'lower is better',
      anchors: { best: 0.08, worst: 0.30 }, source: 'Open-Meteo history (ERA5) through the cooling model',
      how: 'Modelled annual cooling electricity per kWh of IT load for the chosen cooling system, before baseline-PUE calibration.' },
    { id: 'electricity', label: 'Electricity economics', defaultWeight: 25, unit: '¢/kWh', direction: 'lower is better',
      anchors: { best: 6, worst: 20 }, source: 'EIA Form EIA-861 (state average industrial price) or the price you enter',
      how: 'Average industrial electricity price. A state average, not a negotiated large-load tariff.' },
    { id: 'grid', label: 'Grid reliability', defaultWeight: 25, unit: 'minutes/yr', direction: 'lower is better',
      anchors: { best: 60, worst: 300 }, source: 'EIA Form EIA-861 reliability file (state SAIDI, without major event days)',
      how: 'Customer-weighted average outage duration per customer. Reliability only: spare capacity and interconnection time are not assessed.' },
    { id: 'environment', label: 'Environmental risk', defaultWeight: 15, unit: 'percentile of US counties', direction: 'lower is better',
      anchors: { best: 0, worst: 100 }, source: 'FEMA National Risk Index (county expected annual building loss rate)',
      how: 'Where the county ranks among US counties on expected annual building loss as a share of building value (natural hazards).' },
    { id: 'market', label: 'Market & connectivity', defaultWeight: 10, unit: 'mapped facilities within 100 km', direction: 'higher is better',
      anchors: { best: 100, worst: 0 }, source: 'Data center dataset (OpenStreetMap-derived)',
      how: 'Count of mapped data centers nearby, on a log scale, as a proxy for an established ecosystem. Assumption: more is better; it can also mean grid congestion.' }
  ];

  /* Factors the brief lists that no authoritative dataset has been integrated for. They are shown, never scored or assumed. */
  var NOT_SCORED = [
    { id: 'water', label: 'Water constraints', reason: 'No water-stress dataset has been integrated.' },
    { id: 'infrastructure', label: 'Infrastructure access', reason: 'No fiber, transmission or substation data has been integrated.' },
    { id: 'capacity', label: 'Power availability / interconnection', reason: 'Spare grid capacity and interconnection queues are not in any dataset used here.' }
  ];

  var clamp = function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); };
  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };

  /* Linear 0-100 score between anchors; the direction follows from which anchor is larger. */
  function linearScore(value, best, worst) {
    if (!isNum(value)) return null;
    return clamp((value - worst) / (best - worst), 0, 1) * 100;
  }

  /* Where `value` falls in a sorted array of 101 quantiles (p0..p100), as a percentile 0..100 with interpolation. */
  function percentileRank(value, quantiles) {
    if (!isNum(value) || !quantiles || quantiles.length < 2) return null;
    var n = quantiles.length - 1;
    if (value <= quantiles[0]) return 0;
    if (value >= quantiles[n]) return 100;
    var lo = 0, hi = n;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (quantiles[mid] <= value) lo = mid; else hi = mid; }
    var span = quantiles[hi] - quantiles[lo];
    return (lo + (span > 0 ? (value - quantiles[lo]) / span : 0)) * 100 / n;
  }

  function marketScore(count) {   // log scale: 0 facilities -> 0, 100 or more within 100 km -> 100
    if (!isNum(count) || count < 0) return null;
    return Math.min(100, 100 * Math.log10(1 + count) / Math.log10(101));
  }

  function defaultWeights() {
    var w = {}; FACTORS.forEach(function (f) { w[f.id] = f.defaultWeight; }); return w;
  }

  /* inputs: { modelCoolingRatio, priceCentsPerKwh, saidiMinutes, ealRate, nearbyFacilities }  (null/undefined = no data)
     refs:   { femaQuantiles }  (needed to rank the hazard rate)
     weights: { climate, electricity, grid, environment, market } as non-negative numbers (any scale) */
  function assess(inputs, weights, refs) {
    var inp = inputs || {}, w = weights || defaultWeights(), r = refs || {};
    var raw = { climate: inp.modelCoolingRatio, electricity: inp.priceCentsPerKwh, grid: inp.saidiMinutes, environment: null, market: inp.nearbyFacilities };
    var envPct = percentileRank(inp.ealRate, r.femaQuantiles);
    raw.environment = envPct;
    var scores = {
      climate: linearScore(raw.climate, FACTORS[0].anchors.best, FACTORS[0].anchors.worst),
      electricity: linearScore(raw.electricity, FACTORS[1].anchors.best, FACTORS[1].anchors.worst),
      grid: linearScore(raw.grid, FACTORS[2].anchors.best, FACTORS[2].anchors.worst),
      environment: envPct === null ? null : 100 - envPct,
      market: marketScore(raw.market)
    };
    var factors = FACTORS.map(function (f) {
      var s = scores[f.id], wt = isNum(w[f.id]) && w[f.id] > 0 ? w[f.id] : 0;
      return { id: f.id, label: f.label, unit: f.unit, direction: f.direction, source: f.source, how: f.how, value: isNum(raw[f.id]) ? raw[f.id] : null,
               score: s, weight: wt, status: s === null ? 'not-assessed' : 'assessed' };
    });

    var totalW = factors.reduce(function (a, f) { return a + f.weight; }, 0);
    var assessed = factors.filter(function (f) { return f.status === 'assessed' && f.weight > 0; });
    var assessedW = assessed.reduce(function (a, f) { return a + f.weight; }, 0);
    var coverage = totalW > 0 ? assessedW / totalW : 0;
    factors.forEach(function (f) { f.effectiveWeight = f.status === 'assessed' && assessedW > 0 ? f.weight / assessedW : 0; });
    var climate = factors[0];

    var overall;
    if (climate.status !== 'assessed') {
      overall = { score: null, kind: 'insufficient', coverage: coverage, label: 'Not enough data', note: 'Climate data is missing, so no suitability score is calculated.' };
    } else if (assessed.length === FACTORS.length) {
      overall = { score: sum(assessed), kind: 'complete', coverage: coverage, label: 'All five scored factors assessed', note: 'Water, infrastructure access and power availability are not assessed.' };
    } else if (coverage >= 0.5 && assessedW > 0) {
      overall = { score: sum(assessed), kind: 'partial', coverage: coverage, label: 'Partial assessment', note: 'Based on ' + Math.round(coverage * 100) + '% of the weight; missing factors are not assumed.' };
    } else {
      overall = { score: climate.score, kind: 'climate-only', coverage: coverage, label: 'Climate-only assessment', note: 'Too little of the weight could be assessed to blend factors, so only climate is scored.' };
    }
    return { factors: factors, notScored: NOT_SCORED, overall: overall, weightsUsed: copy(w) };
  }

  function sum(assessed) {
    var tw = assessed.reduce(function (a, f) { return a + f.weight; }, 0);
    return assessed.reduce(function (a, f) { return a + f.score * f.weight; }, 0) / tw;
  }
  function copy(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }

  /* Per-factor contribution (in score points) to the overall score, for explanations. */
  function contributions(result) {
    return result.factors.filter(function (f) { return f.status === 'assessed' && f.effectiveWeight > 0; })
      .map(function (f) { return { id: f.id, label: f.label, points: f.score * f.effectiveWeight, score: f.score, share: f.effectiveWeight }; });
  }

  return { FACTORS: FACTORS, NOT_SCORED: NOT_SCORED, defaultWeights: defaultWeights, linearScore: linearScore, percentileRank: percentileRank,
           marketScore: marketScore, assess: assess, contributions: contributions };
});
