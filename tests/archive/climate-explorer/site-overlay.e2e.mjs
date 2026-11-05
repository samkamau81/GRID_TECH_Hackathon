// End-to-end test for the Explorer's county-grade layer, power-plant layer and site brief (peak-power/data-centers.html).
// Open-Meteo is mocked. The last block opens the Prototype and checks the exported grades and delay results still match its live code (staleness check).
// Usage: node tests/e2e/site-overlay.e2e.mjs      (about a minute)
import { launch, openPage, openMeteoMocks, sleep, BASE } from './lib.mjs';

let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch();
try {
  const archive = [];
  const p = await openPage(b, { url: BASE + 'data-centers.html', mocks: openMeteoMocks({ onArchive: (u) => archive.push(u) }) });
  await p.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
  const reqBefore = p.requests.filter((u) => /county-outlines|eia860|site-grades/.test(u)).length;
  ok(reqBefore === 0, 'no US site data is downloaded until it is needed');
  ok(await p.ev(`!document.getElementById('brief') || document.getElementById('brief').hidden`), 'the site brief starts closed');
  ok(await p.ev(`!!document.getElementById('brief-hint') && !document.getElementById('brief-hint').hidden`), 'a hint tells the user how to open a brief');

  // ---- county grades layer
  await p.click('#ov-counties');
  ok(await p.waitFor(`document.getElementById('ov-counties').getAttribute('aria-pressed') === 'true' && (() => { let n = 0; window.__maps[0].eachLayer(l => { if (l instanceof L.Polygon && l._fips) n++; }); return n > 3000; })()`, 60000), 'County grades draws 3,000+ county polygons');
  ok(await p.ev(`!document.getElementById('ov-layer-wrap').hidden && document.querySelectorAll('#ov-layer option').length === 7`), 'a grade selector with seven choices appears');
  ok(await p.ev(`/County grade/.test(document.querySelector('.legend-body').innerText) && /Good/.test(document.querySelector('.legend-body').innerText) && /Not graded/.test(document.querySelector('.legend-body').innerText)`), 'legend explains the county colours');
  const colourOf = (f) => `(() => { let c; window.__maps[0].eachLayer(l => { if (l._fips === '${f}') c = l.options.fillColor; }); return c; })()`;
  const overall = await p.ev(colourOf('51107'));
  await p.ev(`(() => { const s = document.getElementById('ov-layer'); s.value = 'haz'; s.dispatchEvent(new Event('change')); })()`);
  const haz = await p.ev(colourOf('51107'));
  const G = await p.ev(`window.PEAKPOWER_SITE_GRADES.g['51107']`);
  const HEX = ['#0a8250', '#c98500', '#c0392b', '#9aa7ad', '#0a5c0a'];
  ok(overall === HEX[+G[0]] && haz === HEX[+G[6]], `Loudoun County is coloured by the Prototype's grade (overall ${G[0]}, hazard ${G[6]})`);
  ok(await p.ev(`/Natural hazard/.test(document.querySelector('.legend-body').innerText)`), 'legend follows the chosen grade');

  // ---- power plants layer
  await p.click('#ov-plants');
  ok(await p.waitFor(`document.getElementById('ov-plants').getAttribute('aria-pressed') === 'true' && /Power plants \\(EIA-860\\)/.test(document.querySelector('.legend-body').innerText)`, 30000), 'Power plants layer turns on with its legend');
  ok(await p.waitFor(`(() => { let n = 0; window.__maps[0].eachLayer(l => { if (l instanceof L.CircleMarker && l._mw !== undefined) n++; }); return n > 100; })()`), 'large plants are drawn at the national zoom');
  await p.ev(`(window.__maps[0].setView([39.04, -77.49], 9, { animate: false }), 0)`);
  await sleep(500);
  const near = await p.ev(`(() => { let n = 0; window.__maps[0].eachLayer(l => { if (l instanceof L.CircleMarker && l._mw !== undefined) n++; }); return n; })()`);
  ok(near > 20, `more plants appear when zoomed in (${near})`);

  // ---- site brief for Loudoun County, VA (Ashburn)
  await p.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(39.04, -77.49) }), 0)`);
  ok(await p.waitFor(`!document.getElementById('brief').hidden && /Loudoun County, VA/.test(document.getElementById('brief-sub').textContent)`, 30000), 'clicking Ashburn opens a brief naming Loudoun County, VA');
  ok(await p.waitFor(`document.querySelector('#brief .overall .gp')`), 'overall grade is shown');
  const overallTxt = await p.ev(`document.querySelector('#brief .overall .gp').textContent`);
  ok(['Good', 'Moderate', 'Bad', 'Excellent', 'Not graded'].includes(overallTxt) && overallTxt === ['Good', 'Moderate', 'Bad', 'Not graded', 'Excellent'][+G[0]], `overall grade matches the Prototype (${overallTxt})`);
  ok(await p.ev(`[...document.querySelectorAll('#brief .chip-k')].map(e => e.textContent).join('|').includes('Time to power') && document.querySelectorAll('#brief .chips .gp').length >= 4`), 'headline chips: time to power, hazard, policy, cooling climate');
  ok(await p.waitFor(`/What this means for a 75 MW plan/.test(document.getElementById('brief-body').innerText)`), 'plan impact section is shown');
  const brief = await p.ev(`document.getElementById('brief-body').innerText.replace(/\\s+/g, ' ')`);
  ok(/Time to power is Moderate/.test(brief) && /about 6 months late/.test(brief) && /month 18/.test(brief) && /month 24/.test(brief), 'PJM wait (Moderate) maps to the 6-month delay case from the Prototype engine');
  ok(/Power cost per MWh/.test(brief) && /Carbon intensity/.test(brief) && /10-year profit\*/.test(brief) && /business assumption/.test(brief), 'cost, carbon and profit shown, with profit labelled as a business assumption');
  ok(/not modelled outside Texas/.test(brief), 'the ERCOT-only limit is stated next to the numbers');
  ok(/Power around here/.test(brief) && /zero-carbon share/.test(brief) && /EIA-860/.test(brief), 'nearby generation section with its caveat');
  ok(await p.ev(`document.querySelectorAll('#brief .stack i').length >= 2 && document.querySelectorAll('#brief ol.plants li').length >= 1`), 'generation mix bar and largest plants list');
  ok(await p.waitFor(`document.querySelector('#brief .tiles.t5')`, 30000), 'cooling climate tiles load');
  const clim = await p.ev(`document.getElementById('brief-body').innerText.replace(/\\s+/g, ' ')`);
  ok(/cooling degree days a year/.test(clim) && /95th-percentile temperature/.test(clim) && /humid hours a year/.test(clim) && /hours a year at 95/.test(clim), 'climate tiles: degree days, 95th percentile, hot hours, humid hours');
  ok(await p.ev(`document.querySelectorAll('#brief svg.mchart path.bar').length === 12 && document.querySelectorAll('#brief .stack.tall i').length >= 2`), 'monthly degree-day chart (12 bars) and the cooling-need band');
  ok(await p.ev(`/(Mild|Moderate|Demanding)/.test(document.querySelector('#brief .clim-lead .gp').textContent)`), 'climate grade is Mild, Moderate or Demanding');
  ok(archive.length === 1, 'one history request for one point');
  const au = new URL(archive[0]).searchParams;
  ok(au.get('start_date') === '2023-01-01' && au.get('end_date') === '2025-12-31' && au.get('hourly') === 'temperature_2m,relative_humidity_2m', 'history request covers three full years of hourly temperature and humidity');
  ok(await p.ev(`[...document.querySelectorAll('#brief .frow')].length === 8`), 'all eight Prototype factors listed with a reason');
  ok(!(await p.ev(`document.getElementById('brief').innerHTML.includes('<script')`)), 'no script markup in the brief');
  await p.shot('site-brief-desktop');

  // ---- Texas county where time to power is Good: the on-time plan applies
  await p.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(30.27, -97.74) }), 0)`);
  ok(await p.waitFor(`/Travis County, TX/.test(document.getElementById('brief-sub').textContent) && /on-time plan applies/.test(document.getElementById('brief-body').innerText)`, 20000), 'Travis County: Good time to power shows the on-time plan');
  ok(await p.ev(`/ERCOT load zone/.test(document.getElementById('brief-body').innerText)`), 'Texas county shows its ERCOT energy grade reason');

  // ---- outside the US: climate only, with an honest message
  await p.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(51.5, -0.12) }), 0)`);
  ok(await p.waitFor(`/cover the United States only/.test(document.getElementById('brief-body').innerText) && document.querySelector('#brief .tiles.t5')`, 20000), 'a non-US point shows the cooling climate and says the rest is US only');
  ok(archive.length === 3, `each new point makes its own history request (${archive.length})`);

  // ---- same cell again: served from the cache
  await p.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(51.51, -0.11) }), 0)`);
  await p.waitFor(`document.querySelector('#brief .tiles.t5')`);
  ok(archive.length === 3, 'a point in the same 0.1 degree cell reuses the cached history');

  // ---- close
  await p.click('#brief-close');
  ok(await p.ev(`document.getElementById('brief').hidden && !document.getElementById('map-stage').classList.contains('has-brief')`), 'closing the brief restores the full-width map');
  ok(p.errors.length === 0, 'no JS errors ' + p.errors.join(' ; '));
  ok(p.failed.length === 0, 'no failed requests ' + p.failed.join(' ; '));
  await p.close();

  // ---- the history request failing keeps the rest of the brief
  const f = await openPage(b, { url: BASE + 'data-centers.html', mocks: openMeteoMocks({ failArchive: true }) });
  await f.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
  await f.ev(`(localStorage.clear(), 0)`);   // the earlier page cached this point's climate for 90 days: start from empty
  await f.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(39.04, -77.49) }), 0)`);
  ok(await f.waitFor(`/Climate history unavailable/.test(document.getElementById('brief-body').innerText) && document.querySelector('#brief .overall .gp')`, 30000), 'history failure shows a message and keeps the grades');
  ok(await f.ev(`!!document.querySelector('#brief .bmsg.err button')`), 'a retry button is offered');
  await f.close();

  // ---- mobile: the brief stacks under the map with no horizontal scroll
  const m = await openPage(b, { url: BASE + 'data-centers.html', width: 390, height: 800, mocks: openMeteoMocks() });
  await m.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
  await m.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(39.04, -77.49) }), 0)`);
  await m.waitFor(`document.querySelector('#brief .tiles.t5')`, 30000);
  ok(await m.ev('document.documentElement.scrollWidth <= window.innerWidth'), 'no horizontal scroll at 390px with the brief open');
  ok(await m.ev(`(() => { const a = document.getElementById('map').getBoundingClientRect(), c = document.getElementById('brief').getBoundingClientRect(); return c.top >= a.bottom - 1; })()`), 'the brief sits below the map on a phone');
  await m.shot('site-brief-mobile', true);
  await m.close();

  // ---- staleness: the exported grades and delay results must equal what the Prototype computes now
  const proto = await openPage(b, { url: BASE + 'prototype.html' });
  ok(await proto.waitFor(`!!window.PEAKPOWER_PROTOTYPE_API`, 60000), 'the Prototype exposes its read-only grading hook');
  const mism = JSON.parse(await proto.ev(`(() => { const A = PEAKPOWER_PROTOTYPE_API, g = ${JSON.stringify('x')}; return JSON.stringify(A.MAPD.c.map(c => [c.f, String(A.cOverall(c)) + c.r.slice(0, 8).join('')])); })()`));
  const exported = JSON.parse(await (async () => { const q = await openPage(b, { url: BASE + 'data-centers.html' }); await q.ev(`new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/data/site-grades.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); })`); const r = await q.ev(`JSON.stringify({ g: window.PEAKPOWER_SITE_GRADES.g, d: window.PEAKPOWER_SITE_GRADES.delay })`); await q.close(); return r; })());
  const stale = mism.filter(([f, s]) => exported.g[f] !== s);
  ok(stale.length === 0 && mism.length === Object.keys(exported.g).length, `all ${mism.length} county grades equal the Prototype's live grades${stale.length ? ' (stale: ' + stale.slice(0, 3).map((x) => x[0]).join(',') + ')' : ''}`);
  const live6 = JSON.parse(await proto.ev(`JSON.stringify(PEAKPOWER_PROTOTYPE_API.delayCase(6))`));
  const exp6 = exported.d.find((d) => d.months === 6);
  ok(live6.open === exp6.open && Math.abs(live6.total - exp6.total) < 1 && Math.abs(live6.kg - exp6.kg) < 1e-6, 'the exported 6-month delay case equals the Prototype engine result');
  await proto.close();
} finally { b.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
