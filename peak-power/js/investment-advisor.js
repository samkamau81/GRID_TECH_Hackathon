/* Peak Power Investment Advisor: explains modelled results in plain language.

   HOW IT WORKS: it recognises the kind of question, runs the same scenario and scoring engines the rest of the page uses, and phrases
   what they returned. Every number in an answer comes from those engines or from the loaded datasets; the advisor performs no
   estimation of its own. No language model is connected, so it understands a fixed set of question types (see HELP) and says so
   when it does not understand. Each answer separates measured data, modelled results and assumptions, and lists what is missing.
   An LLM could later be added server-side to rephrase these structured answers; it must never be allowed to supply the numbers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./scenario-engine.js'), require('./scoring-engine.js'), require('./cooling-model.js'), require('./us-geo.js'));
  else root.PeakPowerAdvisor = factory(root.PeakPowerScenario, root.PeakPowerScoring, root.PeakPowerCooling, root.PeakPowerGeo);
})(typeof self !== 'undefined' ? self : this, function (Scenario, Scoring, Cooling, Geo) {
  'use strict';

  var HELP = [
    'Which US locations have favorable cooling climates?',
    'How does Texas compare with Virginia for data center development?',
    'Which states could have lower annual cooling costs?',
    'How would a 20% increase in electricity prices affect Virginia?',
    'What happens if I build a 50 MW data center in Arizona instead of Oregon?',
    'Which states score highest for investment suitability?'
  ];

  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };
  var usd = function (n) { if (!isNum(n)) return 'not available'; var a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(1) + ' million' : s + '$' + Math.round(a / 1e3).toLocaleString('en-US') + 'k'; };
  var pct = function (n) { return isNum(n) ? (n > 0 ? '+' : '') + n.toFixed(1) + '%' : 'n/a'; };
  var f1 = function (n) { return isNum(n) ? n.toFixed(1) : 'n/a'; };
  var f2 = function (n) { return isNum(n) ? n.toFixed(2) : 'n/a'; };
  var cents = function (n) { return isNum(n) ? n.toFixed(2) + ' ¢/kWh' : 'not available'; };

  /* US states mentioned in a question, in order. Full names always count (longest first, so "West Virginia" is not "Virginia");
     two-letter codes count only when written in capitals, so the words "or", "in", "me" are not read as Oregon, Indiana, Maine. */
  function findStates(question, statesGeo) {
    var list = statesGeo.features.map(function (f) { return { code: f.properties.code, name: f.properties.name }; });
    var found = [], text = ' ' + question.toLowerCase() + ' ';
    list.slice().sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (s) {
      var re = new RegExp('(^|[^a-z])' + s.name.toLowerCase() + '(?![a-z])'), m = re.exec(text);
      if (m) { var at = m.index + m[1].length; found.push({ code: s.code, at: at }); text = text.slice(0, at) + ' '.repeat(s.name.length) + text.slice(at + s.name.length); }
    });
    var re2 = /(^|[^A-Za-z])([A-Z]{2})(?![A-Za-z])/g, m2, hasLower = /[a-z]/.test(question);
    while ((m2 = re2.exec(question)) !== null) {
      var code = m2[2];
      if (hasLower && list.some(function (s) { return s.code === code; }) && !found.some(function (f) { return f.code === code; })) found.push({ code: code, at: m2.index + m2[1].length });
    }
    return found.sort(function (a, b) { return a.at - b.at; }).map(function (f) { return f.code; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
  }

  function baseEvidence(ctx) {
    var eia = ctx.reference && ctx.reference.eia, sc = ctx.scenario, sys = Cooling.SYSTEMS[sc.system];
    var g = ctx.gridMeta || {};
    var ev = [];
    if (eia) ev.push({ kind: 'measured', text: 'State average industrial electricity price and utility-reported reliability (SAIDI) from EIA Form EIA-861, ' + eia.year + ' final data.' });
    if (ctx.nriVersion) ev.push({ kind: 'measured', text: 'County natural-hazard loss rates from FEMA National Risk Index (' + ctx.nriVersion + ').' });
    if (g.years) ev.push({ kind: 'modeled', text: 'Climate from Open-Meteo ERA5 reanalysis, ' + g.years[0] + '-' + g.years[g.years.length - 1] + ', on a ' + g.spacingDeg + '° grid (' + g.cells + ' cells). A modelled estimate, not station measurements.' });
    ev.push({ kind: 'modeled', text: 'Cooling energy from the illustrative cooling model (' + (sys ? sys.label : sc.system) + '); not validated against real facilities.' });
    ev.push({ kind: 'assumption', text: 'Scenario: ' + sc.itMW + ' MW IT load, baseline PUE ' + sc.baselinePue + ', ' + sc.hoursPerYear + ' operating hours a year' + (sc.offsetC ? ', climate +' + sc.offsetC + ' °C' : '') + (isNum(sc.priceOverrideCentsPerKwh) ? ', electricity price fixed at ' + cents(sc.priceOverrideCentsPerKwh) : ', electricity at each state\'s EIA average') + '.' });
    ev.push({ kind: 'assumption', text: 'Score weights (illustrative, not validated preferences): ' + Scoring.FACTORS.map(function (f) { return f.label.split(' ')[0].toLowerCase() + ' ' + sc.weights[f.id]; }).join(', ') + '.' });
    return ev;
  }
  function baseGaps(ctx, extra) {
    var gaps = Scoring.NOT_SCORED.map(function (n) { return n.label + ': not assessed. ' + n.reason; });
    gaps.push('Scores are a screening comparison, not a financial return forecast: capital cost, revenue, taxes, incentives and permitting are not modelled.');
    gaps.push('State figures average the grid cells inside each state; a specific site can differ. Click the map to analyse an exact location.');
    return (extra || []).concat(gaps);
  }
  function reply(intent, headline, paragraphs, table, ctx, gaps) {
    return { intent: intent, headline: headline, paragraphs: paragraphs, table: table || null, evidence: baseEvidence(ctx), gaps: baseGaps(ctx, gaps) };
  }
  var name = function (code, ctx) { return Geo.stateName(code, ctx.states); };

  function summaries(ctx, scenario) { return Scenario.stateSummary(ctx.cells, scenario || ctx.scenario, ctx.refs, ctx.reference, ctx.nearbyById); }
  var byState = function (list, code) { return list.filter(function (s) { return s.state === code; })[0] || null; };
  function noCells(codes, sums, ctx) {
    return codes.filter(function (c) { return !byState(sums, c); }).map(function (c) { return 'No assessed grid cell in ' + name(c, ctx) + ', so it cannot be compared here. Search for a place or click the map to analyse a specific location live.'; });
  }

  // ---------------------------------------------------------------- answers
  function compareStates(codes, ctx, scenario, intent, mwNote) {
    var sums = summaries(ctx, scenario), a = byState(sums, codes[0]), b = byState(sums, codes[1]), missing = noCells(codes.slice(0, 2), sums, ctx);
    var sc = scenario;
    if (!a || !b) return reply(intent, 'Not enough data to compare ' + name(codes[0], ctx) + ' and ' + name(codes[1], ctx), ['The comparison needs at least one assessed grid cell in each state.'], null, ctx, missing);
    var A = name(a.state, ctx), B = name(b.state, ctx);
    var dCost = b.meanAnnualCostUsd - a.meanAnnualCostUsd, dPct = 100 * dCost / a.meanAnnualCostUsd;
    var cheaper = dCost < 0 ? B : A, dearer = dCost < 0 ? A : B;
    var eiaA = ctx.reference.eia.states[a.state], eiaB = ctx.reference.eia.states[b.state];
    var paras = [];
    paras.push('For a ' + sc.itMW + ' MW IT load, typical annual electricity cost is about ' + usd(a.meanAnnualCostUsd) + ' in ' + A + ' and ' + usd(b.meanAnnualCostUsd) + ' in ' + B +
      ', so ' + cheaper + ' is about ' + usd(Math.abs(dCost)) + ' (' + Math.abs(dPct).toFixed(0) + '%) cheaper than ' + dearer + '.');
    var priceGap = isNum(eiaA.industrialCentsPerKwh) && isNum(eiaB.industrialCentsPerKwh) ? eiaB.industrialCentsPerKwh - eiaA.industrialCentsPerKwh : null;
    paras.push('Most of that comes from the electricity price (' + cents(eiaA.industrialCentsPerKwh) + ' in ' + A + ' against ' + cents(eiaB.industrialCentsPerKwh) + ' in ' + B + ', EIA state averages). ' +
      'Climate adds a smaller effect through PUE: about ' + f2(a.meanPue) + ' in ' + A + ' against ' + f2(b.meanPue) + ' in ' + B + ' (modelled).' +
      (isNum(sc.priceOverrideCentsPerKwh) ? ' Because you fixed the price, the price effect is removed and only climate separates them.' : ''));
    if (isNum(a.meanScore) && isNum(b.meanScore)) {
      var ds = Scoring.FACTORS.map(function (f) { return { f: f, d: (b.factorMeans[f.id] === undefined || a.factorMeans[f.id] === undefined) ? null : b.factorMeans[f.id] - a.factorMeans[f.id] }; })
        .filter(function (x) { return x.d !== null; }).sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); }).slice(0, 2);
      paras.push('Modelled suitability score (a screening score, not a return forecast): ' + A + ' ' + f1(a.meanScore) + ', ' + B + ' ' + f1(b.meanScore) + '. The biggest differences are ' +
        ds.map(function (x) { return x.f.label.toLowerCase() + ' (' + (x.d > 0 ? B : A) + ' ahead by ' + Math.abs(x.d).toFixed(0) + ' points)'; }).join(' and ') + '.');
    }
    var rows = [
      ['Typical annual PUE (modelled)', f2(a.meanPue), f2(b.meanPue), (b.meanPue - a.meanPue >= 0 ? '+' : '') + (b.meanPue - a.meanPue).toFixed(3)],
      ['Annual electricity cost', usd(a.meanAnnualCostUsd), usd(b.meanAnnualCostUsd), usd(dCost) + ' (' + pct(dPct) + ')'],
      ['  of which cooling', usd(a.meanCoolingCostUsd), usd(b.meanCoolingCostUsd), usd(b.meanCoolingCostUsd - a.meanCoolingCostUsd)],
      ['Industrial price (EIA)', cents(eiaA.industrialCentsPerKwh), cents(eiaB.industrialCentsPerKwh), priceGap === null ? 'n/a' : (priceGap >= 0 ? '+' : '') + priceGap.toFixed(2) + ' ¢/kWh'],
      ['Grid reliability, SAIDI (EIA)', isNum(eiaA.saidiMinutes) ? Math.round(eiaA.saidiMinutes) + ' min/yr' : 'not available', isNum(eiaB.saidiMinutes) ? Math.round(eiaB.saidiMinutes) + ' min/yr' : 'not available', ''],
      ['Suitability score (screening)', f1(a.meanScore), f1(b.meanScore), isNum(a.meanScore) && isNum(b.meanScore) ? (b.meanScore - a.meanScore >= 0 ? '+' : '') + (b.meanScore - a.meanScore).toFixed(1) : 'n/a'],
      ['Cost range across grid cells', usd(a.minAnnualCostUsd) + ' to ' + usd(a.maxAnnualCostUsd), usd(b.minAnnualCostUsd) + ' to ' + usd(b.maxAnnualCostUsd), ''],
      ['Grid cells averaged', String(a.cells), String(b.cells), '']
    ];
    return reply(intent, (mwNote || '') + A + ' compared with ' + B, paras, { columns: ['', A, B, B + ' minus ' + A], rows: rows }, ctx, missing);
  }

  function priceChange(codes, x, ctx) {
    var sc = ctx.scenario, f = x / 100;
    if (codes.length) {
      var code = codes[0], base = summaries(ctx), s0 = byState(base, code), price = ctx.reference.eia.states[code] && ctx.reference.eia.states[code].industrialCentsPerKwh;
      if (!s0 || !isNum(price)) return reply('price', 'Not enough data for ' + name(code, ctx), ['There is no assessed grid cell or price for this state.'], null, ctx, noCells([code], base, ctx));
      var changed = base.map(function (s) { return s.state === code ? summaries({ cells: ctx.cells.filter(function (c) { return c.state === code; }), refs: ctx.refs, reference: ctx.reference, nearbyById: ctx.nearbyById },
        Object.assign({}, sc, { priceOverrideCentsPerKwh: price * (1 + f) }))[0] : s; });
      var s1 = byState(changed, code), rank0 = Scenario.rankByScore(base).map(function (s) { return s.state; }).indexOf(code) + 1, rank1 = Scenario.rankByScore(changed).map(function (s) { return s.state; }).indexOf(code) + 1;
      var dCost = s1.meanAnnualCostUsd - s0.meanAnnualCostUsd;
      var paras = ['If ' + name(code, ctx) + '\'s electricity price rose ' + x + '% (from ' + cents(price) + ' to ' + cents(price * (1 + f)) + '), the annual electricity bill for a ' + sc.itMW + ' MW IT load would go from ' + usd(s0.meanAnnualCostUsd) + ' to ' +
        usd(s1.meanAnnualCostUsd) + ', an increase of ' + usd(dCost) + ' (' + pct(100 * dCost / s0.meanAnnualCostUsd) + '). Cost moves in proportion to price; cooling energy and PUE do not change.',
        'On the suitability score it falls from ' + f1(s0.meanScore) + ' to ' + f1(s1.meanScore) + ' (' + (s1.meanScore - s0.meanScore).toFixed(1) + ' points), because only the electricity-economics factor responds. ' +
        (rank0 && rank1 ? 'Its rank among the ' + Scenario.rankByScore(base).length + ' assessed states goes from ' + rank0 + ' to ' + rank1 + '.' : '')];
      return reply('price', 'A ' + x + '% electricity price increase in ' + name(code, ctx), paras, { columns: ['', 'Now', 'After +' + x + '%', 'Change'], rows: [
        ['Industrial price', cents(price), cents(price * (1 + f)), '+' + (price * f).toFixed(2) + ' ¢/kWh'],
        ['Annual electricity cost', usd(s0.meanAnnualCostUsd), usd(s1.meanAnnualCostUsd), usd(dCost)],
        ['Suitability score', f1(s0.meanScore), f1(s1.meanScore), (s1.meanScore - s0.meanScore).toFixed(1)],
        ['Rank among assessed states', String(rank0), String(rank1), '']] }, ctx, noCells([code], base, ctx));
    }
    var sel = ctx.selected;
    if (sel && sel.price && isNum(sel.price.centsPerKwh)) {
      var up = Scenario.evaluate({ id: sel.location.id, label: sel.location.label, lat: sel.location.lat, lon: sel.location.lon, state: sel.location.state, climate: ctx.selectedLocation.climate,
        priceCentsPerKwh: ctx.selectedLocation.priceCentsPerKwh, saidiMinutes: ctx.selectedLocation.saidiMinutes, ealRate: ctx.selectedLocation.ealRate, nearbyFacilities: ctx.selectedLocation.nearbyFacilities },
        Object.assign({}, sc, { priceOverrideCentsPerKwh: sel.price.centsPerKwh * (1 + f) }), ctx.refs);
      var d = up.cost.annualUsd - sel.cost.annualUsd;
      return reply('price', 'A ' + x + '% electricity price increase at ' + sel.location.label, ['At the selected location the annual electricity cost would rise from ' + usd(sel.cost.annualUsd) + ' to ' + usd(up.cost.annualUsd) +
        ' (' + usd(d) + ', ' + pct(100 * d / sel.cost.annualUsd) + '), and the suitability score would move from ' + f1(sel.scoring.overall.score) + ' to ' + f1(up.scoring.overall.score) + '.'], null, ctx, []);
    }
    return reply('price', 'Which location?', ['Name a state (for example "How would a 20% increase in electricity prices affect Virginia?") or select a location on the map first.'], null, ctx, []);
  }

  function rankTable(list, columns, rowFn, n) {
    return { columns: columns, rows: list.slice(0, n).map(rowFn) };
  }

  function coolingCost(ctx) {
    var sums = summaries(ctx).filter(function (s) { return isNum(s.meanCoolingCostUsd); }).sort(function (a, b) { return a.meanCoolingCostUsd - b.meanCoolingCostUsd; });
    if (!sums.length) return noGrid(ctx);
    var top = sums.slice(0, 5), worst = sums[sums.length - 1];
    var paras = ['For a ' + ctx.scenario.itMW + ' MW IT load, the lowest modelled annual cooling electricity costs are in ' + top.map(function (s) { return name(s.state, ctx) + ' (' + usd(s.meanCoolingCostUsd) + ')'; }).join(', ') +
      '. The highest of the ' + sums.length + ' assessed states is ' + name(worst.state, ctx) + ' at ' + usd(worst.meanCoolingCostUsd) + '.',
      'Cooling cost depends on both the climate (how much work the cooling plant does) and the local electricity price, so a cool state with dear power can still cost more than a warmer state with cheap power. ' +
      'These are model estimates for ' + Cooling.SYSTEMS[ctx.scenario.system].label.toLowerCase() + '; a different cooling system changes the ranking.'];
    return reply('cooling-cost', 'States with the lowest modelled annual cooling costs', paras, rankTable(sums, ['State', 'Cooling cost / yr', 'Annual PUE (modelled)', 'Electricity price (EIA)'],
      function (s) { return [name(s.state, ctx), usd(s.meanCoolingCostUsd), f2(s.meanPue), cents(ctx.reference.eia.states[s.state].industrialCentsPerKwh)]; }, 5), ctx, missingStates(sums, ctx));
  }

  function coolingClimate(ctx) {
    var sums = summaries(ctx).filter(function (s) { return isNum(s.factorMeans.climate); }).sort(function (a, b) { return b.factorMeans.climate - a.factorMeans.climate; });
    if (!sums.length) return noGrid(ctx);
    var top = sums.slice(0, 5), cellMean = function (code) { var cs = ctx.cells.filter(function (c) { return c.state === code; }); return cs.reduce(function (a, c) { return a + c.climate.annual.meanC; }, 0) / cs.length; };
    var paras = ['For ' + Cooling.SYSTEMS[ctx.scenario.system].label.toLowerCase() + ', the most favorable cooling climates among the ' + sums.length + ' assessed states are ' + top.map(function (s) { return name(s.state, ctx) + ' (climate score ' + f1(s.factorMeans.climate) + ')'; }).join(', ') +
      '. This is driven by how many hours of the year outdoor temperature (or humidity, for evaporative and water-cooled systems) allow free cooling: ' + top.map(function (s) { return name(s.state, ctx) + ' about ' + Math.round(s.meanFullFreeCoolingHours).toLocaleString('en-US') + ' h'; }).join(', ') + ' of full free cooling a year.',
      'Climate is only one factor: a good climate does not make a location suitable if power is expensive, the grid is unreliable or hazards are high. See the suitability ranking for the combined picture.'];
    return reply('cooling-climate', 'Most favorable cooling climates in the United States', paras, rankTable(sums, ['State', 'Climate score', 'Free-cooling hours / yr', 'Mean annual temperature'],
      function (s) { return [name(s.state, ctx), f1(s.factorMeans.climate), Math.round(s.meanFullFreeCoolingHours).toLocaleString('en-US'), f1(cellMean(s.state) * 1.8 + 32) + ' °F']; }, 5), ctx, missingStates(sums, ctx));
  }

  function topSuitability(ctx) {
    var ranked = Scenario.rankByScore(summaries(ctx));
    if (!ranked.length) return noGrid(ctx);
    var top = ranked.slice(0, 5), kinds = {};
    ranked.forEach(function (s) { Object.keys(s.kinds).forEach(function (k) { kinds[k] = (kinds[k] || 0) + s.kinds[k]; }); });
    var paras = ['With the current weights, the highest modelled suitability scores belong to ' + top.map(function (s) { return name(s.state, ctx) + ' (' + f1(s.meanScore) + ')'; }).join(', ') + ', out of ' + ranked.length + ' assessed states.',
      'This is a screening score from climate, electricity price, grid reliability, natural-hazard exposure and nearby data-center presence. It is not a forecast of investment returns, and the weights are illustrative: change them in the controls and the ranking updates.'];
    return reply('top', 'Highest modelled suitability scores', paras, rankTable(ranked, ['State', 'Score (mean of cells)', 'Range across cells', 'Annual electricity cost'],
      function (s) { return [name(s.state, ctx), f1(s.meanScore), f1(s.minScore) + ' to ' + f1(s.maxScore), usd(s.meanAnnualCostUsd)]; }, 5), ctx, missingStates(ranked, ctx));
  }

  function stateProfile(code, ctx) {
    var sums = summaries(ctx), s = byState(sums, code), e = ctx.reference.eia.states[code];
    if (!s) return reply('state', name(code, ctx), ['There is no assessed grid cell in ' + name(code, ctx) + '.'], null, ctx, noCells([code], sums, ctx));
    var rank = Scenario.rankByScore(sums).map(function (x) { return x.state; }).indexOf(code) + 1;
    var paras = [name(code, ctx) + ' scores about ' + f1(s.meanScore) + ' (range ' + f1(s.minScore) + ' to ' + f1(s.maxScore) + ' across ' + s.cells + ' grid cells), ranking ' + rank + ' of ' + Scenario.rankByScore(sums).length + ' assessed states under the current weights. ' +
      'A ' + ctx.scenario.itMW + ' MW IT load would cost about ' + usd(s.meanAnnualCostUsd) + ' a year in electricity at an annual PUE of about ' + f2(s.meanPue) + ' (modelled).'];
    return reply('state', name(code, ctx) + ' at a glance', paras, { columns: ['Factor', 'Mean score (0-100)', 'Underlying data'], rows: Scoring.FACTORS.map(function (f) {
      var v = { climate: 'modelled cooling energy', electricity: cents(e.industrialCentsPerKwh) + ' (EIA)', grid: isNum(e.saidiMinutes) ? Math.round(e.saidiMinutes) + ' min/yr SAIDI (EIA)' : 'not available', environment: 'FEMA county loss-rate percentile', market: 'mapped data centers within 100 km' }[f.id];
      return [f.label, isNum(s.factorMeans[f.id]) ? f1(s.factorMeans[f.id]) : 'Not assessed', v]; }) }, ctx, []);
  }

  function explainSelected(ctx) {
    var sel = ctx.selected;
    if (!sel) return reply('explain', 'Select a location first', ['Click the map or search for a place, then ask again.'], null, ctx, []);
    var o = sel.scoring.overall, contrib = Scoring.contributions(sel.scoring).sort(function (a, b) { return b.points - a.points; });
    var paras = [sel.location.label + ': ' + (o.score === null ? 'no suitability score could be calculated (' + o.note + ')' : 'modelled suitability ' + f1(o.score) + ' (' + o.label.toLowerCase() + '; ' + Math.round(o.coverage * 100) + '% of the weight assessed)') + '.'];
    if (contrib.length) paras.push('Largest contributions: ' + contrib.slice(0, 3).map(function (c) { return c.label.toLowerCase() + ' (' + f1(c.points) + ' points from a score of ' + f1(c.score) + ')'; }).join(', ') + '.');
    var miss = sel.scoring.factors.filter(function (f) { return f.status !== 'assessed'; });
    if (miss.length) paras.push('Not assessed for this location: ' + miss.map(function (f) { return f.label.toLowerCase(); }).join(', ') + '. They are left out rather than assumed.');
    return reply('explain', 'How ' + sel.location.label + ' scores', paras, { columns: ['Factor', 'Value', 'Score', 'Weight used'], rows: sel.scoring.factors.map(function (f) {
      return [f.label, f.value === null ? 'Not assessed' : f1(f.value) + ' ' + f.unit, f.score === null ? 'n/a' : f1(f.score), f.effectiveWeight ? Math.round(f.effectiveWeight * 100) + '%' : '0%']; }) }, ctx, []);
  }

  function noGrid(ctx) {
    return reply('no-grid', 'The precomputed climate grid is not loaded', ['State-level answers need the precomputed climate grid (data/processed/climate-grid.json). You can still click the map to analyse an individual location.'], null, ctx, []);
  }
  function missingStates(sums, ctx) {
    var have = {}; sums.forEach(function (s) { have[s.state] = 1; });
    var miss = ctx.states.features.map(function (f) { return f.properties.code; }).filter(function (c) { return !have[c]; });
    return miss.length ? [miss.length + ' states or territories have no assessed grid cell and are not included: ' + miss.map(function (c) { return name(c, ctx); }).join(', ') + '.'] : [];
  }
  function help(ctx) {
    return reply('help', 'I can answer questions like these', ['I explain the model\'s results; I do not look up anything else, and I do not give investment advice. Try one of these, or rephrase.'].concat(HELP.map(function (h) { return '• ' + h; })), null, ctx, []);
  }

  /* ctx: { scenario, refs, reference, states, cells, nearbyById, gridMeta, nriVersion, selected (engine result), selectedLocation } */
  function answer(question, ctx) {
    var q = String(question || '').trim(), low = q.toLowerCase();
    if (!q) return help(ctx);
    var states = findStates(q, ctx.states), mw = /(\d+(?:\.\d+)?)\s*mw\b/i.exec(q), pctM = /(\d+(?:\.\d+)?)\s*%/.exec(q);
    var hasCells = ctx.cells && ctx.cells.length;
    if (states.length >= 2 && hasCells) {
      if (mw) { var m = parseFloat(mw[1]); if (m >= 5 && m <= 200) return compareStates(states, ctx, Object.assign({}, ctx.scenario, { itMW: m }), 'mw-compare', 'A ' + m + ' MW facility: '); }
      return compareStates(states, ctx, ctx.scenario, 'compare', '');
    }
    if (/\b(price|prices|electricity|power cost|rates?)\b/.test(low) && /\b(increase|increases|rise|rises|higher|go up|goes up|jump|spike|raise|hike)\b|%/.test(low) && (states.length === 0 || hasCells)) {
      return priceChange(states.slice(0, 1), pctM ? parseFloat(pctM[1]) : 20, ctx);
    }
    if (!hasCells && (states.length || /cool|climate|best|top|rank|score|compare/.test(low))) return noGrid(ctx);
    if (/cooling/.test(low) && /(cost|cheap|lower|lowest|least|saving|expens|bill)/.test(low)) return coolingCost(ctx);
    if (/(climate|cold|cool|mild|temperature|weather)/.test(low) && /(favou?rable|best|good|suitable|which|where)/.test(low)) return coolingClimate(ctx);
    if (/(best|top|highest|most suitable|where should|invest|rank)/.test(low)) return topSuitability(ctx);
    if (/(why|explain|how.*score|this location|selected|my location)/.test(low)) return explainSelected(ctx);
    if (states.length === 1) return stateProfile(states[0], ctx);
    return help(ctx);
  }

  return { answer: answer, findStates: findStates, HELP: HELP };
});
