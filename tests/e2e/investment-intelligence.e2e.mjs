// End-to-end tests for investment-intelligence.html. Expected values are computed in Node with the same engines, independently of the page.
import fs from 'node:fs';
import { launch, openPage, openMeteoMocks, sleep, BASE, helpers } from './lib.mjs';
const { js, ROOT, hourlySeries, Climate } = helpers;
const Scn = js('scenario-engine.js'), Scoring = js('scoring-engine.js'), Geo = js('us-geo.js'), Cooling = js('cooling-model.js'), Advisor = js('investment-advisor.js');
const PROC = ROOT + '/peak-power/data/processed/';
const rd = (f) => JSON.parse(fs.readFileSync(PROC + f, 'utf8'));
const states = rd('us-states.geojson'), reference = rd('us-reference.json'), gridSnap = rd('climate-grid.json'), dcs = rd('data-centers.geojson');
const refs = { femaQuantiles: reference.fema.quantiles };
const usFac = dcs.features.filter((f) => f.properties.iso2 === 'US').map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
const cells = gridSnap.cells;
const nearbyById = Object.fromEntries(cells.map((c) => [c.id, Geo.countWithin(usFac, c.lat, c.lon, 100)]));

let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const meanFor = (lat) => 22 - (lat - 30) * 0.9;                    // canned climate: warmer in the south
const FEMA = (over = {}) => ({ features: [{ attributes: { COUNTY: 'Loudoun', STATEABBRV: 'VA', POPULATION: 418601, BUILDVALUE: 8e10, EAL_VALB: 1.6e8, RISK_RATNG: 'Relatively Low', HWAV_RISKR: 'Relatively Moderate', CFLD_RISKR: 'Not Applicable', HRCN_RISKR: 'Relatively Low', ERQK_RISKR: 'Relatively Low', TRND_RISKR: 'Relatively Moderate', WFIR_RISKR: 'Very Low', DRGT_RISKR: 'Relatively Moderate', NRI_VER: 'December 2025', ...over } }] });

function mocksFor({ stats, archiveStatus, femaStatus, femaBody, loadFail } = {}) {
  const base = openMeteoMocks({ femaBody: null });
  const cur = base.find((m) => m.pattern.includes('v1/forecast')), geo = base.find((m) => m.pattern.includes('geocoding'));
  const st = stats || {};
  const arch = { re: /archive-api\.open-meteo\.com/, pattern: '*archive-api.open-meteo.com*', handler: async (u) => {
    (st.archive = st.archive || []).push(u);
    if (archiveStatus) return { status: archiveStatus, body: { error: true, reason: archiveStatus === 429 ? 'Hourly API request limit exceeded. Please try again in the next hour.' : 'Server error' } };
    const lat = +new URL(u).searchParams.get('latitude');
    const h = hourlySeries({ mean: meanFor(lat), annualAmp: 11, dailyAmp: 5, rh: 60, years: 3, startYear: 2023, windMph: 9 });
    return { body: { latitude: lat, longitude: +new URL(u).searchParams.get('longitude'), elevation: 92, timezone: 'America/New_York', hourly: { time: h.time, temperature_2m: h.temperature_2m, relative_humidity_2m: h.relative_humidity_2m, wet_bulb_temperature_2m: h.temperature_2m.map((t) => t - 4), wind_speed_10m: h.wind_speed_10m } } }; } };
  const curM = { ...cur, handler: async (u) => { (st.current = st.current || []).push(u); return cur.handler(u); } };
  const geoM = { ...geo, handler: async (u) => { (st.geocode = st.geocode || []).push(u); return geo.handler(u); } };
  const fema = { re: /arcgis\.com/, pattern: '*arcgis.com*', handler: async (u) => { (st.fema = st.fema || []).push(u); return femaStatus ? { status: femaStatus, body: {} } : { body: femaBody || FEMA() }; } };
  const grid = { re: /climate-grid\.json/, pattern: '*climate-grid.json*', handler: async () => (loadFail ? { status: 404, body: {} } : { body: gridSnap }) };
  return [arch, curM, geoM, fema, grid];
}
const ledgerScript = (entries) => `localStorage.setItem('pp.om.ledger', ${JSON.stringify(JSON.stringify(entries))});`;

async function freshPage(b, opts, pre) {          // a page whose localStorage starts empty (or seeded with `pre`)
  const q = await openPage(b, { ...opts, url: 'about:blank' });
  await q.S('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear(); ${pre || ''}` });
  const done = new Promise((r) => b.listeners.push((m) => { if (m.method === 'Page.loadEventFired') r(); }));
  await q.S('Page.navigate', { url: BASE + 'investment-intelligence.html' }); await done; return q;
}
async function ready(p) { const r = await p.waitFor(`document.getElementById('ii-overlay').classList.contains('hidden')`, 45000); await sleep(1200); return r; }
async function clickMap(p, lat, lon, zoom = 10) {
  await p.ev(`document.getElementById('ii-map').scrollIntoView({behavior:'instant', block:'center'})`); await sleep(300);
  await p.ev(`void __maps[0].setView([${lat}, ${lon}], ${zoom}, {animate:false})`); await sleep(1300);
  const pt = JSON.parse(await p.ev(`JSON.stringify(__maps[0].latLngToContainerPoint([${lat}, ${lon}]))`)), r = JSON.parse(await p.ev(`JSON.stringify(document.getElementById('ii-map').getBoundingClientRect())`));
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await p.S('Input.dispatchMouseEvent', { type, x: r.x + pt.x, y: r.y + pt.y, button: 'left', clickCount: 1 });
}
const tile = (p, k) => p.ev(`(() => { const t = [...document.querySelectorAll('#ii-loc .ii-tile')].find((x) => x.querySelector('.k').textContent === ${JSON.stringify(k)}); return t ? t.querySelector('.v').textContent : null; })()`);
const money = (n) => { const a = Math.abs(n); return a >= 1e6 ? '$' + (a / 1e6).toFixed(1) + 'M' : '$' + Math.round(a / 1e3).toLocaleString('en-US') + 'k'; };

// expected engine result for a point, given the same canned inputs the page receives
function expected(lat, lon, scenario = {}, femaAttrs = FEMA().features[0].attributes) {
  const h = hourlySeries({ mean: meanFor(lat), annualOverride: 0, annualAmp: 11, dailyAmp: 5, rh: 60, years: 3, startYear: 2023, windMph: 9 });
  h.wet_bulb_temperature_2m = h.temperature_2m.map((t) => t - 4);
  const climate = Climate.summarize(h), st = Geo.stateAt(lon, lat, states), s = reference.eia.states[st];
  const loc = { id: 'x', label: 'x', lat, lon, state: st, climate, priceCentsPerKwh: s.industrialCentsPerKwh, saidiMinutes: s.saidiMinutes, ealRate: femaAttrs ? femaAttrs.EAL_VALB / femaAttrs.BUILDVALUE : null, nearbyFacilities: Geo.countWithin(usFac, lat, lon, 100) };
  return { climate, loc, result: Scn.evaluate(loc, scenario, refs) };
}

// ======================================================================== A. load, modes, layers
console.log('=== A. load, modes and layers (desktop 1400x900) ===');
let b = await launch();
let stats = {};
let p = await openPage(b, { width: 1400, height: 900, mocks: mocksFor({ stats }), url: BASE + 'investment-intelligence.html' });
ok(await ready(p), 'page loads and the loading overlay clears');
ok(p.errors.length === 0, `no JS errors on load (${p.errors.length})`);
ok(await p.ev(`document.getElementById('mode-suit').getAttribute('aria-pressed')`) === 'true', 'default mode is Investment Suitability');
ok(await p.ev(`getComputedStyle(document.getElementById('metric-wrap')).display`) === 'none', 'the climate-measure selector is not visible outside Weather & Climate mode');
ok((await p.ev(`document.getElementById('ii-status').textContent`)).includes(cells.length + ' modelled grid cells'), 'status line reports the grid: ' + await p.ev(`document.getElementById('ii-status').textContent`));
const layerInfo = () => p.ev(`(() => { const o = { rects: 0, circles: 0, tips: [], cluster: 0 }; __maps[0].eachLayer((l) => { if (l instanceof L.Rectangle) { o.rects++; o.tips.push(l._tooltip && l._tooltip._content && l._tooltip._content.textContent); } else if (l instanceof L.MarkerClusterGroup) o.cluster = l.getLayers().length; else if (l instanceof L.CircleMarker && l.options.dashArray === '3 3') { o.circles++; o.tips.push(l._tooltip && l._tooltip._content && l._tooltip._content.textContent); } }); return JSON.stringify(o); })()`).then(JSON.parse);
let li = await layerInfo();
const defaultSc = Scn.defaultScenario();
const expScores = cells.map((c) => Scn.evaluate(Scn.locationFromCell(c, reference, nearbyById[c.id]), defaultSc, refs).scoring.overall.score);
ok(li.rects + li.circles === expScores.filter((s) => s !== null).length, `suitability layer draws ${li.rects} cells + ${li.circles} anchors = ${li.rects + li.circles}, expected ${expScores.filter((s) => s !== null).length}`);
const shownScores = li.tips.map((t) => +/Modelled score (\d+)/.exec(t)[1]).sort((a, b) => a - b), wantScores = expScores.filter((s) => s !== null).map((s) => Math.round(s)).sort((a, b) => a - b);
ok(JSON.stringify(shownScores) === JSON.stringify(wantScores), 'every cell tooltip shows the score the engine computes (' + shownScores.length + ' cells compared)');
ok((await p.ev(`document.querySelector('.ii-legend').textContent`)).includes('not low-scoring'), 'legend says blank areas are not assessed, not low-scoring');
ok((await p.ev(`document.querySelector('.ii-legend').textContent`)).includes('Modelled, not measured'), 'legend distinguishes modelled values from measurements');

await p.click('#mode-climate'); await sleep(600);
li = await layerInfo();
ok(li.rects + li.circles === cells.length && await p.ev(`getComputedStyle(document.getElementById('metric-wrap')).display !== 'none'`), `climate mode draws every cell (${li.rects + li.circles}) and shows the measure selector`);
ok(JSON.stringify(await p.ev(`JSON.stringify([...document.getElementById('ii-metric').options].map((o) => o.value))`).then(JSON.parse)) === JSON.stringify(['meanF', 'heat95', 'cdd', 'wb99', 'rh', 'pue', 'free']), 'seven climate measures are offered');
const tipsFor = async (metric) => { await p.ev(`(() => { const s = document.getElementById('ii-metric'); s.value = ${JSON.stringify(metric)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500); return (await layerInfo()).tips; };
const temps = (await tipsFor('meanF')).map((t) => +/: (-?\d+) °F/.exec(t)[1]).sort((a, b) => a - b);
const wantTemps = cells.map((c) => Math.round(Climate.cToF(c.climate.annual.meanC))).sort((a, b) => a - b);
ok(JSON.stringify(temps) === JSON.stringify(wantTemps), 'temperature tooltips equal the stored climate values (' + temps.length + ' cells)');
const dd = (await tipsFor('cdd')).map((t) => +/: ([\d,]+) CDD/.exec(t)[1].replace(',', '')).sort((a, b) => a - b);
ok(JSON.stringify(dd) === JSON.stringify(cells.map((c) => c.climate.annual.cddF).sort((a, b) => a - b)), 'cooling-degree-day tooltips equal the stored values');
const puesShown = (await tipsFor('pue')).map((t) => +/: ([\d.]+)\n?/.exec(t)[1]).sort((a, b) => a - b);
const puesWant = cells.map((c) => Scn.evaluate(Scn.locationFromCell(c, reference, 0), defaultSc, refs).cooling.annualPue.toFixed(3)).map(Number).sort((a, b) => a - b);
ok(JSON.stringify(puesShown) === JSON.stringify(puesWant), 'PUE tooltips equal the cooling model output for the current scenario');
ok((await p.ev(`document.querySelector('.ii-legend').textContent`)).includes('Modelled (ERA5 reanalysis)'), 'climate legend labels values as modelled');

await p.click('#mode-existing'); await sleep(900);
li = await layerInfo();
ok(li.cluster === 1789 && li.rects === 0, `existing mode: ${li.cluster} US data centers clustered, no suitability cells`);
ok((await p.ev(`document.getElementById('ii-mapnote').textContent`)).includes('does not say which are existing and which are planned'), 'existing mode states that existing/planned status is unknown');
await p.click('#ext-global'); await sleep(900);
li = await layerInfo(); ok(li.cluster === 4802, `Global View shows all ${li.cluster} data centers`);
await p.click('#mode-suit'); await sleep(700);
ok(await p.ev(`document.getElementById('ext-us').getAttribute('aria-pressed')`) === 'true', 'choosing an analysis mode returns to the United States view');
await p.ev(`document.getElementById('ov-dc').click()`); await sleep(900);
li = await layerInfo(); ok(li.cluster === 1789 && li.rects + li.circles > 0, 'the existing-data-centers overlay sits on top of the suitability layer');
await p.ev(`document.getElementById('ov-dc').click()`);

// weather overlay: one batched request
await p.ev(`document.getElementById('ov-wx').click()`); await p.waitFor(`document.querySelectorAll('.ii-wx').length >= 8`, 10000);
const batch = stats.current && stats.current.find((u) => new URL(u).searchParams.get('latitude').includes(','));
ok(!!batch && new URL(batch).searchParams.get('latitude').split(',').length === 8 && await p.ev(`document.querySelectorAll('.ii-wx').length`) === 8, 'weather overlay: one request for the 8 busiest hubs, 8 labels on the map');
await p.ev(`document.getElementById('ov-wx').click()`);
await p.shot('suit-desktop');

// ======================================================================== B. analysis of a clicked location
console.log('\n=== B. clicking a location ===');
stats.archive = []; stats.current = []; stats.fema = [];
await clickMap(p, 39.04, -77.49);
ok(await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000), 'analysis completes with a suitability score');
await sleep(800);
ok(stats.archive.length === 1 && stats.current.length === 1 && stats.fema.length === 1, `exactly one archive, one current and one FEMA request (${stats.archive.length}/${stats.current.length}/${stats.fema.length})`);
const au = new URL(stats.archive[0]);
ok(au.searchParams.get('start_date') === '2023-01-01' && au.searchParams.get('end_date') === '2025-12-31' && au.searchParams.get('hourly') === 'temperature_2m,relative_humidity_2m,wet_bulb_temperature_2m,wind_speed_10m' && au.searchParams.get('timezone') === 'auto' && au.searchParams.get('wind_speed_unit') === 'mph', 'archive request: 3 complete years, hourly variables, local timezone, mph');
const clickedLat = +au.searchParams.get('latitude'), clickedLon = +au.searchParams.get('longitude');
ok(Math.abs(clickedLat - 39.04) < 0.05 && Math.abs(clickedLon + 77.49) < 0.05, `request coordinates match the clicked point (${clickedLat.toFixed(3)}, ${clickedLon.toFixed(3)})`);
const fu = new URL(stats.fema[0]);
ok(fu.searchParams.get('geometry') === `${clickedLon},${clickedLat}` && fu.searchParams.get('geometryType') === 'esriGeometryPoint', 'FEMA query uses the same point (x = longitude, y = latitude)');
ok((await p.ev(`document.querySelector('#ii-loc h2').textContent`)).startsWith('Virginia'), 'point is placed in Virginia: ' + await p.ev(`document.querySelector('#ii-loc h2').textContent`));
const exp = expected(clickedLat, clickedLon);
ok(await tile(p, 'Annual PUE') === exp.result.cooling.annualPue.toFixed(3), `annual PUE on the page ${await tile(p, 'Annual PUE')} = engine ${exp.result.cooling.annualPue.toFixed(3)}`);
ok(await tile(p, 'Electricity cost / year') === money(exp.result.cost.annualUsd), `annual cost ${await tile(p, 'Electricity cost / year')} = engine ${money(exp.result.cost.annualUsd)}`);
ok(await tile(p, 'Cooling energy') === (exp.result.cooling.coolingEnergyMWh / 1000).toFixed(exp.result.cooling.coolingEnergyMWh >= 1e5 ? 0 : 1) + ' GWh', 'cooling energy matches the engine');
const ring = await p.ev(`document.querySelector('#ii-loc .ii-ring b').textContent`);
ok(+ring === Math.round(exp.result.scoring.overall.score), `suitability score ${ring} = engine ${Math.round(exp.result.scoring.overall.score)}`);
ok(await tile(p, 'Annual mean temperature') === Climate.cToF(exp.climate.annual.meanC).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' °F', 'climate summary: annual mean temperature matches');
ok(await tile(p, 'Extreme heat days') === (Math.round(exp.climate.annual.heatDays95F * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' / yr', 'climate summary: extreme heat days match');
ok(await tile(p, 'Cooling degree days') === exp.climate.annual.cddF.toLocaleString('en-US') + ' / yr', 'climate summary: cooling degree days match');
ok((await p.ev(`document.getElementById('ii-loc').textContent`)).includes('Loudoun, VA'), 'FEMA county shown: Loudoun, VA');
const wantPct = Scoring.percentileRank(8e7 / 4e10, refs.femaQuantiles).toFixed(0);
ok((await p.ev(`document.getElementById('ii-loc').textContent`)).includes(`higher than ${wantPct}% of counties`), `hazard percentile is described correctly: loss rate 0.20% is higher than ${wantPct}% of US counties (and so scores low, not high)`);
const secs = JSON.parse(await p.ev(`JSON.stringify([...document.querySelectorAll('#ii-loc .ii-sec > h3 > span:first-child')].map((x) => x.textContent))`));
ok(JSON.stringify(secs) === JSON.stringify(['Current weather', 'Climate history', 'Cooling & electricity estimate', 'Environmental risk', 'Investment suitability']), 'panel shows all sections: ' + secs.join(' | '));
const loc = await p.ev(`document.getElementById('ii-loc').textContent`);
ok(['Water constraints', 'Infrastructure access', 'Power availability'].every((x) => loc.includes(x)) && loc.includes('not a financial return forecast'), 'unassessed factors are listed and the score is labelled a screening score');
ok(loc.includes('has not been validated'), 'cooling estimate is labelled unvalidated');
await p.shotEl('ii-panel-after-click', '#ii-panel', 4);

// ======================================================================== C. scenario controls
console.log('\n=== C. scenario controls ===');
const setRange = async (id, v) => { await p.ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(500); };
await setRange('sc-it', 100);
const exp100 = expected(clickedLat, clickedLon, { itMW: 100 });
ok(await tile(p, 'Electricity cost / year') === money(exp100.result.cost.annualUsd), `100 MW: cost ${await tile(p, 'Electricity cost / year')} = engine ${money(exp100.result.cost.annualUsd)} (about double)`);
await setRange('sc-it', 50);
await p.ev(`(() => { document.getElementById('sc-price-own').click(); const e = document.getElementById('sc-price'); e.value = '5'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(500);
const expP = expected(clickedLat, clickedLon, { priceOverrideCentsPerKwh: 5 });
ok(await tile(p, 'Electricity cost / year') === money(expP.result.cost.annualUsd) && (await p.ev(`document.getElementById('ii-loc').textContent`)).includes('entered by you'), 'entering my own price 5 ¢/kWh changes the cost and says the price was entered by me');
await p.ev(`document.getElementById('sc-price-auto').click()`); await sleep(400);
await p.ev(`(() => { const e = document.getElementById('sc-sys'); e.value = 'air-chiller'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500);
const expS = expected(clickedLat, clickedLon, { system: 'air-chiller' });
ok(await tile(p, 'Annual PUE') === expS.result.cooling.annualPue.toFixed(3) && +await tile(p, 'Annual PUE') > +exp.result.cooling.annualPue.toFixed(3), `cooling system change: PUE ${await tile(p, 'Annual PUE')} = engine ${expS.result.cooling.annualPue.toFixed(3)} (air-cooled chillers use more)`);
await p.ev(`(() => { const e = document.getElementById('sc-sys'); e.value = 'water-chiller-econ'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await p.ev(`(() => { const e = document.getElementById('sc-clim'); e.value = '3'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500);
const expW = expected(clickedLat, clickedLon, { offsetC: 3 });
ok(await tile(p, 'Annual PUE') === expW.result.cooling.annualPue.toFixed(3) && +expW.result.cooling.annualPue.toFixed(3) > +exp.result.cooling.annualPue.toFixed(3), `+3 °C climate: PUE ${await tile(p, 'Annual PUE')} = engine ${expW.result.cooling.annualPue.toFixed(3)}`);
await p.ev(`(() => { const e = document.getElementById('sc-clim'); e.value = '0'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(400);
// weights: all weight on climate makes the overall score equal the climate factor score
for (const id of ['electricity', 'grid', 'environment', 'market']) await setRange('w-' + id, 0);
const climOnly = expected(clickedLat, clickedLon, { weights: { climate: 25, electricity: 0, grid: 0, environment: 0, market: 0 } });
ok(+await p.ev(`document.querySelector('#ii-loc .ii-ring b').textContent`) === Math.round(climOnly.result.scoring.factors[0].score), `weights: climate only gives score ${await p.ev(`document.querySelector('#ii-loc .ii-ring b').textContent`)} = climate factor ${Math.round(climOnly.result.scoring.factors[0].score)}`);
const rankBefore = await p.ev(`[...document.querySelectorAll('#ii-rank tbody tr td:nth-child(2)')].map((x) => x.textContent).join(',')`);
await p.click('#sc-reset'); await sleep(500);
const rankReset = await p.ev(`[...document.querySelectorAll('#ii-rank tbody tr td:nth-child(2)')].map((x) => x.textContent).join(',')`);
ok(rankBefore !== rankReset, 'changing the weights reorders the state ranking');
ok(+await p.ev(`document.querySelector('#ii-loc .ii-ring b').textContent`) === Math.round(exp.result.scoring.overall.score) && await p.ev(`document.getElementById('sc-it').value`) === '50', 'Reset scenario restores the defaults');
const names = Object.fromEntries(states.features.map((f) => [f.properties.code, f.properties.name]));
const wantRank = Scn.rankByScore(Scn.stateSummary(cells, defaultSc, refs, reference, nearbyById)).map((s) => names[s.state]).join(',');
ok(rankReset === wantRank, `ranking table equals the engine ranking (${wantRank.split(',').length} states, top: ${wantRank.split(',').slice(0, 3).join(', ')})`);
ok(await p.ev(`document.getElementById('rank-note').textContent`).then((t) => /Not ranked, for lack of a grid cell/.test(t) || cells.length >= 98), 'the ranking says which states are not ranked');
const usageTxt = await p.ev(`document.getElementById('ii-usage').textContent`); ok(/This hour: \d+ of 4,000/.test(usageTxt) && /requests/.test(usageTxt), 'API usage meter is shown: ' + usageTxt.slice(0, 80));

// ======================================================================== D. comparison
console.log('\n=== D. comparison of locations ===');
await p.click('#ii-add'); await sleep(300);
const pts = [[33.45, -112.07, 'AZ'], [45.6, -121.18, 'OR'], [31.0, -97.0, 'TX'], [41.9, -87.7, 'IL']];
for (const [lat, lon] of pts.slice(0, 2)) { await clickMap(p, lat, lon); await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(600); await p.click('#ii-add'); await sleep(300); }
let cols = await p.ev(`document.querySelectorAll('#ii-compare thead th').length - 1`);
ok(cols === 3, `three locations in the comparison (${cols})`);
const cmpText = await p.ev(`document.getElementById('ii-compare').textContent`);
const e3 = [[clickedLat, clickedLon], [33.45, -112.07], [45.6, -121.18]];
ok(true, '(compare table: ' + cmpText.slice(0, 60) + '…)');
const rowVals = async (label) => p.ev(`(() => { const r = [...document.querySelectorAll('#ii-compare tbody tr')].find((x) => x.firstChild.textContent === ${JSON.stringify(label)}); return JSON.stringify([...r.children].slice(1).map((x) => x.textContent)); })()`).then(JSON.parse);
const costs = await rowVals('Annual electricity cost'), deltas = await rowVals('Cost vs first location'), scoresRow = await rowVals('Suitability score');
const expLocs = e3.map(([la, lo]) => expected(la, lo));
ok(JSON.stringify(costs) === JSON.stringify(expLocs.map((e) => money(e.result.cost.annualUsd))), 'comparison costs equal the engine: ' + costs.join(' | '));
ok(deltas[0] === '—' && /^[+-]\$/.test(deltas[1]) && /^[+-]\$/.test(deltas[2]), 'differences are shown relative to the first location: ' + deltas.join(' | '));
ok(JSON.stringify(scoresRow) === JSON.stringify(expLocs.map((e) => e.result.scoring.overall.score.toFixed(1) + ' (' + e.result.scoring.overall.kind + ')')), 'comparison scores equal the engine: ' + scoresRow.join(' | '));
const pueRow = await rowVals('Annual PUE (modelled)'); ok(+pueRow[1] > +pueRow[2], 'hotter Arizona has a higher modelled PUE than cooler Oregon: ' + pueRow.join(' | '));
await setRange('sc-it', 100); const costs100 = await rowVals('Annual electricity cost');
ok(JSON.stringify(costs100) === JSON.stringify(e3.map(([la, lo]) => money(expected(la, lo, { itMW: 100 }).result.cost.annualUsd))), 'changing the scenario recalculates the comparison'); await setRange('sc-it', 50);
for (const [lat, lon] of pts.slice(2)) { await clickMap(p, lat, lon); await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(600); await p.click('#ii-add'); await sleep(300); }
cols = await p.ev(`document.querySelectorAll('#ii-compare thead th').length - 1`); ok(cols === 4, 'a fourth location can be added');
await clickMap(p, 29.7, -95.4); await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(500); await p.click('#ii-add'); await sleep(300);
ok(await p.ev(`document.querySelectorAll('#ii-compare thead th').length - 1`) === 4 && (await p.ev(`document.getElementById('ii-status').textContent`)).includes('up to four'), 'the comparison holds at most four, and says so');
await p.ev(`document.querySelector('#ii-compare thead th .ii-x').click()`); await sleep(300);
ok(await p.ev(`document.querySelectorAll('#ii-compare thead th').length - 1`) === 3, 'a location can be removed');
await p.shotEl('ii-compare', '#ii-compare', 10);

// ======================================================================== E. sensitivity, search, advisor, outside US
console.log('\n=== E. sensitivity, search, advisor, outside the US ===');
await clickMap(p, clickedLat, clickedLon); await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(500);
const sens = await p.ev(`JSON.stringify([...[...document.querySelectorAll('#ii-loc details')].find((d) => d.textContent.startsWith('Sensitivity analysis')).querySelectorAll('tbody tr')].map((r) => [r.children[0].textContent, r.children[1].textContent, r.children[2].textContent]))`).then(JSON.parse);
const wantSens = Scn.sensitivity(exp.loc, defaultSc, refs).rows;
ok(sens.length === wantSens.length && sens.length >= 10, `sensitivity table has ${sens.length} cases (engine: ${wantSens.length})`);
const p20 = sens.find((r) => r[0].includes('Price 20% higher')); ok(!!p20 && p20[1].includes('+20.0%') && p20[2].startsWith('-'), 'a 20% price rise adds 20.0% to cost and lowers the score: ' + (p20 || []).join(' | '));
// outside US
stats.archive = []; await p.ev(`void __maps[0].setView([43.65, -79.38], 9, {animate:false})`); await sleep(1000); await p.click('#ii-center'); await sleep(800);
ok((await p.ev(`document.getElementById('ii-loc').textContent`)).includes('Outside the United States') && stats.archive.length === 0, 'analysing a point in Canada is refused without any API call');
// search
stats.archive = []; await p.ev(`(() => { const i = document.getElementById('ii-search'); i.value = 'Ashburn'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
ok(await p.waitFor(`document.querySelectorAll('#ii-results button').length === 2`, 8000), 'place search lists the matches');
ok(stats.geocode && new URL(stats.geocode[0]).searchParams.get('countryCode') === 'US', 'the search is limited to the United States');
await p.ev(`document.querySelectorAll('#ii-results button')[1].click()`); await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(600);
ok((await p.ev(`document.querySelector('#ii-loc h2').textContent`)) === 'Ashburn, Georgia' && stats.archive.length === 1, `choosing a result analyses it under its name (a new place, so one history request): title "${await p.ev(`document.querySelector('#ii-loc h2').textContent`)}", ${stats.archive.length} request(s); warn: ${await p.ev(`(document.querySelector('#ii-loc .ii-warn')||{}).textContent`)}; usage: ${(await p.ev(`document.getElementById('ii-usage').textContent`)).slice(0, 110)}`);
// advisor (needs states that have a grid cell)
const withCells = [...new Set(cells.map((c) => c.state))].sort(); const [s1, s2] = withCells.slice(0, 2);
const askAdv = async (q) => { await p.ev(`(() => { document.getElementById('adv-q').value = ${JSON.stringify(q)}; document.getElementById('adv-form').requestSubmit(); })()`); await sleep(400); return p.ev(`document.getElementById('adv-answer').textContent`); };
const ans = await askAdv(`How does ${names[s1]} compare with ${names[s2]}?`);
const wantCmp = Advisor.answer(`How does ${names[s1]} compare with ${names[s2]}?`, { scenario: defaultSc, refs, reference, states, cells, nearbyById, gridMeta: gridSnap.meta, nriVersion: reference.fema.nriVersion[0] });
ok(ans.includes(wantCmp.headline) && wantCmp.paragraphs.every((t) => ans.includes(t)), 'advisor answer on the page equals the engine-built answer: ' + wantCmp.headline);
ok(['Measured', 'Modelled', 'Assumption'].every((t) => new RegExp(t, 'i').test(ans)) && ans.includes('Not assessed and missing evidence'), 'the answer separates measured, modelled and assumed, and lists what is missing');
ok((await askAdv('what is the meaning of life')).includes('I can answer questions like these'), 'an unrecognised question gets the help list');
ok(await p.ev(`document.querySelectorAll('#adv-chips button').length`) === Advisor.HELP.length, 'example question chips are offered');
await p.shotEl('ii-advisor', '.ii-advisor', 10);
ok(p.errors.length === 0, `no JS errors across all interactions (${p.errors.length})${p.errors.length ? ' ' + p.errors.slice(0, 3).join(' | ') : ''}`);
ok(p.failed.length === 0, `no failed resources (${p.failed.length})${p.failed.length ? ' ' + p.failed.slice(0, 3).join(' | ') : ''}`);
await p.close();

// ======================================================================== F. failure behaviour
console.log('\n=== F. failure behaviour ===');
// F1 the budget is nearly used up: the page must not call the API and must fall back to the stored grid
stats = {};
const nowMs = Date.now();
p = await freshPage(b, { width: 1400, height: 900, mocks: mocksFor({ stats }) }, ledgerScript([[nowMs - 120000, 3990]]));
await ready(p); stats.archive = [];
await clickMap(p, 39.04, -77.49);
ok(await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000), 'budget exhausted: the page still produces an analysis');
ok((stats.archive || []).length === 0, 'budget exhausted: no archive request was sent');
const warn = await p.ev(`(document.querySelector('#ii-loc .ii-warn') || {}).textContent`);
ok(/Live history could not be used/.test(warn) && /nearest precomputed grid cell/.test(warn) && /km away/.test(warn), 'budget exhausted: a clear fallback notice is shown: ' + (warn || '').slice(0, 130));
ok(/precomputed grid cell/.test(await p.ev(`document.getElementById('ii-loc').textContent`)), 'the climate source is labelled as the precomputed grid cell');
ok(/This hour: 3,9\d\d of 4,000/.test(await p.ev(`document.getElementById('ii-usage').textContent`)), 'the usage meter reflects the stored ledger');
await p.close();

// F2 the API says 429
stats = {};
p = await freshPage(b, { width: 1400, height: 900, mocks: mocksFor({ stats, archiveStatus: 429 }) });
await ready(p); stats.archive = [];
await clickMap(p, 39.04, -77.49);
ok(await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000), 'API limit (429): the page falls back and still produces an analysis');
ok(/limit/i.test(await p.ev(`(document.querySelector('#ii-loc .ii-warn') || {}).textContent`)), 'API limit: the notice names the limit');
ok(/paused by the API/.test(await p.ev(`document.getElementById('ii-usage').textContent`)), 'API limit: the usage meter shows the pause');
const n429 = stats.archive.length; await clickMap(p, 36, -95); await sleep(2500);
ok(stats.archive.length === n429, 'API limit: no further requests are sent while the API has paused us');
await p.close();

// F3 FEMA is down: hazard Not Assessed, the rest still works
stats = {};
p = await freshPage(b, { width: 1400, height: 900, mocks: mocksFor({ stats, femaStatus: 500 }) });
await ready(p);
await clickMap(p, 39.04, -77.49); await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(800);
const loc3 = await p.ev(`document.getElementById('ii-loc').textContent`);
ok(/Not assessed: FEMA National Risk Index is not reachable/.test(loc3) && await p.ev(`!!document.querySelector('#ii-loc button.ii-link')`), 'FEMA outage: hazard shown as Not assessed with a retry button');
const envRow = await p.ev(`(() => { const r = [...document.querySelectorAll('#ii-loc .ii-frow')].find((x) => x.textContent.startsWith('Environmental risk')); return r && r.textContent; })()`);
ok(/Not assessed/.test(envRow) && /Left out and not assumed/.test(envRow), 'FEMA outage: the environmental factor is left out and not assumed');
ok(/Partial assessment/.test(loc3) && /Weight assessed: 85%/.test(loc3), 'FEMA outage: the score is labelled partial and shows 85% of the weight assessed');
const u3 = new URL(stats.archive[0]), expNoFema = expected(+u3.searchParams.get('latitude'), +u3.searchParams.get('longitude'), {}, null);
ok(+await p.ev(`document.querySelector('#ii-loc .ii-ring b').textContent`) === Math.round(expNoFema.result.scoring.overall.score), 'FEMA outage: partial score equals the engine partial score without that factor');
await p.close();

// F4 data files missing
p = await freshPage(b, { width: 1400, height: 900, mocks: mocksFor({ loadFail: true }) });
await ready(p);
ok(await p.ev(`document.getElementById('mode-suit').disabled && document.getElementById('mode-climate').disabled && document.getElementById('mode-existing').getAttribute('aria-pressed') === 'true'`), 'no climate grid: analysis modes are disabled and the page falls back to existing data centers');
await clickMap(p, 39.04, -77.49); ok(await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000), 'no climate grid: live analysis of a clicked point still works');
ok((await p.ev(`document.getElementById('rank-note').textContent`)).includes('not available'), 'no climate grid: the ranking explains it is unavailable');
const noGridAns = await p.ev(`(() => { document.getElementById('adv-q').value = 'How does Texas compare with Virginia?'; document.getElementById('adv-form').requestSubmit(); return new Promise((r) => setTimeout(() => r(document.getElementById('adv-answer').textContent), 400)); })()`);
ok(noGridAns.includes('climate-grid.json'), 'no climate grid: the advisor says it needs the grid and does not guess');
await p.close(); b.close();
console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nALL INVESTMENT INTELLIGENCE CHECKS PASSED'); process.exit(bad ? 1 : 0);
