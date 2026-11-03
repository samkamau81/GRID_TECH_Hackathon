/* Scenario engine: runs the cooling model and the suitability score for one or more locations under a set of what-if inputs.

   It reports ELECTRICITY COST and a SCREENING SCORE only. It deliberately has no ROI, NPV or payback: those need capital cost,
   revenue, operating cost, financing and a discount rate, and none of them are supplied. The multi-year figure is the plain sum
   of annual electricity cost (optionally with a fixed yearly price escalation), undiscounted.
   Everything here is an estimate built on the assumptions in cooling-model.js and scoring-engine.js; none of it is validated. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cooling-model.js'), require('./scoring-engine.js'));
  else root.PeakPowerScenario = factory(root.PeakPowerCooling, root.PeakPowerScoring);
})(typeof self !== 'undefined' ? self : this, function (Cooling, Scoring) {
  'use strict';

  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };

  function defaultScenario() {
    return { itMW: 50, baselinePue: Cooling.ASSUMPTIONS.defaultBaselinePue, system: Cooling.DEFAULT_SYSTEM, priceOverrideCentsPerKwh: null,
             hoursPerYear: Cooling.ASSUMPTIONS.defaultHoursPerYear, offsetC: 0, horizonYears: 10, priceEscalationPct: 0, weights: Scoring.defaultWeights() };
  }
  function merge(base, over) {
    var s = {}; Object.keys(base).forEach(function (k) { s[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
    return s;
  }

  /* Location shape: { id, label, lat, lon, state, climate, priceCentsPerKwh, saidiMinutes, ealRate, nearbyFacilities }
     (any of the last four may be null: they are then Not Assessed, not assumed). */
  function evaluate(loc, scenarioIn, refs) {
    var sc = merge(defaultScenario(), scenarioIn);
    var priceUsed = isNum(sc.priceOverrideCentsPerKwh) ? sc.priceOverrideCentsPerKwh : (isNum(loc.priceCentsPerKwh) ? loc.priceCentsPerKwh : null);
    var priceSource = isNum(sc.priceOverrideCentsPerKwh) ? 'entered by you' : (priceUsed !== null ? 'EIA state average industrial price' : null);
    var cooling = null, error = null;
    if (!loc.climate) error = 'No climate data for this location.';
    else {
      try {
        cooling = Cooling.annual({ itMW: sc.itMW, baselinePue: sc.baselinePue, system: sc.system, hoursPerYear: sc.hoursPerYear, offsetC: sc.offsetC,
                                   pricePerMWh: priceUsed === null ? undefined : priceUsed * 10 }, loc.climate);   // 1 cent/kWh = $10/MWh
      } catch (e) { error = e.message; }
    }
    var scoring = Scoring.assess({ modelCoolingRatio: cooling ? cooling.modelCoolingRatio : null, priceCentsPerKwh: priceUsed, saidiMinutes: loc.saidiMinutes,
                                   ealRate: loc.ealRate, nearbyFacilities: loc.nearbyFacilities }, sc.weights, refs);
    var cost = null;
    if (cooling && isNum(cooling.annualCostUsd)) {
      var esc = 1 + (sc.priceEscalationPct || 0) / 100, total = 0;
      for (var y = 0; y < sc.horizonYears; y++) total += cooling.annualCostUsd * Math.pow(esc, y);
      cost = { annualUsd: cooling.annualCostUsd, coolingUsd: cooling.coolingCostUsd, horizonYears: sc.horizonYears, horizonUsd: total, escalationPct: sc.priceEscalationPct || 0,
               discounted: false, note: 'Electricity cost only; undiscounted; not a return on investment.' };
    }
    return { location: { id: loc.id, label: loc.label, lat: loc.lat, lon: loc.lon, state: loc.state }, scenario: sc, error: error, cooling: cooling, scoring: scoring,
             price: { centsPerKwh: priceUsed, source: priceSource }, cost: cost };
  }

  /* Side-by-side comparison; deltas are relative to the first location. */
  function compare(locs, scenario, refs) {
    var rows = locs.map(function (l) { return evaluate(l, scenario, refs); });
    var base = rows[0];
    var deltas = rows.map(function (r) {
      var d = { annualCostUsd: null, annualCostPct: null, score: null, pue: null };
      if (r.cost && base.cost) { d.annualCostUsd = r.cost.annualUsd - base.cost.annualUsd; d.annualCostPct = base.cost.annualUsd ? 100 * d.annualCostUsd / base.cost.annualUsd : null; }
      if (r.scoring.overall.score !== null && base.scoring.overall.score !== null) d.score = r.scoring.overall.score - base.scoring.overall.score;
      if (r.cooling && base.cooling) d.pue = r.cooling.annualPue - base.cooling.annualPue;
      return d;
    });
    return { rows: rows, deltas: deltas };
  }

  /* One-at-a-time sensitivity of a location's cost and score to the assumptions that matter. */
  function sensitivity(loc, scenarioIn, refs) {
    var sc = merge(defaultScenario(), scenarioIn);
    var base = evaluate(loc, sc, refs);
    var price = base.price.centsPerKwh;
    var minPue = Cooling.minimumPue();
    var variations = [];
    if (price !== null) {
      variations.push({ id: 'price-20', group: 'Electricity price', label: 'Price 20% lower', change: { priceOverrideCentsPerKwh: price * 0.8 } });
      variations.push({ id: 'price+20', group: 'Electricity price', label: 'Price 20% higher', change: { priceOverrideCentsPerKwh: price * 1.2 } });
    }
    if (sc.baselinePue - 0.1 > minPue + 0.005) variations.push({ id: 'pue-0.1', group: 'Baseline PUE', label: 'Baseline PUE 0.1 lower', change: { baselinePue: +(sc.baselinePue - 0.1).toFixed(3) } });
    variations.push({ id: 'pue+0.1', group: 'Baseline PUE', label: 'Baseline PUE 0.1 higher', change: { baselinePue: +(sc.baselinePue + 0.1).toFixed(3) } });
    [2, 4].forEach(function (d) { variations.push({ id: 'warm+' + d, group: 'Climate', label: '+' + d + ' °C warmer than the scenario', change: { offsetC: sc.offsetC + d } }); });
    Object.keys(Cooling.SYSTEMS).forEach(function (id) {
      if (id !== sc.system) variations.push({ id: 'sys-' + id, group: 'Cooling system', label: Cooling.SYSTEMS[id].label, change: { system: id } });
    });
    var rows = variations.map(function (v) {
      var r = evaluate(loc, merge(sc, v.change), refs);
      var row = { id: v.id, group: v.group, label: v.label, error: r.error, annualCostUsd: r.cost ? r.cost.annualUsd : null, score: r.scoring.overall.score,
                  annualPue: r.cooling ? r.cooling.annualPue : null, deltaCostUsd: null, deltaCostPct: null, deltaScore: null };
      if (row.annualCostUsd !== null && base.cost) { row.deltaCostUsd = row.annualCostUsd - base.cost.annualUsd; row.deltaCostPct = 100 * row.deltaCostUsd / base.cost.annualUsd; }
      if (row.score !== null && base.scoring.overall.score !== null) row.deltaScore = row.score - base.scoring.overall.score;
      return row;
    });
    return { base: base, rows: rows };
  }

  /* Build a location from a precomputed grid cell plus the reference tables. `nearby` is the facility count within 100 km. */
  function locationFromCell(cell, reference, nearby) {
    var st = reference && reference.eia && reference.eia.states[cell.state];
    return { id: cell.id, label: (cell.anchor ? 'Interior point of ' : 'Grid cell near ') + cell.state, lat: cell.lat, lon: cell.lon, state: cell.state, climate: cell.climate,
             priceCentsPerKwh: st && isNum(st.industrialCentsPerKwh) ? st.industrialCentsPerKwh : null,
             saidiMinutes: st && isNum(st.saidiMinutes) ? st.saidiMinutes : null,
             ealRate: cell.hazard && isNum(cell.hazard.ealRate) ? cell.hazard.ealRate : null,
             nearbyFacilities: isNum(nearby) ? nearby : null };
  }

  /* Average result per state over its grid cells under one scenario. Cells with no score are left out of the mean and counted. */
  function stateSummary(cells, scenario, refs, reference, nearbyById) {
    var by = {};
    cells.forEach(function (cell) {
      var r = evaluate(locationFromCell(cell, reference, nearbyById ? nearbyById[cell.id] : null), scenario, refs);
      var s = by[cell.state] || (by[cell.state] = { state: cell.state, cells: 0, scored: 0, scoreSum: 0, minScore: Infinity, maxScore: -Infinity, costSum: 0, costN: 0, minCost: Infinity, maxCost: -Infinity, pueSum: 0, pueN: 0,
        coolCostSum: 0, coolMWhSum: 0, econSum: 0, factorSum: {}, factorN: {}, kinds: {} });
      s.cells++;
      var sc = r.scoring.overall.score;
      if (sc !== null) { s.scored++; s.scoreSum += sc; s.minScore = Math.min(s.minScore, sc); s.maxScore = Math.max(s.maxScore, sc); }
      s.kinds[r.scoring.overall.kind] = (s.kinds[r.scoring.overall.kind] || 0) + 1;
      if (r.cost) { s.costN++; s.costSum += r.cost.annualUsd; s.minCost = Math.min(s.minCost, r.cost.annualUsd); s.maxCost = Math.max(s.maxCost, r.cost.annualUsd); }
      if (r.cooling) { s.pueN++; s.pueSum += r.cooling.annualPue; s.coolMWhSum += r.cooling.coolingEnergyMWh; s.econSum += r.cooling.economizerHours.full; }
      if (r.cost) s.coolCostSum += r.cost.coolingUsd;
      r.scoring.factors.forEach(function (f) { if (f.status === 'assessed') { s.factorSum[f.id] = (s.factorSum[f.id] || 0) + f.score; s.factorN[f.id] = (s.factorN[f.id] || 0) + 1; } });
    });
    return Object.keys(by).map(function (k) {
      var s = by[k];
      return { state: s.state, cells: s.cells, scored: s.scored, meanScore: s.scored ? s.scoreSum / s.scored : null, minScore: s.scored ? s.minScore : null, maxScore: s.scored ? s.maxScore : null,
               meanAnnualCostUsd: s.costN ? s.costSum / s.costN : null, minAnnualCostUsd: s.costN ? s.minCost : null, maxAnnualCostUsd: s.costN ? s.maxCost : null,
               meanPue: s.pueN ? s.pueSum / s.pueN : null, kinds: s.kinds,
               meanCoolingCostUsd: s.costN ? s.coolCostSum / s.costN : null, meanCoolingMWh: s.pueN ? s.coolMWhSum / s.pueN : null,
               meanFullFreeCoolingHours: s.pueN ? s.econSum / s.pueN : null,
               factorMeans: Object.keys(s.factorSum).reduce(function (m, id) { m[id] = s.factorSum[id] / s.factorN[id]; return m; }, {}) };
    });
  }

  function rankByScore(summary) {
    return summary.filter(function (s) { return s.meanScore !== null; }).sort(function (a, b) { return b.meanScore - a.meanScore || a.state.localeCompare(b.state); });
  }

  return { defaultScenario: defaultScenario, evaluate: evaluate, compare: compare, sensitivity: sensitivity, locationFromCell: locationFromCell,
           stateSummary: stateSummary, rankByScore: rankByScore };
});
