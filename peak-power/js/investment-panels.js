/* Rendering for the Investment Intelligence page: location panel, comparison table, state ranking, advisor answers,
   methodology and the API usage meter. Pure DOM building from plain data; no map and no network here.
   All text is inserted with textContent (never innerHTML), because place names and API strings are not trusted. */
(function (root) {
  'use strict';
  var Climate = root.PeakPowerClimate, Scoring = root.PeakPowerScoring, Cooling = root.PeakPowerCooling;
  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };
  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  var num0 = function (n) { return isNum(n) ? nf0.format(n) : 'n/a'; }, num1 = function (n) { return isNum(n) ? nf1.format(n) : 'n/a'; };
  var F = function (c) { return isNum(c) ? Climate.cToF(c) : null; };
  var degF = function (c) { return isNum(c) ? nf0.format(Climate.cToF(c)) + ' °F' : 'n/a'; };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function money(n) { if (!isNum(n)) return 'n/a'; var a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + '$' + nf0.format(a / 1e3) + 'k' : s + '$' + nf0.format(a); }
  function gwh(mwh) { return isNum(mwh) ? (mwh / 1000).toFixed(mwh >= 1e5 ? 0 : 1) + ' GWh' : 'n/a'; }
  var cents = function (n) { return isNum(n) ? n.toFixed(2) + ' ¢/kWh' : 'not available'; };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else if (k === 'class') n.className = props[k]; else if (k === 'style') n.style.cssText = props[k]; else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }); }
  /* 0..100 score to colour: red, amber, green */
  function scoreColor(s) {
    var red = [229, 72, 77], amb = [245, 184, 61], grn = [29, 184, 122], t = Math.max(0, Math.min(100, s)) / 100;
    var c = t < 0.5 ? mix(red, amb, t / 0.5) : mix(amb, grn, (t - 0.5) / 0.5);
    return 'rgb(' + c.join(',') + ')';
  }
  /* generic sequential ramp through colour stops, t in 0..1 */
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t)); var seg = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(seg));
    return 'rgb(' + mix(stops[i], stops[i + 1], seg - i).join(',') + ')';
  }
  var tag = function (kind, text) { return el('span', { class: 'ii-tag ' + kind, text: text || kind }); };
  function tile(k, v, s, wide) { return el('div', { class: 'ii-tile' + (wide ? ' wide' : '') }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v }), s ? el('span', { class: 's', text: s }) : null]); }
  function section(title, kids, badge) { return el('div', { class: 'ii-sec' }, [el('h3', {}, [el('span', { text: title }), badge || null])].concat(kids)); }
  function loading(text) { return el('div', { class: 'ii-loading' }, [el('div', { class: 'ii-spinner', 'aria-hidden': 'true' }), el('span', { text: text })]); }
  function coordText(lat, lon) { return Math.abs(lat).toFixed(3) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(3) + '° ' + (lon >= 0 ? 'E' : 'W'); }

  // ------------------------------------------------------------------ location panel
  function currentSection(m) {
    var c = m.current, kids = [];
    if (c.status === 'loading') kids.push(loading('Fetching current conditions…'));
    else if (c.status === 'error') kids.push(el('div', { class: 'ii-err', text: 'Current weather unavailable: ' + c.error }));
    else {
      var d = c.data.current;
      kids.push(el('div', { class: 'ii-tiles' }, [
        tile('Temperature', num0(d.temperature_2m) + ' °F', 'feels like ' + num0(d.apparent_temperature) + ' °F'), tile('Conditions', c.data.description, 'at ' + String(d.time).slice(11) + ' local'),
        tile('Humidity', num0(d.relative_humidity_2m) + ' %', isNum(d.wet_bulb_temperature_2m) ? 'wet-bulb ' + num0(d.wet_bulb_temperature_2m) + ' °F' : ''), tile('Wind', num1(d.wind_speed_10m) + ' mph', '10 m height')]));
      kids.push(el('p', { class: 'ii-note', text: 'Operational context only: one moment in time is never used for the suitability score.' }));
    }
    return section('Current weather', kids, tag('live', 'live'));
  }

  function climateSection(m) {
    var h = m.history, kids = [];
    if (h.status === 'loading') kids.push(loading('Fetching multi-year climate history… (about 3 seconds)'));
    else if (h.status === 'error') kids.push(el('div', { class: 'ii-err', text: 'Climate history unavailable and no stored data could be used: ' + h.error }));
    else {
      var s = h.summary, yrs = s.years, a = s.annual, mt = s.monthly.tempC, lo = mt.indexOf(Math.min.apply(null, mt)), hi = mt.indexOf(Math.max.apply(null, mt));
      if (h.meta.source === 'fallback') kids.push(el('div', { class: 'ii-warn', text: 'Live history could not be used (' + h.meta.reason + '). Showing the nearest precomputed grid cell, ' + Math.round(h.meta.km) + ' km away: a regional estimate, not this exact spot.' }));
      var tiles = [
        tile('Annual mean temperature', degF(a.meanC), (a.meanC).toFixed(1) + ' °C'),
        tile('Seasonal swing', MONTHS[lo] + ' ' + degF(mt[lo]) + ' → ' + MONTHS[hi] + ' ' + degF(mt[hi]), 'monthly means'),
        tile('Relative humidity', s.rhMean === null ? 'n/a' : num0(s.rhMean) + ' %', 'annual mean'),
        tile('Wet-bulb temperature', s.wetBulbC ? degF(s.wetBulbC.mean) : 'n/a', s.wetBulbC ? '99th percentile ' + degF(s.wetBulbC.p99) + (s.wetBulbC.computedShare > 0.01 ? ' (partly computed)' : '') : ''),
        tile('Extreme heat days', num1(a.heatDays95F) + ' / yr', 'highs ≥ 95 °F; ≥ 100 °F: ' + num1(a.heatDays100F) + ' / yr'),
        tile('Cooling degree days', num0(a.cddF) + ' / yr', 'base 65 °F'),
        tile('Wind', s.windMph ? num1(s.windMph.mean) + ' mph' : 'n/a', s.windMph ? '95th percentile ' + num1(s.windMph.p95) + ' mph' : ''),
        tile('Year-to-year variability', a.interannualStdC === null ? 'needs ≥ 3 years' : '± ' + (a.interannualStdC * 1.8).toFixed(1) + ' °F', 'std. dev. of the annual mean (' + yrs.length + ' yrs)')];
      kids.push(el('div', { class: 'ii-tiles' }, tiles));
      var min = Math.min.apply(null, mt), max = Math.max.apply(null, mt);
      kids.push(el('div', { class: 'ii-bars', role: 'img', 'aria-label': 'Monthly mean temperature, January to December: ' + mt.map(function (t, i) { return MONTHS[i] + ' ' + degF(t); }).join(', ') },
        mt.map(function (t) { return el('span', { style: 'height:' + Math.max(6, 100 * (t - min) / (max - min || 1)) + '%', title: degF(t) }); })));
      kids.push(el('div', { class: 'ii-bars-l', 'aria-hidden': 'true' }, MONTHS.map(function (n) { return el('span', { text: n[0] }); })));
      var rows = s.perYear.map(function (p) { return el('tr', {}, [el('td', { text: String(p.year) }), el('td', { class: 'num', text: degF(p.meanC) }), el('td', { class: 'num', text: num0(p.cddF) }), el('td', { class: 'num', text: String(p.heatDays95F) })]); });
      kids.push(el('details', { class: 'ii-note' }, [el('summary', { text: 'Year by year' }), el('div', { class: 'ii-tablewrap' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Year', 'Mean', 'CDD', 'Days ≥ 95 °F'].map(function (t) { return el('th', { text: t }); }))]), el('tbody', {}, rows)])])]));
      var src = h.meta.source === 'live' ? 'live from Open-Meteo' : h.meta.source === 'cache' ? 'stored from an earlier request' : 'precomputed grid cell';
      kids.push(el('p', { class: 'ii-note', text: 'ERA5 reanalysis (about 25 km), hourly, ' + yrs[0] + '–' + yrs[yrs.length - 1] + ', ' + src + '. Modelled estimate, not station data. ' + yrs.length + ' years is short for climate work.' }));
    }
    return section('Climate history', kids, tag('modeled', 'modelled'));
  }

  function coolingSection(m) {
    var ev = m.evaluated, kids = [];
    if (!ev) kids.push(m.history.status === 'loading' ? loading('Waiting for climate history…') : el('p', { class: 'ii-muted', text: 'Needs climate data.' }));
    else if (ev.error) kids.push(el('div', { class: 'ii-err', text: ev.error }));
    else {
      var c = ev.cooling, e = c.economizerHours, sc = ev.scenario;
      kids.push(el('div', { class: 'ii-tiles' }, [
        tile('Annual PUE', c.annualPue.toFixed(3), 'baseline ' + sc.baselinePue.toFixed(2) + ' on a mild day'),
        tile('Cooling energy', gwh(c.coolingEnergyMWh), (c.coolingToItRatio * 100).toFixed(0) + '% of IT energy'),
        tile('Facility energy', gwh(c.facilityEnergyMWh), sc.itMW + ' MW IT · ' + num0(sc.hoursPerYear) + ' h'),
        tile('Electricity cost / year', ev.cost ? money(ev.cost.annualUsd) : 'not assessed', ev.cost ? 'at ' + cents(ev.price.centsPerKwh) + ' (' + ev.price.source + ')' : 'no price for this location'),
        tile(sc.horizonYears + '-year electricity cost', ev.cost ? money(ev.cost.horizonUsd) : 'not assessed', ev.cost ? (ev.cost.escalationPct ? ev.cost.escalationPct + '%/yr price change; ' : '') + 'undiscounted, not a return' : ''),
        tile('Free-cooling hours', num0(e.full) + ' h', num0(e.partial) + ' partial · ' + num0(e.mechanical) + ' mechanical')]));
      kids.push(el('p', { class: 'ii-note', text: c.inputs.systemLabel + (sc.offsetC ? ', climate +' + sc.offsetC + ' °C' : '') + '. Estimate from an illustrative model that has not been validated against real facilities.' }));
    }
    return section('Cooling & electricity estimate', kids, tag('modeled', 'estimate'));
  }

  var RATING_CLASS = { 'Very High': 'r-vh', 'Relatively High': 'r-rh', 'Relatively Moderate': 'r-rm', 'Relatively Low': 'r-rl', 'Very Low': 'r-vl' };
  function riskSection(m, handlers) {
    var hz = m.hazard, kids = [], s = m.history.status === 'ok' ? m.history.summary : null;
    if (hz.status === 'loading') kids.push(loading('Looking up FEMA county risk…'));
    else if (hz.status === 'error') kids.push(el('div', { class: 'ii-err' }, [el('span', { text: 'Not assessed: ' + hz.error + '. ' }), el('button', { type: 'button', class: 'ii-link', text: 'Try again' })]));
    else if (!hz.data) kids.push(el('p', { class: 'ii-muted', text: 'Not assessed: FEMA has no county data for this point.' }));
    else {
      var d = hz.data, pr = m.hazardPercentile;
      kids.push(el('div', { class: 'ii-tiles' }, [
        tile('County', d.county + ', ' + d.state, 'FEMA NRI ' + d.nriVersion),
        tile('Expected annual building loss', (d.ealRate * 100).toFixed(2) + '%', 'of building value per year'),
        tile('Loss rate vs US counties', isNum(pr) ? 'higher than ' + pr.toFixed(0) + '% of counties' : 'n/a', isNum(pr) ? 'percentile ' + pr.toFixed(0) + ' (higher = more expected loss); used in the score' : ''),
        tile('FEMA composite rating', d.compositeRating || 'n/a', 'reflects property exposure; not scored')]));
      kids.push(el('div', { class: 'ii-hz' }, Object.keys(d.hazards).filter(function (k) { return d.hazards[k] && d.hazards[k] !== 'Not Applicable'; })
        .map(function (k) { return el('span', { class: RATING_CLASS[d.hazards[k]] || '', text: k + ': ' + d.hazards[k] }); })));
    }
    if (s) kids.push(el('div', { class: 'ii-tiles', style: 'margin-top:8px' }, [tile('Extreme heat exposure', num1(s.annual.heatDays95F) + ' days / yr', 'at or above 95 °F (modelled history)'), tile('Hottest humid hour', s.wetBulbC ? degF(s.wetBulbC.p99) : 'n/a', 'wet-bulb, 99th percentile')]));
    var badge = tag('measured', 'measured'), box = section('Environmental risk', kids, badge);
    var btn = box.querySelector('button.ii-link'); if (btn) btn.addEventListener('click', handlers.onRetryHazard);
    return box;
  }

  function scoreSection(m) {
    var ev = m.evaluated, kids = [];
    if (!ev) return section('Investment suitability', [m.history.status === 'loading' ? loading('Waiting for climate history…') : el('p', { class: 'ii-muted', text: 'Needs climate data.' })]);
    var o = ev.scoring.overall;
    if (o.score === null) kids.push(el('div', { class: 'ii-warn', text: o.label + '. ' + o.note }));
    else {
      var r = 40, circ = 2 * Math.PI * r;
      var ring = el('div', { class: 'ii-ring', role: 'img', 'aria-label': 'Suitability score ' + o.score.toFixed(0) + ' out of 100' }, [
        (function () { var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100');
          [['bg', 0], ['fg', 1]].forEach(function (p) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('class', p[0]); c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', r); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 9);
            if (p[1]) { c.setAttribute('stroke', scoreColor(o.score)); c.setAttribute('stroke-dasharray', circ); c.setAttribute('stroke-dashoffset', circ * (1 - o.score / 100)); } svg.appendChild(c); });
          return svg; })(), el('b', { text: o.score.toFixed(0) })]);
      kids.push(el('div', { class: 'ii-score' }, [ring, el('div', {}, [el('strong', { text: o.label }), el('p', { class: 'ii-note', text: o.note + ' Weight assessed: ' + Math.round(o.coverage * 100) + '%.' })])]));
    }
    ev.scoring.factors.forEach(function (f) {
      var na = f.status !== 'assessed', val = na ? 'Not assessed' : fmtFactor(f);
      kids.push(el('div', { class: 'ii-frow' + (na ? ' na' : '') }, [el('span', { class: 'l', text: f.label }), el('span', { class: 'v', text: val }),
        na ? null : el('div', { class: 'ii-fbar' }, [el('i', { style: 'width:' + f.score.toFixed(0) + '%;background:' + scoreColor(f.score) })]),
        el('span', { class: 'd', text: na ? 'Left out and not assumed: ' + (f.id === 'electricity' ? 'no price for this location.' : f.id === 'environment' ? 'no FEMA data yet.' : 'no data.') : 'score ' + f.score.toFixed(0) + ' · weight used ' + Math.round(f.effectiveWeight * 100) + '% · ' + f.direction })]));
    });
    ev.scoring.notScored.forEach(function (n) { kids.push(el('div', { class: 'ii-frow na' }, [el('span', { class: 'l', text: n.label }), el('span', { class: 'v', text: 'Not assessed' }), el('span', { class: 'd', text: n.reason })])); });
    kids.push(el('p', { class: 'ii-note', text: 'A screening score from illustrative weights. It is not a financial return forecast.' }));
    return section('Investment suitability', kids, tag('modeled', 'modelled'));
  }
  function fmtFactor(f) {
    var v = f.value;
    if (f.id === 'climate') return v.toFixed(3) + ' kWh/kWh';
    if (f.id === 'electricity') return v.toFixed(2) + ' ¢/kWh';
    if (f.id === 'grid') return Math.round(v) + ' min/yr';
    if (f.id === 'environment') return 'percentile ' + v.toFixed(0);
    return Math.round(v) + ' nearby';
  }

  function sensitivitySection(m) {
    if (!m.sensitivity) return null;
    var rows = m.sensitivity.rows.map(function (r) {
      var cls = function (x, inv) { return x === null ? '' : (x > 0) !== !!inv ? 'bad' : 'good'; };
      return el('tr', {}, [el('td', { text: r.group + ': ' + r.label }), el('td', { class: 'num ' + cls(r.deltaCostUsd), text: r.deltaCostUsd === null ? 'n/a' : (r.deltaCostUsd > 0 ? '+' : '') + money(r.deltaCostUsd) + ' (' + (r.deltaCostPct > 0 ? '+' : '') + r.deltaCostPct.toFixed(1) + '%)' }),
        el('td', { class: 'num ' + cls(r.deltaScore, true), text: r.deltaScore === null ? 'n/a' : (r.deltaScore > 0 ? '+' : '') + r.deltaScore.toFixed(1) })]);
    });
    return el('div', { class: 'ii-sec' }, [el('details', {}, [el('summary', { text: 'Sensitivity analysis: what changes the result most' }),
      el('div', { class: 'ii-tablewrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Change', 'Annual cost', 'Score'].map(function (t) { return el('th', { text: t }); }))]), el('tbody', {}, rows)])]),
      el('p', { class: 'ii-note', text: 'One change at a time, compared with the current scenario at this location.' })])]);
  }

  function renderLocation(rootEl, m, handlers) {
    clear(rootEl);
    var head = el('div', { class: 'ii-lochead' }, [el('div', {}, [el('h2', { text: m.label }), el('p', { class: 'ii-coords', text: coordText(m.lat, m.lon) + (m.stateName ? ' · ' + m.stateName : '') })])]);
    var actions = el('div', { class: 'ii-actions' }, [
      el('button', { type: 'button', class: 'btn btn-primary ii-sm', id: 'ii-add', text: m.inCompare ? 'In comparison ✓' : 'Add to comparison' }),
      el('button', { type: 'button', class: 'btn btn-ghost ii-sm', id: 'ii-clear', text: 'Clear' })]);
    if (m.inCompare) actions.firstChild.disabled = true;
    actions.firstChild.addEventListener('click', handlers.onAdd); actions.lastChild.addEventListener('click', handlers.onClear);
    [head, actions, currentSection(m), climateSection(m), coolingSection(m), riskSection(m, handlers), scoreSection(m), sensitivitySection(m)].forEach(function (n) { if (n) rootEl.appendChild(n); });
  }

  // ------------------------------------------------------------------ comparison
  function renderComparison(rootEl, entries, deltas, handlers) {
    clear(rootEl);
    if (!entries.length) { rootEl.appendChild(el('p', { class: 'ii-muted', style: 'padding:14px', text: 'No locations added yet.' })); return; }
    var rowDefs = [
      ['State', function (e) { return e.stateName || 'n/a'; }],
      ['Coordinates', function (e) { return coordText(e.lat, e.lon); }],
      ['Mean temperature', function (e) { return e.summary ? degF(e.summary.annual.meanC) : 'n/a'; }],
      ['Days ≥ 95 °F per year', function (e) { return e.summary ? num1(e.summary.annual.heatDays95F) : 'n/a'; }],
      ['Cooling degree days', function (e) { return e.summary ? num0(e.summary.annual.cddF) : 'n/a'; }],
      ['Wet-bulb, 99th percentile', function (e) { return e.summary && e.summary.wetBulbC ? degF(e.summary.wetBulbC.p99) : 'n/a'; }],
      ['Electricity price', function (e) { return e.result.price.centsPerKwh === null ? 'not assessed' : cents(e.result.price.centsPerKwh); }],
      ['Annual PUE (modelled)', function (e) { return e.result.cooling ? e.result.cooling.annualPue.toFixed(3) : 'n/a'; }],
      ['Cooling energy / year', function (e) { return e.result.cooling ? gwh(e.result.cooling.coolingEnergyMWh) : 'n/a'; }],
      ['Annual electricity cost', function (e) { return e.result.cost ? money(e.result.cost.annualUsd) : 'not assessed'; }, 'cost'],
      ['Cost vs first location', function (e, i) { var d = deltas[i]; return i === 0 ? '—' : d.annualCostUsd === null ? 'n/a' : (d.annualCostUsd > 0 ? '+' : '') + money(d.annualCostUsd) + ' (' + (d.annualCostPct > 0 ? '+' : '') + d.annualCostPct.toFixed(1) + '%)'; }, 'delta'],
      ['Suitability score', function (e) { var o = e.result.scoring.overall; return o.score === null ? 'not enough data' : o.score.toFixed(1) + ' (' + o.kind + ')'; }, 'score'],
      ['Score vs first location', function (e, i) { var d = deltas[i]; return i === 0 ? '—' : d.score === null ? 'n/a' : (d.score > 0 ? '+' : '') + d.score.toFixed(1); }, 'sdelta']];
    var thead = el('thead', {}, [el('tr', {}, [el('th', { text: '' })].concat(entries.map(function (e, i) {
      var b = el('button', { type: 'button', class: 'ii-x', 'aria-label': 'Remove ' + e.label + ' from the comparison', text: '✕' }); b.addEventListener('click', function () { handlers.onRemove(i); });
      return el('th', {}, [e.label + ' ', b]); })))]);
    var tbody = el('tbody', {}, rowDefs.map(function (r) {
      return el('tr', {}, [el('td', { text: r[0] })].concat(entries.map(function (e, i) {
        var cls = 'num'; if (r[2] === 'delta' && i > 0 && deltas[i].annualCostUsd !== null) cls += deltas[i].annualCostUsd > 0 ? ' bad' : ' good'; if (r[2] === 'sdelta' && i > 0 && deltas[i].score !== null) cls += deltas[i].score < 0 ? ' bad' : ' good';
        return el('td', { class: cls, text: r[1](e, i) }); })));
    }));
    rootEl.appendChild(el('table', {}, [thead, tbody]));
  }

  // ------------------------------------------------------------------ ranking
  function renderRanking(rootEl, ranked, names, handlers) {
    clear(rootEl);
    var head = el('thead', {}, [el('tr', {}, ['#', 'State', 'Score', 'Range across cells', 'Annual cost', 'PUE', 'Cells'].map(function (t) { return el('th', { text: t }); }))]);
    var body = el('tbody', {}, ranked.map(function (s, i) {
      var b = el('button', { type: 'button', class: 'ii-link', text: names[s.state] || s.state }); b.addEventListener('click', function () { handlers.onPick(s.state); });
      return el('tr', {}, [el('td', { class: 'num', text: String(i + 1) }), el('td', {}, [b]), el('td', { class: 'num', text: s.meanScore.toFixed(1) }), el('td', { class: 'num', text: s.minScore.toFixed(0) + ' to ' + s.maxScore.toFixed(0) }),
        el('td', { class: 'num', text: money(s.meanAnnualCostUsd) }), el('td', { class: 'num', text: s.meanPue === null ? 'n/a' : s.meanPue.toFixed(2) }), el('td', { class: 'num', text: String(s.cells) })]);
    }));
    rootEl.appendChild(el('table', {}, [head, body]));
  }

  // ------------------------------------------------------------------ advisor answer
  function renderAnswer(rootEl, a) {
    clear(rootEl);
    var kids = [el('h3', { text: a.headline })].concat(a.paragraphs.map(function (p) { return el('p', { text: p }); }));
    if (a.table) kids.push(el('div', { class: 'ii-tablewrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, a.table.columns.map(function (c) { return el('th', { text: c }); }))]),
      el('tbody', {}, a.table.rows.map(function (r) { return el('tr', {}, r.map(function (c, i) { return el('td', { class: i ? 'num' : '', text: c }); })); }))])]));
    kids.push(el('ul', { class: 'ii-ev', 'aria-label': 'Evidence' }, a.evidence.map(function (e) { return el('li', {}, [tag(e.kind === 'modeled' ? 'modeled' : e.kind, e.kind === 'modeled' ? 'modelled' : e.kind), el('span', { text: e.text })]); })));
    kids.push(el('p', { class: 'ii-gaps-h', text: 'Not assessed and missing evidence' }));
    kids.push(el('ul', { class: 'ii-gaps' }, a.gaps.map(function (g) { return el('li', { text: g }); })));
    rootEl.appendChild(el('div', { class: 'ii-card' }, kids));
  }

  // ------------------------------------------------------------------ usage meter
  function renderUsage(rootEl, b) {
    clear(rootEl);
    var meter = function (label, used, allowed) { var p = Math.min(100, 100 * used / allowed); return [el('div', { text: label + ': ' + num0(used) + ' of ' + num0(allowed) + ' call-equivalents' }), el('div', { class: 'ii-meter' + (p > 80 ? ' hot' : ''), role: 'img', 'aria-label': label + ' usage ' + p.toFixed(0) + ' percent' }, [el('i', { style: 'width:' + p + '%' })])]; };
    rootEl.appendChild(el('div', {}, [el('strong', { text: 'Open-Meteo free-tier use (estimate)' })].concat(meter('This hour', b.usedHour, b.allowedHour), meter('Last 24 h', b.usedDay, b.allowedDay),
      [el('div', { text: b.requests + ' requests · ' + b.cacheHits + ' served from storage' + (b.blockedUntil ? ' · paused by the API until ' + new Date(b.blockedUntil).toLocaleTimeString() : '') })])));
  }

  // ------------------------------------------------------------------ methodology
  function renderMethodology(rootEl, d) {
    clear(rootEl);
    var A = Cooling.ASSUMPTIONS, p = function (t) { return el('p', { text: t }); };
    var tbl = function (cols, rows) { return el('div', { class: 'ii-tablewrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c }); }))]), el('tbody', {}, rows.map(function (r) { return el('tr', {}, r.map(function (c) { return el('td', { text: c }); })); }))])]); };
    var kids = [];
    kids.push(el('h3', { text: 'What this page does and does not do' }));
    kids.push(el('ul', {}, [el('li', { text: 'It compares US locations on the factors that could be assessed from public data, using transparent, adjustable assumptions.' }),
      el('li', { text: 'It does not forecast financial returns. No ROI, NPV or payback is calculated, because capital cost, revenue, financing and discount rate are not supplied.' }),
      el('li', { text: 'The existing data-center locations show where facilities have been mapped. They are not evidence that a place suits a new investment, and the dataset does not say which are existing and which are planned.' }),
      el('li', { text: 'Cooling and scoring models are unvalidated until compared with real operating or engineering data. Treat outputs as estimates for exploration.' })]));
    kids.push(el('h3', { text: 'Data sources' }));
    kids.push(el('div', { class: 'ii-cards' }, (d.sources || []).map(function (s) {
      return el('div', { class: 'ii-card' }, [el('h4', { text: s.name }), el('p', { class: 'ii-note', text: 'Used for: ' + s.used_for }),
        el('dl', {}, [['Provider', s.provider], ['Units', s.units], ['Resolution', s.resolution], ['Date', s.dated], ['Licence', s.license]].reduce(function (a, kv) { return a.concat([el('dt', { text: kv[0] }), el('dd', { text: kv[1] })]); }, [])),
        el('p', { class: 'ii-note', text: 'Limitations:' }), el('ul', { class: 'ii-note' }, s.limitations.map(function (l) { return el('li', { text: l }); }))]); })));
    kids.push(el('h3', { text: 'Weather API usage and licensing' }));
    kids.push(p('Weather data comes from Open-Meteo. The free API may be used for non-commercial purposes only (attribution under CC BY 4.0) and allows 600 calls a minute, 5,000 an hour and 10,000 a day. Long date ranges count as several calls; this page assumes max(1, variables/10) × max(1, days/14), about 78 for a three-year history, tracks its own use (shown on the left), caches results for 30 days, and falls back to the precomputed grid when the allowance runs low. Commercial or investor-facing production use requires an Open-Meteo paid plan, and any paid key must be kept on a server, never in browser code.'));
    kids.push(el('h3', { text: 'Cooling model' }));
    kids.push(p('Facility power is IT power × PUE, and everything above IT load is split into electrical losses (' + (A.lossFraction * 100) + '% of IT), auxiliary load (' + (A.auxFraction * 100) + '%) and cooling. Cooling electricity is the heat to remove divided by the cooling plant\'s coefficient of performance, which falls as the outdoor dry-bulb or wet-bulb temperature rises, with free cooling taking over in cold or dry conditions. The user\'s baseline PUE calibrates the cooling term at a reference of ' + A.referenceDbC + ' °C dry-bulb / ' + A.referenceWbC + ' °C wet-bulb, so hotter or colder climates move PUE away from it. Water use, part-load behaviour and humidity control are not modelled. Treating all non-IT overhead as "cooling" would overstate it, which is why losses and auxiliary load are separated.'));
    kids.push(tbl(['Cooling system', 'Driven by', 'COP at reference', 'Free cooling (full → none)', 'Note'], Object.keys(Cooling.SYSTEMS).map(function (id) {
      var s = Cooling.SYSTEMS[id]; return [s.label, s.driver === 'db' ? 'dry-bulb' : 'wet-bulb', s.copRef.toFixed(1) + ' at ' + s.tRef + ' °C, −' + (s.slope * 100).toFixed(1) + '%/°C', s.econFull === null ? 'none' : s.econFull + ' → ' + s.econOff + ' °C', s.note]; })));
    kids.push(el('h3', { text: 'Suitability score' }));
    kids.push(p('Each factor is scaled linearly to 0–100 between a "best" and "worst" anchor, then combined with the weights you set. Factors that cannot be assessed are shown as Not Assessed and their weight is redistributed, with the share of weight actually assessed reported next to every score. The anchors are round numbers chosen for illustration; the weights are examples, not validated investor preferences.'));
    kids.push(tbl(['Factor', 'Default weight', 'Preference', 'Best → worst anchor', 'Data and how it is measured'], Scoring.FACTORS.map(function (f) {
      return [f.label, f.defaultWeight + '%', f.direction, f.anchors.best + ' → ' + f.anchors.worst + ' ' + f.unit, f.source + '. ' + f.how]; })));
    kids.push(el('ul', {}, Scoring.NOT_SCORED.map(function (n) { return el('li', { text: n.label + ': not assessed. ' + n.reason }); })));
    kids.push(el('h3', { text: 'Known limitations' }));
    kids.push(el('ul', {}, ['The climate map uses a coarse grid (about 300 km cells) so it shows regional patterns, not site conditions. Cells with no data are simply not assessed, which does not mean low suitability.',
      'A cell takes its electricity price and grid reliability from the state at its centre, so cells that straddle a state line are approximations.',
      'Electricity price is a state average, not a negotiated large-load tariff; reliability measures outages, not spare capacity or interconnection time.',
      'Three years of history is short; year-to-year variability is based on only three annual means.',
      'The climate assumption is a uniform temperature offset to test sensitivity, not a climate projection.',
      'The advisor recognises a fixed set of question types and no language model is connected.'].map(function (t) { return el('li', { text: t }); })));
    kids.forEach(function (k) { rootEl.appendChild(k); });
  }

  root.PeakPowerPanels = { el: el, clear: clear, scoreColor: scoreColor, ramp: ramp, renderLocation: renderLocation, renderComparison: renderComparison, renderRanking: renderRanking,
                           renderAnswer: renderAnswer, renderUsage: renderUsage, renderMethodology: renderMethodology, coordText: coordText, degF: degF, money: money, F: F };
})(typeof self !== 'undefined' ? self : this);
