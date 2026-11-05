/* Site brief for the Data Center Climate Explorer: two map overlays (US power plants, county grades) and a panel that answers an investor's
   questions for any selected point: what grade does the Prototype give this county, what does a late grid connection do to a 75 MW plan,
   what generation is nearby, and how hard is the climate to cool.

   Data is loaded only when needed (first US selection or overlay): js/data/site-grades.js, data/processed/county-outlines.json and
   data/processed/eia860-plants.json. All text is inserted with textContent, never innerHTML. Logic lives in js/site-brief.js (unit-tested). */
(function () {
  'use strict';
  var SB = window.SiteBrief, W = window.ClimateWeather;
  var ctx = null, map, L, el, clear, num;
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Fuel colours follow the Prototype's source colours (gas, wind, solar, battery) so the two pages read the same.
  var FUEL = ['#eb6834', '#4a5560', '#6250d6', '#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#8a949a'];
  var GRADE_HEX = ['#0a8250', '#c98500', '#c0392b', '#9aa7ad', '#0a5c0a'];   // Good, Moderate, Bad, Not graded, Excellent
  var GRADE_WORD = ['Good', 'Moderate', 'Bad', 'Not graded', 'Excellent'];
  var CLIMATE_WORD = ['Mild', 'Moderate', 'Demanding'];
  var RADIUS_MI = 50;
  var COUNTY_LAYERS = [['overall', 'Overall'], ['pwr', 'Time to power'], ['pol', 'Policy'], ['water', 'Water'], ['haz', 'Natural hazard'], ['fib', 'Fiber'], ['loc', 'Location']];

  // ------------------------------------------------------------------ small formatting helpers
  function mwText(mw) { return mw >= 1000 ? (mw / 1000).toFixed(mw >= 10000 ? 0 : 1) + ' GW' : num(Math.round(mw)) + ' MW'; }
  function usd(v) { var a = Math.abs(v), s = v < 0 ? '−' : v > 0 ? '+' : ''; return s + '$' + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : num(Math.round(a))); }
  function signed(v, d, unit) { var r = Math.round(v * Math.pow(10, d)) / Math.pow(10, d); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(d) + (unit || ''); }
  function pill(cls, text) { return el('span', { class: 'gp ' + cls, text: text }); }
  function gradePill(d) { return pill(SB.GRADE_CLASS[d], GRADE_WORD[d]); }
  function climatePill(g) { return pill(['g', 'm', 'b'][g], CLIMATE_WORD[g]); }
  function section(title, kids, cls) { return el('section', { class: 'bsec ' + (cls || '') }, [el('h3', { text: title })].concat(kids)); }
  function note(text) { return el('p', { class: 'bnote', text: text }); }

  // ------------------------------------------------------------------ lazy data
  var data = { G: null, index: null, plants: null }, loading = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function getJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url); return r.json(); }); }
  function loadUS() {
    if (data.G && data.index && data.plants) return Promise.resolve(data);
    if (loading) return loading;
    loading = Promise.all([
      window.PEAKPOWER_SITE_GRADES ? 0 : loadScript('js/data/site-grades.js'),
      getJson('data/processed/county-outlines.json'), getJson('data/processed/eia860-plants.json')
    ]).then(function (r) {
      data.G = window.PEAKPOWER_SITE_GRADES; data.index = SB.decodeOutlines(r[1]); data.plants = r[2];
      if (!data.G) throw new Error('site grades are missing');
      return data;
    }).catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function inUsBox(lat, lon) { return lat > 17.5 && lat < 72 && lon > -180 && lon < -64; }

  // ------------------------------------------------------------------ overlays: power plants
  var plantLayer = null, plantMarkers = null, plantsOn = false;
  function plantMinMw() { var z = map.getZoom(); return z < 5 ? 300 : z < 6.5 ? 100 : z < 8 ? 30 : 0; }
  function plantPopup(p) {
    var rows = [], dl = el('dl');
    SB.GROUPS.forEach(function (g, i) { if (p[4][i]) rows.push([g + ' (operating)', mwText(p[4][i])]); });
    SB.GROUPS.forEach(function (g, i) { if (p[5][i]) rows.push([g + ' (planned)', mwText(p[5][i])]); });
    rows.forEach(function (r) { dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', { text: r[1] })); });
    return el('div', { class: 'pop' }, [el('h3', { text: p[3] || 'Power plant under 50 MW' }), el('p', { class: 'pop-en', text: p[2] + ' · EIA-860 nameplate capacity' }), dl]);
  }
  function buildPlantMarkers() {
    plantMarkers = data.plants.plants.map(function (p) {
      var op = p[4].reduce(function (a, b) { return a + b; }, 0), planned = op === 0, arr = planned ? p[5] : p[4];
      var k = 0; for (var i = 1; i < 8; i++) if (arr[i] > arr[k]) k = i;
      var mw = planned ? arr.reduce(function (a, b) { return a + b; }, 0) : op;
      var m = L.circleMarker([p[0], p[1]], { radius: Math.min(13, 2.5 + 1.5 * Math.sqrt(mw / 100)), color: FUEL[k], weight: planned ? 1.5 : 1, fillColor: FUEL[k], fillOpacity: planned ? 0.05 : 0.7, opacity: 0.9, bubblingMouseEvents: false });
      m.bindPopup(function () { return plantPopup(p); }, { maxWidth: 300 });
      m._mw = mw;
      return m;
    });
  }
  function refreshPlants() {
    if (!plantsOn || !plantMarkers) return;
    var min = plantMinMw();
    if (!plantLayer) plantLayer = L.layerGroup();
    plantLayer.clearLayers();
    plantMarkers.forEach(function (m) { if (m._mw >= min) plantLayer.addLayer(m); });
    if (!map.hasLayer(plantLayer)) map.addLayer(plantLayer);
    sendBack();
  }
  // markers and counties share one canvas, drawn in layer order: keep the data centers on top, then plants, then counties
  function sendBack() {
    if (plantLayer && plantsOn) plantLayer.eachLayer(function (l) { l.bringToBack(); });
    if (countyLayer && countiesOn) countyLayer.eachLayer(function (l) { l.bringToBack(); });
  }
  function setPlants(on) {
    plantsOn = on;
    if (!on) { if (plantLayer && map.hasLayer(plantLayer)) map.removeLayer(plantLayer); ctx.legend(); return; }
    status('Loading US power plants…');
    loadUS().then(function () { if (!plantMarkers) buildPlantMarkers(); refreshPlants(); status(''); ctx.legend(); })
      .catch(function (e) { plantsOn = false; sync(); status('Power plants could not be loaded: ' + e.message); });
  }

  // ------------------------------------------------------------------ overlays: county grades
  var countyLayer = null, countiesOn = false, countyKey = 'overall';
  function countyDigit(f) {
    var g = SB.parseGrades(data.G.g[f]);
    return countyKey === 'overall' ? g.overall : g[countyKey];
  }
  function countyStyle(f) {
    var d = countyDigit(f);
    return { stroke: true, color: '#ffffff', weight: 0.4, opacity: 0.5, fill: true, fillColor: GRADE_HEX[d], fillOpacity: d === 3 ? 0.3 : 0.5 };
  }
  function buildCounties() {
    countyLayer = L.featureGroup();
    data.index.forEach(function (c) {
      var rings = c.rings.map(function (pts) { var r = []; for (var i = 0; i < pts.length; i += 2) r.push([pts[i + 1], pts[i]]); return r; });
      var poly = L.polygon(rings, Object.assign({ bubblingMouseEvents: false }, countyStyle(c.f)));
      poly._fips = c.f;
      poly.bindTooltip(function () {
        var k = data.G.k[c.f], st = data.G.states[c.f.slice(0, 2)];
        return el('span', { text: k[0] + ' County, ' + st.a + ' · ' + (countyKey === 'overall' ? 'Overall ' : COUNTY_LAYERS.filter(function (x) { return x[0] === countyKey; })[0][1] + ' ') + GRADE_WORD[countyDigit(c.f)].toLowerCase() });
      }, { sticky: true });
      poly.on('click', function (e) { select({ lat: e.latlng.lat, lon: e.latlng.wrap().lng, title: 'Selected location', fips: c.f }); });
      countyLayer.addLayer(poly);
    });
  }
  function recolorCounties() { if (countyLayer) countyLayer.eachLayer(function (l) { l.setStyle(countyStyle(l._fips)); }); }
  function setCounties(on) {
    countiesOn = on;
    $('ov-layer-wrap').hidden = !on;
    if (!on) { if (countyLayer && map.hasLayer(countyLayer)) map.removeLayer(countyLayer); ctx.legend(); return; }
    status('Loading county grades…');
    loadUS().then(function () {
      if (!countyLayer) buildCounties(); else recolorCounties();
      map.addLayer(countyLayer); sendBack(); status(''); ctx.legend();
    }).catch(function (e) { countiesOn = false; sync(); $('ov-layer-wrap').hidden = true; status('County grades could not be loaded: ' + e.message); });
  }

  // ------------------------------------------------------------------ legend contributions
  function legendNodes() {
    var out = [];
    if (countiesOn) {
      out.push(el('strong', { class: 'lg-h', text: 'County grade · ' + COUNTY_LAYERS.filter(function (x) { return x[0] === countyKey; })[0][1] }));
      [4, 0, 1, 2, 3].forEach(function (d) {
        if (d === 4 && countyKey !== 'overall') return;
        var sw = el('span', { class: 'swatch sq', 'aria-hidden': 'true' }); sw.style.background = GRADE_HEX[d];
        out.push(el('div', { class: 'legend-row' }, [sw, el('span', { text: GRADE_WORD[d] }), el('span')]));
      });
    }
    if (plantsOn) {
      out.push(el('strong', { class: 'lg-h', text: 'Power plants (EIA-860)' }));
      SB.GROUPS.forEach(function (g, i) {
        var sw = el('span', { class: 'swatch', 'aria-hidden': 'true' }); sw.style.background = FUEL[i];
        out.push(el('div', { class: 'legend-row' }, [sw, el('span', { text: g }), el('span')]));
      });
      out.push(el('p', { class: 'legend-note', text: 'Circle size is nameplate MW. Hollow rings are planned plants only. Small plants appear as you zoom in.' }));
    }
    return out;
  }

  // ------------------------------------------------------------------ the brief
  var $ = function (id) { return document.getElementById(id); };
  var sel = 0, pin = null, current = null;
  function status(t) { var s = $('ov-status'); if (s) s.textContent = t; }

  // keep the selected point visible: the drawer layout covers the right 392 px of the map
  function keepVisible() {
    if (!current) return;
    var size = map.getSize(), drawer = getComputedStyle($('brief')).position === 'absolute', vis = size.x - (drawer ? 392 : 0);
    var pt = map.latLngToContainerPoint([current.lat, current.lon]), m = 70;
    var dx = pt.x > vis - m ? pt.x - vis / 2 : pt.x < m ? pt.x - vis / 2 : 0, dy = pt.y < m || pt.y > size.y - m ? pt.y - size.y / 2 : 0;
    if (dx || dy) map.panBy([dx, dy], { animate: !REDUCED });
  }
  function openBrief() {
    var stage = $('map-stage'), was = stage.classList.contains('has-brief');
    $('brief').hidden = false; stage.classList.add('has-brief');
    $('brief-hint').hidden = true;
    $('brief-body').scrollTop = 0; $('brief').scrollTop = 0;
    setTimeout(function () {
      if (!was) map.invalidateSize({ pan: false });
      keepVisible();
      if (!was && window.matchMedia && window.matchMedia('(max-width: 1100px)').matches) $('brief').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    }, 30);
  }
  function closeBrief() {
    $('brief').hidden = true; $('map-stage').classList.remove('has-brief'); sel++;
    if (pin) { map.removeLayer(pin); pin = null; }
    setTimeout(function () { map.invalidateSize({ pan: false }); }, 30);
  }

  function select(site) {
    current = site; var my = ++sel;
    if (pin) map.removeLayer(pin);
    pin = L.marker([site.lat, site.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'sel-pin', html: '<span></span>', iconSize: [22, 30], iconAnchor: [11, 30] }) }).addTo(map);
    var body = $('brief-body'); clear(body);
    $('brief-title').textContent = site.title;
    $('brief-sub').textContent = site.subtitle || '';
    $('brief-coords').textContent = site.lat.toFixed(4) + ', ' + site.lon.toFixed(4);
    openBrief();

    var usLike = inUsBox(site.lat, site.lon);
    var slots = { verdict: el('div', { class: 'verdict' }), plan: el('div'), grid: el('div'), climate: el('div'), factors: el('div'), wx: el('div') };
    ['verdict', 'plan', 'grid', 'climate', 'factors', 'wx'].forEach(function (k) { body.appendChild(slots[k]); });
    var climateChip = el('div', { class: 'chip-out' }, [el('span', { class: 'gp n', text: 'Loading…' })]);

    // current weather stays one click away; it is fetched only when opened
    var wxd = el('details', { class: 'bsec wxd' }, [el('summary', { text: 'Current weather' })]);
    var wxLoaded = false;
    wxd.addEventListener('toggle', function () { if (wxd.open && !wxLoaded) { wxLoaded = true; wxd.appendChild(ctx.weatherNode(site.lat, site.lon)); } });
    slots.wx.appendChild(wxd);

    renderClimate(slots.climate, climateChip, site, my);

    if (!usLike) {
      slots.verdict.appendChild(chipRow([['Cooling climate', climateChip]]));
      slots.plan.appendChild(note('County grades, the plan impact and nearby power plants cover the United States only. The cooling climate works anywhere.'));
      return;
    }
    slots.verdict.appendChild(note('Loading US site data…'));
    loadUS().then(function () {
      if (my !== sel) return;
      var cty = site.fips ? { f: site.fips, near: false } : SB.findCounty(data.index, site.lat, site.lon);
      renderUS(slots, site, cty, climateChip);
    }).catch(function (e) {
      if (my !== sel) return;
      clear(slots.verdict); slots.verdict.appendChild(chipRow([['Cooling climate', climateChip]]));
      var retry = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Try again' });
      retry.addEventListener('click', function () { select(site); });
      slots.plan.appendChild(el('div', { class: 'bmsg err' }, [el('p', { text: 'US site data could not be loaded (' + e.message + ').' }), retry]));
    });
  }

  function chipRow(items) {
    return el('div', { class: 'chips' }, items.map(function (it) { return el('div', { class: 'chip-c' }, [el('span', { class: 'chip-k', text: it[0] }), it[1]]); }));
  }

  function renderUS(slots, site, cty, climateChip) {
    var G = data.G;
    clear(slots.verdict);
    var near = SB.nearbyPlants(data.plants.plants, site.lat, site.lon, RADIUS_MI);
    if (!cty) {
      slots.verdict.appendChild(chipRow([['Cooling climate', climateChip]]));
      slots.plan.appendChild(note('This point is not inside a county in the contiguous US map (offshore, or Alaska, Hawaii or a territory), so there is no county grade. Nearby power plants and the cooling climate are still shown.'));
      renderGrid(slots.grid, near, null);
      return;
    }
    var F = SB.factorFacts(G, cty.f), g = F.grades;
    $('brief-sub').textContent = (site.subtitle ? site.subtitle + ' · ' : '') + F.county + ' County, ' + F.state.a + ' · ' + F.region + (cty.near ? ' (near a county line)' : '');
    slots.verdict.appendChild(el('div', { class: 'overall' }, [el('span', { class: 'chip-k', text: 'Overall site grade' }), gradePill(g.overall),
      el('span', { class: 'ov-note', text: 'The Prototype’s Find a site grade for this county' })]));
    slots.verdict.appendChild(chipRow([['Time to power', gradePill(g.pwr)], ['Natural hazard', gradePill(g.haz)], ['Policy', gradePill(g.pol)], ['Cooling climate', climateChip]]));
    if (cty.near) slots.verdict.appendChild(note('County outlines are generalised (about 5 km). This point is within a few km of a county line, so check the neighbouring county too.'));

    // what a late grid connection does to the 75 MW plan
    var sc = SB.delayScenario(G, g.pwr), fmt = function (v, d) { return v.toFixed(d); };
    var planKids = [];
    if (!sc) {
      planKids.push(note('Time to power is not graded for this county, so no grid-delay case is shown.'));
    } else if (sc.months === 0) {
      planKids.push(el('p', { class: 'plan-lead', text: 'Time to power is Good here, so the Prototype’s on-time plan applies: initial service in month ' + sc.base.open + ', about $' + fmt(sc.base.perMWh, 1) + '/MWh and ' + Math.round(sc.base.kg) + ' kg CO₂/MWh, ' + Math.round(sc.base.clean * 100) + '% clean.' }));
    } else {
      planKids.push(el('p', { class: 'plan-lead', text: 'Time to power is ' + GRADE_WORD[g.pwr] + ' here. If the grid connection arrives about ' + sc.months + ' months late, the Prototype’s model gives:' }));
      var rows = [['Initial service', 'month ' + sc.base.open, 'month ' + sc.scenario.open, '+' + sc.dOpen + ' months'],
        ['Power cost per MWh', '$' + fmt(sc.base.perMWh, 2), '$' + fmt(sc.scenario.perMWh, 2), signed(sc.dPerMWh, 2, '')],
        ['Carbon intensity', Math.round(sc.base.kg) + ' kg/MWh', Math.round(sc.scenario.kg) + ' kg/MWh', signed(sc.dKg, 0, ' kg/MWh')],
        ['10-year profit*', usd(sc.base.profit).replace('+', ''), usd(sc.scenario.profit).replace('+', ''), usd(sc.dProfit)]];
      var tb = el('tbody'); rows.forEach(function (r) { tb.appendChild(el('tr', {}, [el('th', { scope: 'row', text: r[0] }), el('td', { text: r[1] }), el('td', { text: r[2] }), el('td', { class: 'delta', text: r[3] })])); });
      planKids.push(el('div', { class: 'tblwrap' }, [el('table', { class: 'btbl' }, [el('thead', {}, [el('tr', {}, [el('th'), el('th', { text: 'On time' }), el('th', { text: 'Late grid' }), el('th', { text: 'Change' })])]), tb])]));
      planKids.push(note('The late grid mostly costs time and revenue, not power price: the plan leans on onsite gas and contracted wind and solar for longer. *Profit is a business assumption, kept apart from power cost.'));
    }
    planKids.push(note('Screening assumption: Good = on time, Moderate = 6 months late, Bad = 12 months late. Figures come from the Prototype’s own engine for the ERCOT (Texas) packet case. They show how much timing matters, not this county’s electricity price or grid emissions, which are not modelled outside Texas.'));
    clear(slots.plan); slots.plan.appendChild(section('What this means for a 75 MW plan', planKids, 'plan'));

    renderGrid(slots.grid, near, F);

    // every factor with its reason
    var list = el('div', { class: 'flist' });
    SB.FACTORS.forEach(function (f) {
      list.appendChild(el('div', { class: 'frow' }, [el('span', { class: 'fname', text: f[1] }), gradePill(g[f[0]]), el('span', { class: 'ffact', text: F.facts[f[0]] })]));
    });
    var how = el('details', { class: 'how' }, [el('summary', { text: 'How each factor is graded' })]);
    var ll = el('dl'); SB.FACTORS.forEach(function (f) { var d = G.layers[f[0]]; if (d) { ll.appendChild(el('dt', { text: f[1] })); ll.appendChild(el('dd', { text: d })); } });
    how.appendChild(el('p', { class: 'bnote', text: G.layers.all })); how.appendChild(ll);
    var pol = el('details', { class: 'how' }, [el('summary', { text: 'Policy detail for ' + F.state.n }), el('p', { class: 'bnote', text: F.state.t })]);
    clear(slots.factors);
    slots.factors.appendChild(section('Site factors', [list, how, pol, note('Screening grades from public data, shown exactly as in the Prototype’s Find a site. They are not licensed county data or a site assessment.')]));
  }

  function renderGrid(slot, near, F) {
    clear(slot);
    var opT = near.op.reduce(function (a, b) { return a + b; }, 0), plT = near.pl.reduce(function (a, b) { return a + b; }, 0);
    var share = SB.zeroCarbonShare(near.op);
    var kids = [];
    if (!near.n) { kids.push(note('No power plants of 1 MW or more are listed within ' + RADIUS_MI + ' miles in the EIA-860 survey.')); slot.appendChild(section('Power around here', kids)); return; }
    kids.push(el('div', { class: 'tiles' }, [
      tile(mwText(opT - near.op[6]), 'generating capacity within ' + RADIUS_MI + ' mi'),
      tile(share == null ? '–' : Math.round(share * 100) + '%', 'zero-carbon share of that capacity'),
      tile(mwText(plT), 'planned or under construction')]));
    // operating mix as one stacked bar with a 2px gap between segments, direct labels for the big ones and a full legend
    var gen = opT - near.op[6];
    if (gen > 0) {
      var bar = el('div', { class: 'stack', role: 'img', 'aria-label': 'Operating capacity by fuel: ' + SB.GROUPS.map(function (g, i) { return i === 6 || !near.op[i] ? '' : g + ' ' + Math.round(100 * near.op[i] / gen) + '%'; }).filter(Boolean).join(', ') });
      var leg = el('ul', { class: 'lg' });
      SB.GROUPS.forEach(function (g, i) {
        if (i === 6 || !near.op[i]) return;
        var seg = el('i'); seg.style.flexGrow = String(near.op[i]); seg.style.background = FUEL[i]; seg.title = g + ': ' + mwText(near.op[i]); bar.appendChild(seg);
        var sw = el('span', { class: 'swatch', 'aria-hidden': 'true' }); sw.style.background = FUEL[i];
        leg.appendChild(el('li', {}, [sw, el('span', { text: g }), el('b', { text: mwText(near.op[i]) })]));
      });
      kids.push(bar, leg);
      if (near.op[6]) kids.push(note('Plus ' + mwText(near.op[6]) + ' of battery storage, not counted as generation.'));
    }
    if (plT > 0) {
      var pp = SB.GROUPS.map(function (g, i) { return near.pl[i] ? g + ' ' + mwText(near.pl[i]) : ''; }).filter(Boolean).join(' · ');
      kids.push(el('p', { class: 'bnote' }, [el('b', { text: 'In the pipeline: ' }), document.createTextNode(pp + '. Some of it may never be built.')]));
    }
    if (near.top.length) {
      var ol = el('ol', { class: 'plants' });
      near.top.forEach(function (t) { ol.appendChild(el('li', {}, [el('span', { class: 'pn', text: t.name + ', ' + t.state }), el('span', { class: 'pm', text: mwText(t.mw) + ' · ' + t.group.toLowerCase() + ' · ' + Math.round(t.miles) + ' mi' })])); });
      kids.push(el('h4', { text: 'Largest plants nearby' }), ol);
    }
    kids.push(note('EIA-860 nameplate capacity, 2024 survey. This is supply, not headroom: it ignores outages, fuel limits, load and transmission, and a wind or solar MW produces far fewer MWh than a gas or nuclear MW. Read the zero-carbon share as a hint about the local grid’s carbon context, not its emissions.'));
    slot.appendChild(section('Power around here', kids));
  }
  function tile(v, k) { return el('div', { class: 'tile' }, [el('span', { class: 'tile-v', text: v }), el('span', { class: 'tile-k', text: k })]); }

  // ------------------------------------------------------------------ cooling climate
  function renderClimate(slot, chip, site, my) {
    var head = [el('p', { class: 'bmsg', text: 'Loading three years of hourly weather…' })];
    slot.appendChild(section('Cooling climate', head));
    if (!W || !W.getClimateHistory) { clear(slot); slot.appendChild(section('Cooling climate', [note('Climate history is unavailable: the weather module did not load.')])); setChip(chip, null); return; }
    W.getClimateHistory(site.lat, site.lon).then(function (c) {
      if (my !== sel) return;
      setChip(chip, c.grade);
      clear(slot);
      var lim = W.CLIMATE_LIMITS;
      var lead = c.grade === 1 ? 'Held back by ' + c.why.join('; ') + '.' : c.grade === 2 ? 'Demanding because ' + c.why.join('; ') + '.' : c.why[0].charAt(0).toUpperCase() + c.why[0].slice(1) + '.';
      var kids = [el('p', { class: 'clim-lead' }, [climatePill(c.grade), document.createTextNode(' ' + lead)])];
      kids.push(el('div', { class: 'tiles t5' }, [
        tile(num(Math.round(c.cdd)), 'cooling degree days a year (base ' + lim.coolBelowF + ' °F)'),
        tile(Math.round(c.p95) + ' °F', '95th-percentile temperature'),
        tile(num(Math.round(c.hotHours)), 'hours a year at ' + lim.hotF + ' °F or more'),
        tile(num(Math.round(c.humidHours)), 'humid hours a year (wet-bulb ≥ ' + lim.humidWbF + ' °F)'),
        tile(Math.round(c.free * 100) + '%', 'of hours below ' + lim.coolBelowF + ' °F (outside air is enough)')]));
      kids.push(bandBar(c, lim), monthChart(c));
      kids.push(note('Hours are per year, averaged over ' + c.period + ' (ERA5 reanalysis via Open-Meteo, about 10 km grid). Wet-bulb is calculated from temperature and humidity (Stull 2011). This describes the climate, not a cooling design. Grade rule: Mild needs at least ' + Math.round(W.CLIMATE_RULES.mild.freeMin * 100) + '% of hours below ' + lim.coolBelowF + ' °F with at most ' + W.CLIMATE_RULES.mild.humidMax + ' humid and ' + W.CLIMATE_RULES.mild.hotMax + ' hot hours; Demanding is under ' + Math.round(W.CLIMATE_RULES.demanding.freeBelow * 100) + '% free cooling, over ' + num(W.CLIMATE_RULES.demanding.humidAbove) + ' humid hours or over ' + num(W.CLIMATE_RULES.demanding.hotAbove) + ' hot hours. A team screening assumption. Weather data by Open-Meteo.com.'));
      slot.appendChild(section('Cooling climate', kids));
    }).catch(function (err) {
      if (my !== sel) return;
      setChip(chip, null);
      clear(slot);
      var retry = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Try again' });
      retry.addEventListener('click', function () { clear(slot); renderClimate(slot, chip, site, sel); });
      slot.appendChild(section('Cooling climate', [el('div', { class: 'bmsg err' }, [el('p', { text: 'Climate history unavailable: ' + (err && err.message ? err.message : 'unknown error') }), retry])]));
    });
  }
  function setChip(chip, g) { clear(chip); chip.appendChild(g == null ? pill('n', 'Unavailable') : climatePill(g)); }

  // hours of the year by cooling need: one stacked bar, light to dark blue for more mechanical cooling
  function bandBar(c, lim) {
    var parts = [['Outside air is enough', '< ' + lim.coolBelowF + ' °F', c.bands.cool, 'b1'], ['Some mechanical cooling', lim.coolBelowF + '–' + lim.bandHotF + ' °F', c.bands.mid, 'b2'], ['Heavy mechanical cooling', '≥ ' + lim.bandHotF + ' °F', c.bands.hot, 'b3']];
    var bar = el('div', { class: 'stack tall', role: 'img', 'aria-label': 'Hours of the year by cooling need: ' + parts.map(function (p) { return p[0] + ' ' + Math.round(p[2] * 100) + '%'; }).join(', ') });
    var leg = el('ul', { class: 'lg' });
    parts.forEach(function (p) {
      if (p[2] > 0) { var seg = el('i', { class: p[3], title: p[0] + ': ' + Math.round(p[2] * 100) + '%' }); seg.style.flexGrow = String(p[2]); bar.appendChild(seg); }
      leg.appendChild(el('li', {}, [el('span', { class: 'swatch sq ' + p[3], 'aria-hidden': 'true' }), el('span', { text: p[0] + ' (' + p[1] + ')' }), el('b', { text: Math.round(p[2] * 100) + '%' })]));
    });
    return el('div', {}, [el('h4', { text: 'Hours of the year by cooling need' }), bar, leg]);
  }

  // cooling degree days by month: single hue, rounded tops, baseline anchored, a value on hover and in the accessible label
  function monthChart(c) {
    var NS = 'http://www.w3.org/2000/svg', Wd = 300, H = 92, base = 70, mx = Math.max.apply(null, c.monthCdd), bw = 16, gap = (Wd - 12 * bw) / 13;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + Wd + ' ' + H); svg.setAttribute('class', 'mchart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Cooling degree days by month: ' + c.monthCdd.map(function (v, i) { return W.MONTHS[i] + ' ' + Math.round(v); }).join(', '));
    var axis = document.createElementNS(NS, 'line'); axis.setAttribute('x1', 0); axis.setAttribute('x2', Wd); axis.setAttribute('y1', base); axis.setAttribute('y2', base); axis.setAttribute('class', 'axis'); svg.appendChild(axis);
    c.monthCdd.forEach(function (v, i) {
      var h = mx > 0 ? Math.max(v > 0 ? 2 : 0, (base - 8) * v / mx) : 0, x = gap + i * (bw + gap);
      var r = document.createElementNS(NS, 'path');
      var rr = Math.min(4, h);
      r.setAttribute('d', h ? 'M' + x + ',' + base + 'V' + (base - h + rr) + 'Q' + x + ',' + (base - h) + ' ' + (x + rr) + ',' + (base - h) + 'H' + (x + bw - rr) + 'Q' + (x + bw) + ',' + (base - h) + ' ' + (x + bw) + ',' + (base - h + rr) + 'V' + base + 'Z' : '');
      r.setAttribute('class', 'bar');
      var t = document.createElementNS(NS, 'title'); t.textContent = W.MONTHS[i] + ': ' + Math.round(v) + ' cooling degree days'; r.appendChild(t);
      svg.appendChild(r);
      var lb = document.createElementNS(NS, 'text'); lb.setAttribute('x', x + bw / 2); lb.setAttribute('y', base + 14); lb.setAttribute('text-anchor', 'middle'); lb.setAttribute('class', 'mlab'); lb.textContent = W.MONTHS[i].charAt(0); svg.appendChild(lb);
    });
    var peak = c.monthCdd.indexOf(mx), pl = document.createElementNS(NS, 'text');
    pl.setAttribute('x', Math.min(Wd - 4, Math.max(4, gap + peak * (bw + gap) + bw / 2))); pl.setAttribute('y', 9); pl.setAttribute('text-anchor', peak > 8 ? 'end' : peak < 3 ? 'start' : 'middle'); pl.setAttribute('class', 'mval');
    pl.textContent = mx > 0 ? 'Peak ' + W.MONTHS[peak] + ': ' + num(Math.round(mx)) + ' degree days' : 'No cooling degree days'; svg.appendChild(pl);
    return el('div', {}, [el('h4', { text: 'Cooling degree days by month' }), svg]);
  }

  // ------------------------------------------------------------------ wiring
  function sync() {
    $('ov-plants').setAttribute('aria-pressed', String(plantsOn));
    $('ov-counties').setAttribute('aria-pressed', String(countiesOn));
  }
  function init(c) {
    ctx = c; map = c.map; L = c.L; el = c.el; clear = c.clear; num = c.num;
    $('ov-plants').addEventListener('click', function () { setPlants(!plantsOn); sync(); });
    $('ov-counties').addEventListener('click', function () { setCounties(!countiesOn); sync(); });
    var s = $('ov-layer');
    COUNTY_LAYERS.forEach(function (l) { s.appendChild(el('option', { value: l[0], text: l[1] })); });
    s.addEventListener('change', function () { countyKey = s.value; if (countyLayer) recolorCounties(); ctx.legend(); });
    $('brief-close').addEventListener('click', closeBrief);
    map.on('zoomend', refreshPlants);
    sync();
  }

  window.ExplorerSite = { init: init, select: select, close: closeBrief, legendNodes: legendNodes };
})();
