/* Investment Intelligence: map, scenario controls and the flow that analyses a clicked location.
   Uses Leaflet (the same library as the Data Center Explorer) and the engines in cooling-model.js, scoring-engine.js and
   scenario-engine.js. Nothing here does numerical modelling; it gathers data, calls the engines and hands results to
   investment-panels.js for display. */
(function () {
  'use strict';
  var P = window.PeakPowerPanels, Climate = window.PeakPowerClimate, Cooling = window.PeakPowerCooling, Scoring = window.PeakPowerScoring, Scn = window.PeakPowerScenario,
      Geo = window.PeakPowerGeo, Weather = window.PeakPowerWeather, Data = window.PeakPowerData, Advisor = window.PeakPowerAdvisor;
  var $ = function (id) { return document.getElementById(id); };
  var el = P.el;
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var US_BOUNDS = [[24.4, -125.0], [49.6, -66.9]];
  var KIND_COLOR = { hyperscale: '#eb6834', colocation: '#2a78d6', telecom_carrier: '#1baf7a', research_or_academic: '#6250d6', financial: '#eda100', government_or_public: '#e87ba4', unclassified: '#8a949a' };
  var KIND_LABEL = { hyperscale: 'Hyperscale', colocation: 'Colocation', telecom_carrier: 'Telecom carrier', research_or_academic: 'Research / academic', financial: 'Financial', government_or_public: 'Government / public', unclassified: 'Unclassified' };

  var weather = Weather.create({ years: 3 });
  var data = Data.create({});
  var S = { mode: 'suit', extent: 'us', metric: 'meanF', dc: false, wx: false, scenario: Scn.defaultScenario(), refs: null, cells: [], nearbyById: {}, selected: null, compared: [], token: 0, cellEval: null };
  var map, cellLayer, dcLayer, dcMarkers, wxLayer, pin, legendEl, legendBody;

  // ------------------------------------------------------------------ small helpers
  var num0 = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var cF = function (c) { return Climate.cToF(c); };
  var stateNames = function () { var m = {}; data.data.states.features.forEach(function (f) { m[f.properties.code] = f.properties.name; }); return m; };
  function setStatus(t) { $('ii-status').textContent = t; }
  function showOverlay(msg, isError) {
    var o = $('ii-overlay'); P.clear(o); o.classList.remove('hidden'); o.classList.toggle('error', !!isError);
    o.appendChild(el('div', { class: 'ii-spinner', 'aria-hidden': 'true', style: isError ? 'display:none' : '' })); o.appendChild(el('p', { text: msg }));
  }
  var hideOverlay = function () { $('ii-overlay').classList.add('hidden'); };
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  // ------------------------------------------------------------------ climate metrics shown on the map
  var WARM = [[255, 247, 188], [254, 196, 79], [244, 109, 67], [165, 0, 38]], COOL = [[222, 235, 247], [107, 174, 214], [8, 81, 156]], TEMP = [[42, 99, 189], [120, 180, 220], [245, 220, 120], [240, 140, 60], [210, 60, 50]];
  var METRICS = {
    meanF: { label: 'Annual mean temperature', unit: '°F', stops: TEMP, get: function (c) { return cF(c.climate.annual.meanC); }, fmt: function (v) { return v.toFixed(0) + ' °F'; } },
    heat95: { label: 'Extreme heat days (high ≥ 95 °F)', unit: 'days/yr', stops: WARM, get: function (c) { return c.climate.annual.heatDays95F; }, fmt: function (v) { return v.toFixed(1) + ' days/yr'; } },
    cdd: { label: 'Cooling degree days (base 65 °F)', unit: '°F·days/yr', stops: WARM, get: function (c) { return c.climate.annual.cddF; }, fmt: function (v) { return num0(v) + ' CDD'; } },
    wb99: { label: 'Wet-bulb temperature, 99th percentile', unit: '°F', stops: WARM, get: function (c) { return c.climate.wetBulbC ? cF(c.climate.wetBulbC.p99) : null; }, fmt: function (v) { return v.toFixed(0) + ' °F'; } },
    rh: { label: 'Mean relative humidity', unit: '%', stops: COOL, get: function (c) { return c.climate.rhMean; }, fmt: function (v) { return v.toFixed(0) + ' %'; } },
    pue: { label: 'Modelled annual PUE (current scenario)', unit: '', stops: WARM, get: function (c) { var r = evalCell(c); return r.cooling ? r.cooling.annualPue : null; }, fmt: function (v) { return v.toFixed(3); } },
    free: { label: 'Free-cooling hours per year (current scenario)', unit: 'h/yr', stops: COOL, get: function (c) { var r = evalCell(c); return r.cooling ? r.cooling.economizerHours.full : null; }, fmt: function (v) { return num0(v) + ' h'; } }
  };
  function evalCell(c) {
    if (!S.cellEval) S.cellEval = {};
    return S.cellEval[c.id] || (S.cellEval[c.id] = Scn.evaluate(Scn.locationFromCell(c, data.data.reference, S.nearbyById[c.id]), S.scenario, S.refs));
  }

  // ------------------------------------------------------------------ map layers
  function initMap() {
    map = L.map('ii-map', { preferCanvas: true, minZoom: 1, zoomSnap: 0.5, worldCopyJump: true }).fitBounds(US_BOUNDS);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    // Cells and facility markers share the map's one canvas (no custom pane): Leaflet only delivers mouse events to the topmost canvas,
    // so a separate pane for the cells would make the markers underneath unclickable. Cells are sent to the back instead.
    cellLayer = L.layerGroup().addTo(map);
    dcLayer = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 55, animate: !REDUCED });
    wxLayer = L.layerGroup();
    var Reset = L.Control.extend({ options: { position: 'topleft' }, onAdd: function () {
      var b = el('button', { type: 'button', class: 'btn ii-sm', style: 'background:#fff;color:#121719;border:2px solid rgba(0,0,0,.2);border-radius:4px;padding:5px 9px;font-size:13px', title: 'Reset the map view', 'aria-label': 'Reset map view', text: '⟲ Reset view' });
      L.DomEvent.disableClickPropagation(b); b.addEventListener('click', fitExtent); return b; } });
    map.addControl(new Reset());
    var Legend = L.Control.extend({ options: { position: 'topright' }, onAdd: function () {
      legendBody = el('div', { class: 'ii-lb' }); legendEl = el('details', { class: 'ii-legend', 'aria-label': 'Map legend' }, [el('summary', { text: 'Legend' }), legendBody]);
      legendEl.open = false; L.DomEvent.disableClickPropagation(legendEl); return legendEl; } });
    map.addControl(new Legend());
    map.on('click', function (e) { analyze(e.latlng.lat, e.latlng.lng); });
  }
  function fitExtent() { map[REDUCED ? 'fitBounds' : 'flyToBounds'](S.extent === 'us' ? US_BOUNDS : [[-55, -170], [72, 175]], REDUCED ? { animate: false } : { duration: 0.8 }); }

  function renderCells() {
    cellLayer.clearLayers();
    S.cellEval = null;
    var cells = S.cells, spacing = data.data.grid ? data.data.grid.meta.spacingDeg : 3;
    if (S.mode === 'existing' || !cells.length) { renderLegend(); return; }
    var vals = [];
    if (S.mode === 'climate') cells.forEach(function (c) { var m = METRICS[S.metric], v = m.get(c); if (v !== null && isFinite(v)) vals.push(v); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    cells.forEach(function (c) {
      var color, tip, score = null;
      if (S.mode === 'climate') {
        var m = METRICS[S.metric], v = m.get(c); if (v === null || !isFinite(v)) return;
        color = P.ramp(m.stops, (v - lo) / ((hi - lo) || 1)); tip = m.label + ': ' + m.fmt(v);
      } else {
        var r = evalCell(c); score = r.scoring.overall.score; if (score === null) return;      // unassessed cells are not drawn, never drawn as "low"
        color = P.scoreColor(score); tip = 'Modelled score ' + score.toFixed(0) + ' (' + r.scoring.overall.kind + ')' + (r.cost ? ' · ' + P.money(r.cost.annualUsd) + '/yr electricity' : '');
      }
      var label = (c.anchor ? 'Interior point, ' : 'Grid cell, ') + Geo.stateName(c.state, data.data.states);
      var layer = c.anchor ? L.circleMarker([c.lat, c.lon], { radius: 11, color: '#fff', weight: 2, dashArray: '3 3', fillColor: color, fillOpacity: 0.85 })
        : L.rectangle([[c.lat - spacing / 2, c.lon - spacing / 2], [c.lat + spacing / 2, c.lon + spacing / 2]], { stroke: true, color: '#ffffff', weight: 1, opacity: 0.6, fillColor: color, fillOpacity: 0.62 });
      layer.bindTooltip(el('div', {}, [el('strong', { text: label }), el('div', { text: tip }), el('div', { class: 'ii-hint', text: 'Modelled value for a coarse cell' })]), { sticky: true }).addTo(cellLayer);
      layer.bringToBack();
    });
    renderLegend(lo, hi);
  }

  function renderLegend(lo, hi) {
    if (!legendBody) return; P.clear(legendBody);
    var rampBar = function (stops) { var css = stops.map(function (s, i) { return 'rgb(' + s.join(',') + ') ' + Math.round(100 * i / (stops.length - 1)) + '%'; }).join(','); return el('div', { class: 'ii-ramp', style: 'background:linear-gradient(90deg,' + css + ')', 'aria-hidden': 'true' }); };
    if (S.mode === 'suit') {
      legendBody.appendChild(el('strong', { text: 'Modelled suitability score' }));
      legendBody.appendChild(rampBar([[229, 72, 77], [245, 184, 61], [29, 184, 122]]));
      legendBody.appendChild(el('div', { class: 'ii-ramp-l' }, [el('span', { text: '0 low' }), el('span', { text: '100 high' })]));
      legendBody.appendChild(el('p', { text: 'Screening score from climate, electricity price, grid reliability, hazard exposure and nearby facilities, using your weights. Modelled, not measured.' }));
      legendBody.appendChild(el('p', { text: 'Areas with no cell are not assessed. They are not low-scoring.' }));
    } else if (S.mode === 'climate') {
      var m = METRICS[S.metric];
      legendBody.appendChild(el('strong', { text: m.label }));
      legendBody.appendChild(rampBar(m.stops));
      legendBody.appendChild(el('div', { class: 'ii-ramp-l' }, [el('span', { text: m.fmt(lo) }), el('span', { text: m.fmt(hi) })]));
      legendBody.appendChild(el('p', { text: 'Modelled (ERA5 reanalysis) at coarse grid cells, scaled from the lowest to the highest cell. Blank areas are not assessed.' }));
    } else {
      legendBody.appendChild(el('strong', { text: 'Facility type' }));
      Object.keys(KIND_COLOR).forEach(function (k) { var sw = el('span', { class: 'ii-sw', 'aria-hidden': 'true' }); sw.style.background = KIND_COLOR[k]; legendBody.appendChild(el('div', { class: 'ii-row' }, [sw, el('span', { text: KIND_LABEL[k] })])); });
      legendBody.appendChild(el('p', { text: 'Mapped data centers. Presence shows where facilities have been mapped, not that a place suits a new investment.' }));
    }
    if (S.dc && S.mode !== 'existing') legendBody.appendChild(el('p', { text: 'Dots/clusters: existing mapped data centers.' }));
  }

  // ---- existing data centers
  function buildDcMarkers() {
    if (dcMarkers) return; dcMarkers = [];
    data.data.facilities.forEach(function (f) {
      var m = L.circleMarker([f.lat, f.lon], { radius: 6, color: '#fff', weight: 1, fillColor: KIND_COLOR[f.kind] || KIND_COLOR.unclassified, fillOpacity: 0.9, bubblingMouseEvents: false });
      m.bindTooltip(function () { return el('span', { text: (f.name || 'Unnamed data center') + (f.city ? ' · ' + f.city : '') + (f.state ? ', ' + f.state : '') }); }, { direction: 'top', offset: [0, -4] });   // an element: Leaflet parses a string as HTML
      m.bindPopup(function () { return facilityPopup(f); }, { maxWidth: 300 });
      m._us = f.iso2 === 'US'; dcMarkers.push(m);
    });
  }
  function facilityPopup(f) {
    var rows = [['Operator', f.operator], ['Type', KIND_LABEL[f.kind]], ['Location', [f.street, f.city, f.state, f.country].filter(Boolean).join(', ')], ['Footprint', f.footprintM2 ? num0(f.footprintM2) + ' m²' : '']].filter(function (r) { return r[1]; });
    var dl = el('dl', { style: 'display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0;font-size:13px' });
    rows.forEach(function (r) { dl.appendChild(el('dt', { style: 'color:var(--ink-2);font-weight:600', text: r[0] })); dl.appendChild(el('dd', { style: 'margin:0', text: r[1] })); });
    var box = el('div', {}, [el('strong', { text: f.name || 'Unnamed data center' }), dl]);
    if (f.iso2 === 'US') { var b = el('button', { type: 'button', class: 'btn btn-primary ii-sm', text: 'Analyze this location' }); b.addEventListener('click', function () { map.closePopup(); analyze(f.lat, f.lon, f.name || undefined); }); box.appendChild(b); }
    return box;
  }
  function renderDc() {
    dcLayer.clearLayers();
    var show = S.mode === 'existing' || S.dc;
    if (!show) { if (map.hasLayer(dcLayer)) map.removeLayer(dcLayer); return; }
    buildDcMarkers();
    dcLayer.addLayers(dcMarkers.filter(function (m) { return S.extent === 'global' ? true : m._us; }));
    if (!map.hasLayer(dcLayer)) map.addLayer(dcLayer);
  }

  // ---- current weather at the busiest hubs
  var hubs = null;
  function findHubs() {
    if (hubs) return hubs;
    var g = {};
    data.data.usFacilities.forEach(function (f) { if (!f.city || !f.state) return; var k = f.state + '|' + f.city, e = g[k] || (g[k] = { city: f.city, state: f.state, n: 0, lat: 0, lon: 0 }); e.n++; e.lat += f.lat; e.lon += f.lon; });
    hubs = Object.keys(g).map(function (k) { var e = g[k]; return { label: e.city + ', ' + e.state, n: e.n, lat: e.lat / e.n, lon: e.lon / e.n }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    return hubs;
  }
  async function renderWx() {
    wxLayer.clearLayers();
    if (!S.wx) { if (map.hasLayer(wxLayer)) map.removeLayer(wxLayer); return; }
    try {
      var hs = findHubs(), res = await weather.getCurrentBatch(hs);
      if (!S.wx) return;
      hs.forEach(function (h, i) {
        var c = res[i].current, icon = L.divIcon({ className: '', iconSize: null, html: el('span', { class: 'ii-wx', text: Math.round(c.temperature_2m) + '°F ' + h.label }) });
        L.marker([h.lat, h.lon], { icon: icon, interactive: false, keyboard: false }).addTo(wxLayer);
      });
      map.addLayer(wxLayer); setStatus('Current conditions shown for the ' + hs.length + ' cities with the most mapped data centers (Open-Meteo, live).');
    } catch (e) { setStatus('Current weather overlay unavailable: ' + e.message); $('ov-wx').checked = false; S.wx = false; }
    usage();
  }

  // ------------------------------------------------------------------ location analysis
  function stale(t) { return t !== S.token; }
  async function analyze(lat, lon, label) {
    if (!data.data) return;
    var token = ++S.token, st = Geo.stateAt(lon, lat, data.data.states), names = stateNames();
    if (!st) { S.selected = null; showMessage('Outside the United States', 'Analysis covers the United States only (' + P.coordText(lat, lon) + '). Existing data centers can still be explored in Global View.'); return; }
    placePin(lat, lon);
    var m = { label: label || (names[st] + ' location'), lat: lat, lon: lon, state: st, stateName: names[st], current: { status: 'loading' }, history: { status: 'loading' }, hazard: { status: 'loading' },
              evaluated: null, sensitivity: null, location: null, inCompare: false };
    S.selected = m; renderSelected();
    setStatus('Analysing ' + m.label + '…');
    var pCurrent = weather.getCurrent(lat, lon).then(function (r) { m.current = { status: 'ok', data: r }; }, function (e) { m.current = { status: 'error', error: e.message }; });
    var pHist = weather.getHistory(lat, lon).then(function (r) { m.history = { status: 'ok', summary: r.summary, meta: { source: r.source } }; }, function (e) {
      var near = data.nearestCell(lat, lon);
      m.history = near ? { status: 'ok', summary: near.cell.climate, meta: { source: 'fallback', km: near.km, reason: e.message } } : { status: 'error', error: e.message };
    });
    var pHaz = data.hazardAt(lat, lon).then(function (r) { m.hazard = r && r.error ? { status: 'error', error: r.error } : { status: 'ok', data: r }; });
    [pCurrent, pHist, pHaz].forEach(function (p) { p.then(function () { if (stale(token)) return; updateSelected(); }); });
    await Promise.all([pCurrent, pHist, pHaz]);
    if (!stale(token)) { setStatus('Analysis of ' + m.label + ' complete. Modelled estimates, not measurements.'); usage(); }
  }
  function updateSelected() {
    var m = S.selected; if (!m) return;
    if (m.history.status === 'ok') {
      var hz = m.hazard.status === 'ok' ? m.hazard.data : (m.hazard.status === 'error' ? { error: m.hazard.error } : null);
      m.location = data.locationFromPoint(m.lat, m.lon, { climate: m.history.summary, hazard: hz, label: m.label });
      m.evaluated = Scn.evaluate(m.location, S.scenario, S.refs);
      m.sensitivity = Scn.sensitivity(m.location, S.scenario, S.refs);
      m.hazardPercentile = Scoring.percentileRank(m.location.ealRate, S.refs.femaQuantiles);
    }
    renderSelected();
  }
  function renderSelected() {
    var m = S.selected, loc = $('ii-loc'), empty = $('ii-empty');
    if (!m) { loc.hidden = true; empty.hidden = false; return; }
    empty.hidden = true; loc.hidden = false;
    m.inCompare = S.compared.some(function (c) { return c.id === 'pt_' + m.lat.toFixed(2) + ',' + m.lon.toFixed(2); });
    P.renderLocation(loc, m, { onAdd: addToCompare, onClear: clearSelected, onRetryHazard: function () { m.hazard = { status: 'loading' }; renderSelected(); data.hazardAt(m.lat, m.lon).then(function (r) { m.hazard = r && r.error ? { status: 'error', error: r.error } : { status: 'ok', data: r }; updateSelected(); }); } });
  }
  function showMessage(title, text) {
    var loc = $('ii-loc'); $('ii-empty').hidden = true; loc.hidden = false; P.clear(loc);
    loc.appendChild(el('h2', { text: title })); loc.appendChild(el('p', { class: 'ii-note', text: text })); setStatus(title);
  }
  function placePin(lat, lon) {
    if (pin) map.removeLayer(pin);
    pin = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: el('div', { class: 'ii-pin' }), iconSize: [18, 18], iconAnchor: [9, 18] }), keyboard: false, interactive: false }).addTo(map);
  }
  function clearSelected() { S.token++; S.selected = null; if (pin) { map.removeLayer(pin); pin = null; } renderSelected(); setStatus(statusText()); }

  // ------------------------------------------------------------------ comparison and ranking
  function addToCompare() {
    var m = S.selected; if (!m || !m.location || !m.evaluated) return;
    if (S.compared.length >= 4) { setStatus('The comparison holds up to four locations. Remove one first.'); return; }
    var id = 'pt_' + m.lat.toFixed(2) + ',' + m.lon.toFixed(2);
    if (S.compared.some(function (c) { return c.id === id; })) return;
    S.compared.push({ id: id, label: m.label, lat: m.lat, lon: m.lon, stateName: m.stateName, location: Object.assign({}, m.location, { id: id }), summary: m.history.summary });
    refreshCompare(); renderSelected();
  }
  function refreshCompare() {
    var root = $('ii-compare');
    if (!S.compared.length) { P.renderComparison(root, [], [], {}); return; }
    var cmp = Scn.compare(S.compared.map(function (c) { return c.location; }), S.scenario, S.refs);
    var entries = S.compared.map(function (c, i) { return { label: c.label, lat: c.lat, lon: c.lon, stateName: c.stateName, summary: c.summary, result: cmp.rows[i] }; });
    P.renderComparison(root, entries, cmp.deltas, { onRemove: function (i) { S.compared.splice(i, 1); refreshCompare(); renderSelected(); } });
  }
  function refreshRanking() {
    var root = $('ii-rank'), note = $('rank-note');
    if (!S.cells.length) { P.clear(root); note.textContent = 'The precomputed climate grid is not available, so no ranking can be shown. Click the map to analyse individual locations.'; return; }
    var sums = Scn.stateSummary(S.cells, S.scenario, S.refs, data.data.reference, S.nearbyById), ranked = Scn.rankByScore(sums), names = stateNames();
    var missing = data.data.states.features.map(function (f) { return f.properties.code; }).filter(function (c) { return !sums.some(function (s) { return s.state === c; }); });
    note.textContent = ranked.length + ' states ranked by the mean modelled score of their grid cells (' + S.cells.length + ' cells, ' + data.data.grid.meta.spacingDeg + '° spacing), under the weights and scenario on the left. ' +
      (missing.length ? 'Not ranked, for lack of a grid cell: ' + missing.map(function (c) { return names[c]; }).join(', ') + '. ' : '') + 'Click a state to zoom to it.';
    P.renderRanking(root, ranked, names, { onPick: function (code) {
      var cs = S.cells.filter(function (c) { return c.state === code; }); if (!cs.length) return;
      if (S.mode === 'existing') setMode('suit');
      map.flyToBounds(L.latLngBounds(cs.map(function (c) { return [c.lat, c.lon]; })).pad(0.6), { maxZoom: 7, duration: REDUCED ? 0 : 0.8 });
      $('ii-map').scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); } });
  }

  // ------------------------------------------------------------------ scenario controls
  function buildControls() {
    var sys = $('sc-sys'); Object.keys(Cooling.SYSTEMS).forEach(function (id) { sys.appendChild(el('option', { value: id, text: Cooling.SYSTEMS[id].label })); }); sys.value = S.scenario.system;
    var w = $('ii-weights'); Scoring.FACTORS.forEach(function (f) {
      var id = 'w-' + f.id, out = el('output', { id: id + '-o', text: String(f.defaultWeight) });
      var inp = el('input', { type: 'range', id: id, min: 0, max: 100, step: 5, value: f.defaultWeight, 'aria-label': f.label + ' weight' });
      w.appendChild(el('div', { class: 'ii-wrow' }, [el('label', { for: id, text: f.label }), out, inp]));
    });
    var chips = $('adv-chips'); Advisor.HELP.forEach(function (q) { var b = el('button', { type: 'button', text: q }); b.addEventListener('click', function () { $('adv-q').value = q; ask(q); }); chips.appendChild(b); });
    var mt = $('ii-metric'); Object.keys(METRICS).forEach(function (k) { mt.appendChild(el('option', { value: k, text: METRICS[k].label })); });
  }
  function readScenario() {
    var s = S.scenario;
    s.itMW = +$('sc-it').value; s.baselinePue = +$('sc-pue').value; s.system = $('sc-sys').value; s.hoursPerYear = +$('sc-hours').value; s.offsetC = +$('sc-clim').value;
    s.horizonYears = Math.max(1, Math.min(30, +$('sc-hor').value || 10)); s.priceEscalationPct = +$('sc-esc').value || 0;
    var own = $('sc-price-own').checked; $('sc-price').disabled = !own; s.priceOverrideCentsPerKwh = own && +$('sc-price').value > 0 ? +$('sc-price').value : null;
    Scoring.FACTORS.forEach(function (f) { s.weights[f.id] = +$('w-' + f.id).value; $('w-' + f.id + '-o').textContent = String(s.weights[f.id]); });
    $('sc-it-o').textContent = s.itMW + ' MW'; $('sc-pue-o').textContent = s.baselinePue.toFixed(2); $('sc-hours-o').textContent = num0(s.hoursPerYear);
    $('sc-sys-note').textContent = Cooling.SYSTEMS[s.system].note;
  }
  var onScenario = debounce(function () {
    readScenario(); renderCells(); updateSelected(); refreshCompare(); refreshRanking(); setStatus(statusText());
  }, 90);
  function resetScenario() {
    S.scenario = Scn.defaultScenario(); var s = S.scenario;
    $('sc-it').value = s.itMW; $('sc-pue').value = s.baselinePue; $('sc-sys').value = s.system; $('sc-hours').value = s.hoursPerYear; $('sc-clim').value = '0'; $('sc-hor').value = s.horizonYears; $('sc-esc').value = 0;
    $('sc-price-auto').checked = true; Scoring.FACTORS.forEach(function (f) { $('w-' + f.id).value = f.defaultWeight; });
    readScenario(); renderCells(); updateSelected(); refreshCompare(); refreshRanking(); setStatus(statusText());
  }

  // ------------------------------------------------------------------ mode, extent, search, advisor
  function statusText() {
    var g = data.data.grid, n = S.cells.length;
    if (S.mode === 'existing') return (S.extent === 'global' ? data.data.facilities.length : data.data.usFacilities.length).toLocaleString('en-US') + ' mapped data centers' + (S.extent === 'global' ? ' worldwide' : ' in the United States') + '. Existing facilities are not evidence of suitability.';
    return n ? (S.mode === 'suit' ? 'Modelled suitability' : METRICS[S.metric].label) + ' · ' + n + ' modelled grid cells (' + g.meta.spacingDeg + '°, ' + g.meta.years[0] + '–' + g.meta.years[g.meta.years.length - 1] + ') · ' + S.scenario.itMW + ' MW' : 'Precomputed grid not available';
  }
  function mapNote() {
    $('ii-mapnote').textContent = S.mode === 'existing' ? 'Showing facilities mapped in OpenStreetMap. The dataset does not say which are existing and which are planned, and a facility being there does not make a site suitable.'
      : 'Colours are modelled values for coarse cells (ERA5 reanalysis, not measurements). Click anywhere in the United States for a detailed, live analysis of that exact point.';
  }
  function setMode(mode) {
    if (mode !== 'existing' && S.extent === 'global') { S.extent = 'us'; syncSeg(); }
    S.mode = mode; syncSeg(); $('metric-wrap').hidden = mode !== 'climate';
    renderCells(); renderDc(); setStatus(statusText()); mapNote();
  }
  function setExtent(ext) {
    S.extent = ext; if (ext === 'global') S.mode = 'existing';
    syncSeg(); $('metric-wrap').hidden = S.mode !== 'climate'; renderCells(); renderDc(); fitExtent(); setStatus(statusText()); mapNote();
  }
  function syncSeg() {
    [['mode-existing', 'existing'], ['mode-climate', 'climate'], ['mode-suit', 'suit']].forEach(function (p) { $(p[0]).setAttribute('aria-pressed', String(S.mode === p[1])); });
    $('ext-us').setAttribute('aria-pressed', String(S.extent === 'us')); $('ext-global').setAttribute('aria-pressed', String(S.extent === 'global'));
  }

  var searchSeq = 0;
  async function doSearch(q) {
    var list = $('ii-results'), seq = ++searchSeq;
    if (q.trim().length < 2) { list.hidden = true; $('ii-search').setAttribute('aria-expanded', 'false'); return; }
    var items;
    try { items = await weather.geocode(q); } catch (e) { items = null; var msg = e.message; }
    if (seq !== searchSeq) return;
    P.clear(list); list.hidden = false; $('ii-search').setAttribute('aria-expanded', 'true');
    if (items === null) list.appendChild(el('li', { class: 'ii-none', text: 'Search unavailable: ' + msg }));
    else if (!items.length) list.appendChild(el('li', { class: 'ii-none', text: 'No US place found.' }));
    else items.forEach(function (it) {
      var b = el('button', { type: 'button', role: 'option', text: it.label }); b.addEventListener('click', function () { pick(it); });
      list.appendChild(el('li', { role: 'presentation' }, [b]));
    });
  }
  function pick(it) { $('ii-results').hidden = true; $('ii-search').value = it.label; $('ii-search').setAttribute('aria-expanded', 'false'); if (S.extent === 'global') { S.extent = 'us'; if (S.mode === 'existing') S.mode = 'suit'; syncSeg(); renderCells(); renderDc(); }
    map.flyTo([it.lat, it.lon], 8, { duration: REDUCED ? 0 : 1 }); analyze(it.lat, it.lon, it.label); }

  function advisorCtx() {
    var g = data.data.grid, sel = S.selected;
    return { scenario: S.scenario, refs: S.refs, reference: data.data.reference, states: data.data.states, cells: S.cells, nearbyById: S.nearbyById, gridMeta: g && g.meta,
             nriVersion: (data.data.reference.fema.nriVersion || [])[0], selected: sel && sel.evaluated, selectedLocation: sel && sel.location };
  }
  function ask(q) { P.renderAnswer($('adv-answer'), Advisor.answer(q, advisorCtx())); }

  function usage() { P.renderUsage($('ii-usage'), weather.budget()); }

  // ------------------------------------------------------------------ start-up
  async function start() {
    showOverlay('Loading data…');
    try { await data.load(); } catch (e) { showOverlay('Could not load the data (' + e.message + '). ' + (location.protocol === 'file:' ? 'Serve the folder with "python -m http.server" and open it at http://localhost:8000/investment-intelligence.html.' : 'Check your connection and reload.'), true); setStatus('Data could not be loaded.'); return; }
    var d = data.data;
    S.refs = { femaQuantiles: d.reference.fema.quantiles };
    S.cells = d.grid ? d.grid.cells : [];
    S.cells.forEach(function (c) { S.nearbyById[c.id] = Geo.countWithin(d.usFacilities, c.lat, c.lon, Data.NEARBY_KM); });
    initMap(); buildControls(); readScenario();
    if (!S.cells.length) S.mode = 'existing';
    $('mode-suit').disabled = $('mode-climate').disabled = !S.cells.length;
    syncSeg(); $('metric-wrap').hidden = S.mode !== 'climate';
    renderCells(); renderDc(); refreshCompare(); refreshRanking(); mapNote();
    P.renderMethodology($('ii-method'), { sources: d.sources });
    $('ii-metric').value = S.metric;
    bind(); usage(); setInterval(usage, 30000);
    setStatus(statusText()); hideOverlay();
  }
  function bind() {
    ['sc-it', 'sc-pue', 'sc-sys', 'sc-hours', 'sc-clim', 'sc-hor', 'sc-esc', 'sc-price', 'sc-price-auto', 'sc-price-own'].forEach(function (id) { $(id).addEventListener('input', onScenario); $(id).addEventListener('change', onScenario); });
    Scoring.FACTORS.forEach(function (f) { $('w-' + f.id).addEventListener('input', onScenario); });
    $('sc-reset').addEventListener('click', resetScenario);
    $('mode-existing').addEventListener('click', function () { setMode('existing'); }); $('mode-climate').addEventListener('click', function () { setMode('climate'); }); $('mode-suit').addEventListener('click', function () { setMode('suit'); });
    $('ext-us').addEventListener('click', function () { setExtent('us'); }); $('ext-global').addEventListener('click', function () { setExtent('global'); });
    $('ii-metric').addEventListener('change', function (e) { S.metric = e.target.value; renderCells(); setStatus(statusText()); });
    $('ov-dc').addEventListener('change', function (e) { S.dc = e.target.checked; renderDc(); renderLegend(); renderCells(); });
    $('ov-wx').addEventListener('change', function (e) { S.wx = e.target.checked; renderWx(); });
    $('ii-center').addEventListener('click', function () { var c = map.getCenter(); analyze(c.lat, c.lng); });
    var run = debounce(function (q) { doSearch(q); }, 300);
    $('ii-search').addEventListener('input', function (e) { run(e.target.value); });
    $('ii-search').addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('ii-results').hidden = true; } if (e.key === 'Enter') { var b = $('ii-results').querySelector('button'); if (b) { e.preventDefault(); b.click(); } } });
    document.addEventListener('click', function (e) { if (!e.target.closest('.ii-search')) $('ii-results').hidden = true; });
    $('adv-form').addEventListener('submit', function (e) { e.preventDefault(); ask($('adv-q').value); });
  }

  if (typeof L === 'undefined' || !window.PeakPowerPanels) { showOverlay('The map library could not be loaded. Check your internet connection and reload the page.', true); setStatus('Map library unavailable.'); }
  else start();
})();
