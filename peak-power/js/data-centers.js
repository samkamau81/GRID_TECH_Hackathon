/* Data Center Climate Explorer.
   Loads data/processed/data-centers.geojson (made by scripts/process_data_centers.py) and shows it on a Leaflet map
   with filters, summary statistics and three layers: clusters, individual markers and a density heatmap.
   Current weather (js/climate-weather.js, Open-Meteo) is fetched only when a data center, a map point or a searched place is selected.
   All dataset text is inserted with textContent, never innerHTML. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ configuration
  var DATA_URL = 'data/processed/data-centers.geojson';
  var US_BOUNDS = [[24.4, -125.0], [49.6, -66.9]]; // contiguous United States; Alaska and Hawaii via the state filter
  var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Facility types as classified in the dataset (field "kind"), in legend order.
  var KINDS = [
    ['hyperscale', 'Hyperscale', '#eb6834'],
    ['colocation', 'Colocation', '#2a78d6'],
    ['telecom_carrier', 'Telecom carrier', '#1baf7a'],
    ['research_or_academic', 'Research / academic', '#6250d6'],
    ['financial', 'Financial', '#eda100'],
    ['government_or_public', 'Government / public', '#e87ba4'],
    ['unclassified', 'Unclassified', '#8a949a']
  ];
  var KIND_BY_KEY = {};
  KINDS.forEach(function (k) { KIND_BY_KEY[k[0]] = { label: k[1], color: k[2] }; });

  var STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    PR: 'Puerto Rico'
  };
  var NO_COUNTRY = '__none';

  // ------------------------------------------------------------------ small helpers
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('en-US');
  var num = function (n) { return nf.format(n); };

  function el(tag, props, kids) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') node.textContent = props[k];
      else if (k === 'class') node.className = props[k];
      else node.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function plain(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function countryName(p) { return p.iso2 === 'US' ? 'United States' : (p.country || 'Not specified'); }
  function stateName(code) { return STATE_NAMES[code] || code; }
  function areaText(m2) { return m2 >= 1e6 ? (m2 / 1e6).toFixed(1) + 'M m²' : num(Math.round(m2)) + ' m²'; }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : null; }

  // ------------------------------------------------------------------ state
  var records = [];      // { p: properties, lat, lon, search, marker }
  var meta = {};
  var filtered = [];
  var st = { view: 'global', mode: 'clusters', region: '', country: '', state: '', city: '', q: '', kinds: {} };
  KINDS.forEach(function (k) { st.kinds[k[0]] = true; });

  var map, cluster, plainGroup, heat, legendBox, legendBody, legendControl;
  // markercluster adds thousands of markers in chunks; removing the group mid-way throws, so layer changes wait for it to finish.
  var clusterBusy = false, busySince = 0, pendingRender = false;

  // ------------------------------------------------------------------ filtering
  // `skip` names a filter to ignore, so each selector can list the options that are valid under the *other* filters.
  function matches(r, skip) {
    var p = r.p;
    if (skip !== 'region' && st.region && p.region !== st.region) return false;
    if (skip !== 'country' && st.country) {
      if (st.country === NO_COUNTRY ? p.iso2 : p.iso2 !== st.country) return false;
    }
    if (skip !== 'state' && st.state && p.state !== st.state) return false;
    if (skip !== 'city' && st.city && p.city !== st.city) return false;
    if (skip !== 'kinds' && !st.kinds[p.kind]) return false;
    if (skip !== 'q' && st.q && r.search.indexOf(st.q) === -1) return false;
    return true;
  }
  function count(by, skip) {
    var m = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!matches(r, skip)) continue;
      var k = by(r.p);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return m;
  }
  function sortedEntries(m, byLabel) {
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(byLabel
      ? function (a, b) { return byLabel(a[0]).localeCompare(byLabel(b[0])); }
      : function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
  }

  // ------------------------------------------------------------------ selectors
  function fillSelect(sel, firstLabel, entries, label, current) {
    clear(sel);
    sel.appendChild(el('option', { value: '', text: firstLabel }));
    entries.forEach(function (e) {
      sel.appendChild(el('option', { value: e[0], text: label(e[0]) + ' (' + num(e[1]) + ')' }));
    });
    var valid = !current || entries.some(function (e) { return e[0] === current; });
    sel.value = valid ? current : '';
    return sel.value;
  }

  function renderControls() {
    var usOnly = st.view === 'us';
    // Region -> country -> state -> city: each list reflects the filters above it, and a value that no longer fits is cleared.
    st.region = fillSelect($('f-region'), 'All regions', sortedEntries(count(function (p) { return p.region; }, 'region'), String), String, st.region);

    var cc = count(function (p) { return p.iso2 || NO_COUNTRY; }, 'country');
    var countryLabel = function (k) { return k === NO_COUNTRY ? 'Not specified' : countryNameFor(k); };
    st.country = fillSelect($('f-country'), 'All countries', sortedEntries(cc, countryLabel), countryLabel, st.country);
    $('f-country').disabled = usOnly;

    var stateOk = usOnly || st.country === 'US';
    var states = stateOk ? count(function (p) { return p.iso2 === 'US' ? p.state : ''; }, 'state') : {};
    st.state = fillSelect($('f-state'), 'All states', sortedEntries(states, stateName), function (c) { return stateName(c); }, stateOk ? st.state : '');
    $('f-state').disabled = !stateOk;
    $('state-hint').textContent = stateOk ? '' : 'Choose United States as the country, or switch to United States View.';

    var cityOk = usOnly || !!st.country;
    var cities = cityOk ? count(function (p) { return p.city; }, 'city') : {};
    st.city = fillSelect($('f-city'), 'All cities', sortedEntries(cities, String), String, cityOk ? st.city : '');
    $('f-city').disabled = !cityOk;
    $('city-hint').textContent = cityOk ? 'Only data centers with a recorded city are listed.' : 'Choose a country first.';

    var kc = count(function (p) { return p.kind; }, 'kinds');
    KINDS.forEach(function (k) {
      var box = $('kind-' + k[0]);
      if (box) { box.checked = !!st.kinds[k[0]]; $('kindn-' + k[0]).textContent = num(kc[k[0]] || 0); }
    });
  }
  var countryNames = {};
  function countryNameFor(iso) { return countryNames[iso] || iso; }

  function buildKindControls() {
    var box = $('kinds');
    KINDS.forEach(function (k) {
      var id = 'kind-' + k[0];
      var input = el('input', { type: 'checkbox', id: id });
      input.checked = true;
      input.addEventListener('change', function () { st.kinds[k[0]] = input.checked; refresh(true); });
      var sw = el('span', { class: 'swatch', 'aria-hidden': 'true' });
      sw.style.background = k[2];
      box.appendChild(el('label', { class: 'kind', for: id }, [input, sw, el('span', { class: 'kind-l', text: k[1] }), el('span', { class: 'kind-n', id: 'kindn-' + k[0], text: '0' })]));
    });
  }

  // ------------------------------------------------------------------ statistics
  function renderStats() {
    var us = 0, countries = {}, states = {}, area = 0, withArea = 0, noCountry = 0;
    filtered.forEach(function (r) {
      var p = r.p;
      if (p.iso2) countries[p.iso2] = 1; else noCountry++;
      if (p.iso2 === 'US') { us++; if (p.state) states[p.state] = 1; }
      if (p.footprintM2) { area += p.footprintM2; withArea++; }
    });
    var S = meta.stats || {};
    var cards = [
      ['Data centers', num(filtered.length), 'of ' + num(S.total) + ' in the dataset'],
      ['US data centers', num(us), 'of ' + num(S.us) + ' in the dataset'],
      ['Countries', num(Object.keys(countries).length), 'of ' + num(S.countries) + (noCountry ? ' · plus ' + noCountry + ' with no country recorded' : '')],
      ['US states', num(Object.keys(states).length), 'of ' + num(S.usStates) + ' (' + num(S.usStatesTaggedOnly) + ' from source tags)'],
      ['Mapped footprint', withArea ? areaText(area) : '–', 'Building area, not power capacity. ' + num(withArea) + ' of ' + num(filtered.length) + ' have one recorded']
    ];
    var box = $('stats');
    clear(box);
    cards.forEach(function (c) {
      box.appendChild(el('div', { class: 'stat' }, [el('span', { class: 'stat-k', text: c[0] }), el('span', { class: 'stat-v', text: c[1] }), el('span', { class: 'stat-s', text: c[2] })]));
    });

    var cc = {}, sc = {};
    filtered.forEach(function (r) {
      if (r.p.iso2) cc[r.p.iso2] = (cc[r.p.iso2] || 0) + 1;
      if (r.p.iso2 === 'US' && r.p.state) sc[r.p.state] = (sc[r.p.state] || 0) + 1;
    });
    if (st.view === 'us') {   // one country in view, so list the busiest cities instead (only records with a city)
      var ct = {};
      filtered.forEach(function (r) { if (r.p.city) ct[r.p.city] = (ct[r.p.city] || 0) + 1; });
      $('tc-h').textContent = 'Top five US cities';
      renderBars($('top-countries'), sortedEntries(ct).slice(0, 5), String, function (city) { st.city = city; refresh(true); });
    } else {
      $('tc-h').textContent = 'Top five countries';
      renderBars($('top-countries'), sortedEntries(cc).slice(0, 5), countryNameFor, function (iso) {
        st.country = iso; syncToggles(); refresh(true);
      });
    }
    renderBars($('top-states'), sortedEntries(sc).slice(0, 5), stateName, function (code) {
      if (st.view !== 'us') st.country = 'US';
      st.state = code; st.city = ''; refresh(true);
    });
    renderCoverage();
  }

  function renderBars(list, entries, label, onPick) {
    clear(list);
    if (!entries.length) { list.appendChild(el('li', { class: 'bars-empty', text: 'No data centers match the current filters.' })); return; }
    var max = entries[0][1];
    entries.forEach(function (e) {
      var fill = el('i'); fill.style.width = Math.max(3, 100 * e[1] / max) + '%';
      var btn = el('button', { type: 'button', class: 'bar-row', title: 'Filter the map to ' + label(e[0]) }, [
        el('span', { class: 'bar-l', text: label(e[0]) }), el('span', { class: 'bar-t', 'aria-hidden': 'true' }, [fill]), el('span', { class: 'bar-v', text: num(e[1]) })]);
      btn.addEventListener('click', function () { onPick(e[0]); });
      list.appendChild(el('li', {}, [btn]));
    });
  }

  // Independent tracker totals, shown for context when one country is in view.
  function renderCoverage() {
    var box = $('coverage'), iso = st.view === 'us' ? 'US' : st.country, rep = (meta.reportedTotals || {})[iso];
    if (!iso || iso === NO_COUNTRY || !rep) { box.hidden = true; return; }
    var mapped = records.filter(function (r) { return r.p.iso2 === iso; }).length;
    box.textContent = rep.tracker + ' (published by ' + rep.publishedBy + ') reports ' + num(rep.facilities) + ' data centers in ' + countryNameFor(iso) +
      ' as of ' + rep.asOf + '. This dataset contains ' + num(mapped) + ' facilities mapped in OpenStreetMap, so the map shows a subset of the real total.';
    box.hidden = false;
  }

  // ------------------------------------------------------------------ map
  function initMap() {
    map = L.map('map', { preferCanvas: true, worldCopyJump: true, minZoom: 1, zoomSnap: 0.5, zoomControl: true }).setView([30, 10], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    cluster = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 55, animate: !REDUCED_MOTION,
      chunkProgress: function (done, total) { if (done >= total) { clusterBusy = false; if (pendingRender) { pendingRender = false; renderLayers(); } } } });
    heat = L.heatLayer([], { radius: 14, blur: 16, maxZoom: 5, max: 3, minOpacity: 0.3,
      gradient: { 0.25: '#2a78d6', 0.5: '#1baf7a', 0.75: '#eda100', 1: '#eb6834' } });

    var ResetControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var b = el('button', { type: 'button', class: 'map-btn', title: 'Reset the map view', 'aria-label': 'Reset map view', text: '⟲ Reset view' });
        L.DomEvent.disableClickPropagation(b);
        b.addEventListener('click', function () { fit(true); });
        return b;
      }
    });
    map.addControl(new ResetControl());
    // Clicking empty map shows the weather there. Markers do not bubble clicks, so this never fires for a data center.
    map.on('click', function (e) { showPlaceWeather(e.latlng.wrap(), 'Selected location'); });

    // Top-right keeps the legend off the busiest areas; it collapses so it never has to hide the data.
    legendControl = L.control({ position: 'topright' });
    legendControl.onAdd = function () {
      legendBody = el('div', { class: 'legend-body' });
      legendBox = el('details', { class: 'legend', 'aria-label': 'Map legend' }, [el('summary', { text: 'Legend' }), legendBody]);
      legendBox.open = !(window.matchMedia && window.matchMedia('(max-width: 700px)').matches);
      L.DomEvent.disableClickPropagation(legendBox);
      return legendBox;
    };
    legendControl.addTo(map);
  }

  // ------------------------------------------------------------------ current weather panel
  var W = window.ClimateWeather;
  var fmt1 = function (v, unit) { return v === null || v === undefined ? '\u2013' : (Math.round(v * 10) / 10) + ' ' + unit; };
  function unitText(u) { return u === 'mp/h' ? 'mph' : u === 'inch' ? 'in' : u; }

  // Returns a box that shows a loading state, then the weather, or a clear "unavailable" message. The caller's content stays visible either way.
  function weatherNode(lat, lon) {
    var box = el('div', { class: 'wx', 'aria-live': 'polite' });
    if (!W) { box.appendChild(el('p', { class: 'wx-msg wx-err', text: 'Weather is unavailable: the weather module did not load.' })); return box; }
    box.appendChild(el('h4', { text: 'Current local weather' }));
    box.appendChild(el('p', { class: 'wx-msg', text: 'Loading weather\u2026' }));
    W.getCurrentWeather(lat, lon).then(function (w) {
      clear(box); box.appendChild(el('h4', { text: 'Current local weather' }));
      var u = w.units;
      var head = el('p', { class: 'wx-head' }, [el('span', { class: 'wx-icon', 'aria-hidden': 'true', text: w.icon || '' }), el('span', { text: w.condition || 'Conditions not reported' })]);
      var dl = el('dl');
      [['Temperature', fmt1(w.temperature, unitText(u.temperature))], ['Feels like', fmt1(w.apparentTemperature, unitText(u.temperature))],
       ['Humidity', fmt1(w.humidity, unitText(u.humidity))], ['Wind speed', fmt1(w.windSpeed, unitText(u.wind))],
       ['Precipitation', fmt1(w.precipitation, unitText(u.precipitation))]].forEach(function (r) {
        dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', { text: r[1] }));
      });
      box.appendChild(head); box.appendChild(dl);
      box.appendChild(el('p', { class: 'wx-src', text: (w.time ? 'Model value for ' + w.time.replace('T', ' ') + ' local time' + (w.timezone ? ' (' + w.timezone + ')' : '') + '. ' : '') + 'Weather data by Open-Meteo.com. Current conditions are modelled for the area, not measured at the site.' }));
    }).catch(function (err) {
      clear(box); box.appendChild(el('h4', { text: 'Current local weather' }));
      box.appendChild(el('p', { class: 'wx-msg wx-err', text: 'Weather unavailable: ' + (err && err.message ? err.message : 'unknown error') }));
      var retry = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Try again' });
      retry.addEventListener('click', function () { box.replaceWith(weatherNode(lat, lon)); });
      box.appendChild(retry);
    });
    return box;
  }

  // A popup for a point that is not a data center: a clicked spot or a searched place.
  function showPlaceWeather(latlng, title, subtitle) {
    var node = el('div', { class: 'pop' }, [el('h3', { text: title }), subtitle ? el('p', { class: 'pop-en', text: subtitle }) : null,
      el('p', { class: 'pop-en', text: 'Coordinates: ' + latlng.lat.toFixed(4) + ', ' + latlng.lng.toFixed(4) }), weatherNode(latlng.lat, latlng.lng)]);
    L.popup({ maxWidth: 320 }).setLatLng(latlng).setContent(node).openOn(map);
  }

  function popupNode(p, lat, lon) {
    var rows = [];
    var add = function (k, v) { if (v) rows.push([k, v]); };
    var where = [p.street, p.city, p.state ? stateName(p.state) + (p.stateSrc === 'inferred' ? ' (state inferred from coordinates)' : '') : '', p.postcode, countryName(p)].filter(Boolean).join(', ');
    add('Operator', p.operator); add('Owner', p.owner); add('Type', KIND_BY_KEY[p.kind] && KIND_BY_KEY[p.kind].label);
    add('Location', where);
    if (lat !== undefined) add('Coordinates', lat.toFixed(5) + ', ' + lon.toFixed(5));
    add('Building footprint', p.footprintM2 && num(p.footprintM2) + ' m²'); add('Levels', p.levels); add('Height', p.heightM && p.heightM + ' m');
    add('Opened / start date', p.startDate); add('Last edited on OSM', p.edited);
    var dl = el('dl');
    rows.forEach(function (r) { dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', { text: String(r[1]) })); });
    var links = el('p', { class: 'pop-links' });
    var site = safeUrl(p.website || '');
    if (site) links.appendChild(el('a', { href: site, target: '_blank', rel: 'noopener noreferrer', text: 'Website' }));
    links.appendChild(el('a', { href: 'https://www.openstreetmap.org/' + p.id, target: '_blank', rel: 'noopener noreferrer', text: 'View on OpenStreetMap' }));
    var title = p.name || 'Unnamed data center';
    return el('div', { class: 'pop' }, [el('h3', { text: title }), p.nameEn && p.nameEn !== p.name ? el('p', { class: 'pop-en', text: p.nameEn }) : null, dl, lat === undefined ? null : weatherNode(lat, lon), links]);
  }
  function tipText(p) {
    var loc = [p.city, p.state ? p.state : '', countryName(p)].filter(Boolean).join(', ');
    return (p.name || 'Unnamed data center') + ' · ' + loc;
  }

  function makeMarkers() {
    records.forEach(function (r) {
      var k = KIND_BY_KEY[r.p.kind] || KIND_BY_KEY.unclassified;
      var m = L.circleMarker([r.lat, r.lon], { radius: 6, color: '#ffffff', weight: 1, fillColor: k.color, fillOpacity: 0.9, bubblingMouseEvents: false });
      m.bindTooltip(function () { return el('span', { text: tipText(r.p) }); }, { direction: 'top', offset: [0, -4] });   // an element: a string would be parsed as HTML
      m.bindPopup(function () { return popupNode(r.p, r.lat, r.lon); }, { maxWidth: 320 });
      r.marker = m;
    });
  }

  function renderLayers() {
    if (clusterBusy && Date.now() - busySince < 8000) { pendingRender = true; return; }
    [cluster, plainGroup, heat].forEach(function (l) { if (l && map.hasLayer(l)) map.removeLayer(l); });
    var ms = filtered.map(function (r) { return r.marker; });
    if (st.mode === 'clusters') {
      clusterBusy = ms.length > 0; busySince = Date.now();
      cluster.clearLayers(); cluster.addLayers(ms); map.addLayer(cluster);
    } else if (st.mode === 'markers') {
      plainGroup = L.layerGroup(ms); map.addLayer(plainGroup);
    } else {
      heat.setLatLngs(filtered.map(function (r) { return [r.lat, r.lon, 1]; })); // every location counts once: density, not demand
      map.addLayer(heat);
    }
    renderLegend();
  }

  function renderLegend() {
    if (!legendBody) return;
    clear(legendBody);
    if (st.mode === 'heat') {
      legendBody.appendChild(el('strong', { text: 'Density of mapped locations' }));
      legendBody.appendChild(el('div', { class: 'ramp', 'aria-hidden': 'true' }));
      legendBody.appendChild(el('div', { class: 'ramp-l' }, [el('span', { text: 'Fewer' }), el('span', { text: 'More' })]));
      legendBody.appendChild(el('p', { class: 'legend-note', text: 'Shows where mapped data centers are concentrated. It is not electricity use or power demand.' }));
      return;
    }
    var counts = {};
    filtered.forEach(function (r) { counts[r.p.kind] = (counts[r.p.kind] || 0) + 1; });
    legendBody.appendChild(el('strong', { text: 'Facility type' }));
    KINDS.forEach(function (k) {
      if (!counts[k[0]]) return;
      var sw = el('span', { class: 'swatch', 'aria-hidden': 'true' }); sw.style.background = k[2];
      legendBody.appendChild(el('div', { class: 'legend-row' }, [sw, el('span', { text: k[1] }), el('span', { class: 'legend-n', text: num(counts[k[0]]) })]));
    });
    if (st.mode === 'clusters') legendBody.appendChild(el('p', { class: 'legend-note', text: 'Numbered circles group nearby data centers. Click one, or zoom in, to expand it.' }));
  }

  // Fit the map to what is on screen. `reset` also ignores the "stay put" rule used while typing.
  function fit(reset) {
    if (!map) return;
    var noFilters = !st.state && !st.city && !st.q && !st.region && (st.view === 'us' || !st.country);
    var bounds;
    if (st.view === 'us' && noFilters) bounds = L.latLngBounds(US_BOUNDS);
    else if (filtered.length) bounds = L.latLngBounds(filtered.map(function (r) { return [r.lat, r.lon]; }));
    else if (reset) bounds = st.view === 'us' ? L.latLngBounds(US_BOUNDS) : null;
    if (!bounds) return;
    var opts = { padding: [30, 30], maxZoom: st.state || st.city ? 10 : 12 };
    if (REDUCED_MOTION) { map.fitBounds(bounds, Object.assign({ animate: false }, opts)); }
    else map.flyToBounds(bounds, Object.assign({ duration: 0.9 }, opts));
  }

  // ------------------------------------------------------------------ orchestration
  function syncToggles() {
    $('view-global').setAttribute('aria-pressed', String(st.view === 'global'));
    $('view-us').setAttribute('aria-pressed', String(st.view === 'us'));
    ['clusters', 'markers', 'heat'].forEach(function (m) { $('mode-' + m).setAttribute('aria-pressed', String(st.mode === m)); });
    $('mode-note').hidden = st.mode !== 'heat';
  }

  function refresh(doFit) {
    if (st.view === 'us') { st.country = 'US'; st.region = ''; }
    renderControls();            // may clear values that no longer fit, so filter afterwards
    filtered = records.filter(function (r) { return matches(r); });
    $('status').textContent = 'Showing ' + num(filtered.length) + ' of ' + num(records.length) + ' data centers · ' + (st.view === 'us' ? 'United States View' : 'Global View');
    renderStats();
    renderLayers();
    if (doFit) fit(false);
  }

  function setView(view) {
    st.view = view; st.state = ''; st.city = ''; st.region = '';
    st.country = view === 'us' ? 'US' : '';
    syncToggles(); refresh(true);
  }
  function setMode(mode) { st.mode = mode; syncToggles(); renderLayers(); }
  function resetFilters() {
    st.region = ''; st.state = ''; st.city = ''; st.q = ''; st.country = st.view === 'us' ? 'US' : '';
    KINDS.forEach(function (k) { st.kinds[k[0]] = true; });
    $('f-search').value = '';
    refresh(true);
  }

  function bindPlaceSearch() {
    var form = $('wx-form'), input = $('wx-q'), list = $('wx-results'), usOnly = $('wx-us');
    if (!form) return;
    var note = function (t) { clear(list); list.appendChild(el('li', { class: 'wx-none', text: t })); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (q.length < 2) { note('Type at least two letters.'); return; }
      if (!W) { note('Place search is unavailable: the weather module did not load.'); return; }
      note('Searching\u2026');
      W.searchPlaces(q, usOnly.checked ? { countryCode: 'US' } : {}).then(function (places) {
        clear(list);
        if (!places.length) { note('No places found. Try a different spelling' + (usOnly.checked ? ' or untick \u201cUS only\u201d.' : '.')); return; }
        places.forEach(function (pl) {
          var label = [pl.name, pl.admin1, pl.country].filter(Boolean).join(', ');
          var b = el('button', { type: 'button', text: label });
          b.addEventListener('click', function () {
            clear(list);
            var ll = L.latLng(pl.lat, pl.lng);
            map.flyTo(ll, Math.max(map.getZoom(), 9), { animate: !REDUCED_MOTION, duration: 0.8 });
            showPlaceWeather(ll, pl.name, [pl.admin1, pl.country].filter(Boolean).join(', '));
          });
          list.appendChild(el('li', {}, [b]));
        });
      }).catch(function (err) { note('Place search failed: ' + (err && err.message ? err.message : 'unknown error')); });
    });
  }

  function bindEvents() {
    $('view-global').addEventListener('click', function () { setView('global'); });
    $('view-us').addEventListener('click', function () { setView('us'); });
    $('mode-clusters').addEventListener('click', function () { setMode('clusters'); });
    $('mode-markers').addEventListener('click', function () { setMode('markers'); });
    $('mode-heat').addEventListener('click', function () { setMode('heat'); });
    $('f-region').addEventListener('change', function (e) { st.region = e.target.value; st.country = ''; st.state = ''; st.city = ''; refresh(true); });
    $('f-country').addEventListener('change', function (e) { st.country = e.target.value; st.state = ''; st.city = ''; refresh(true); });
    $('f-state').addEventListener('change', function (e) { st.state = e.target.value; st.city = ''; refresh(true); });
    $('f-city').addEventListener('change', function (e) { st.city = e.target.value; refresh(true); });
    var timer;
    $('f-search').addEventListener('input', function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () { st.q = plain(e.target.value.trim()); refresh(true); }, 180);
    });
    $('f-reset').addEventListener('click', resetFilters);
    bindPlaceSearch();
    // On narrow screens the filter panel starts collapsed so the map is reachable without scrolling.
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) $('filters').open = false;
  }

  function renderNotes() {
    var S = meta.stats || {}, inf = meta.stateInference || {};
    var usCity = records.filter(function (r) { return r.p.iso2 === 'US' && r.p.city; }).length;
    var withArea = records.filter(function (r) { return r.p.footprintM2; }).length;
    var kinds = {};
    records.forEach(function (r) { kinds[r.p.kind] = (kinds[r.p.kind] || 0) + 1; });
    var us = (meta.reportedTotals || {}).US;
    var lines = [
      'Source: an OpenStreetMap-derived extract of ' + num(S.total) + ' mapped data center facilities in ' + num(S.countries) + ' countries' + (S.withoutCountry ? ' (plus ' + S.withoutCountry + ' with no country recorded, shown on the map but not assigned to a country)' : '') + '. Locations are as mapped by contributors; none were added or changed.',
      us ? 'Coverage is partial: ' + us.tracker + ' (via ' + us.publishedBy + ', ' + us.asOf + ') reports ' + num(us.facilities) + ' US data centers, against ' + num(S.us) + ' in this dataset.' : null,
      'US states: ' + num(S.us - (inf.inferred || 0)) + ' of ' + num(S.us) + ' US records carry a state in the source.' + (inf.enabled ? ' The other ' + num(inf.inferred) + ' were assigned from their coordinates using US Census state boundaries, which reproduces ' + (100 * inf.agreement_rate).toFixed(1) + '% of the ' + num(inf.validated_against_tagged) + ' states that were tagged. Inferred states are marked in popups.' : ''),
      'Cities: only ' + num(usCity) + ' of ' + num(S.us) + ' US records have a city, so the city filter lists only those.',
      'Power capacity is not part of this dataset, so none is shown. “Mapped building footprint” is the building area where recorded (' + num(withArea) + ' of ' + num(records.length) + ' facilities).',
      'Facility type is the dataset’s own classification; ' + num(kinds.unclassified || 0) + ' facilities are unclassified. The heatmap shows the density of mapped locations only, not electricity use or demand.'
    ];
    var ul = $('notes'); clear(ul);
    lines.forEach(function (t) { if (t) ul.appendChild(el('li', { text: t })); });
  }

  // ------------------------------------------------------------------ start-up
  function showOverlay(message, retry) {
    var o = $('map-overlay'); clear(o);
    o.classList.remove('hidden'); o.classList.toggle('error', !!retry);
    o.appendChild(retry ? el('div', { class: 'err-mark', 'aria-hidden': 'true', text: '!' }) : el('div', { class: 'spinner', 'aria-hidden': 'true' }));
    o.appendChild(el('p', { text: message }));
    if (retry) { var b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Try again' }); b.addEventListener('click', load); o.appendChild(b); }
  }
  function hideOverlay() { $('map-overlay').classList.add('hidden'); }

  function ingest(gj) {
    meta = gj.metadata || {};
    records = gj.features.map(function (f) {
      var p = f.properties;
      return { p: p, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], search: plain([p.name, p.nameEn, p.operator, p.owner].filter(Boolean).join(' ')) };
    });
    records.forEach(function (r) { if (r.p.iso2 && !countryNames[r.p.iso2]) countryNames[r.p.iso2] = countryName(r.p); });
  }

  function load() {
    showOverlay('Loading data centers…');
    fetch(DATA_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (gj) {
      ingest(gj);
      if (!map) { initMap(); buildKindControls(); bindEvents(); }
      makeMarkers(); renderNotes(); syncToggles();
      refresh(true);
      hideOverlay();
    }).catch(function (err) {
      var local = location.protocol === 'file:';
      $('status').textContent = 'The data could not be loaded.';
      showOverlay('The data centers could not be loaded (' + err.message + ').' + (local ? ' Browsers block data requests from files opened directly; serve the folder with “python -m http.server” and open it at http://localhost:8000/data-centers.html.' : ''), true);
    });
  }
  if (typeof L === 'undefined') {
    $('status').textContent = 'The map library could not be loaded.';
    showOverlay('The map library could not be loaded. Check your internet connection and reload the page.', false);
  } else load();
})();
