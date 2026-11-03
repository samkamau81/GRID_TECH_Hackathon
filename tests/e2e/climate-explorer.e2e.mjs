// End-to-end test for the three-tab app and the Data Center Climate Explorer (peak-power/data-centers.html).
// Open-Meteo is mocked, so no part of the free allowance is used. Expected counts are read from the geojson independently of the page.
// Usage: node tests/e2e/climate-explorer.e2e.mjs
import fs from 'node:fs';
import { launch, openPage, openMeteoMocks, sleep, BASE, ROOT } from './lib.mjs';

const gj = JSON.parse(fs.readFileSync(ROOT + '/peak-power/data/processed/data-centers.geojson', 'utf8'));
const feats = gj.features.map((f) => f.properties);
const total = feats.length, us = feats.filter((p) => p.iso2 === 'US').length;
const tx = feats.filter((p) => p.iso2 === 'US' && p.state === 'TX').length;
let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const fmt = (n) => n.toLocaleString('en-US');

const b = await launch();
try {
  // ---- three tabs on every page
  for (const [page, sel] of [['index.html', 'header.nav nav a'], ['data-centers.html', 'header.nav nav a'], ['prototype.html', 'nav.sitelinks a']]) {
    const p = await openPage(b, { url: BASE + page });
    const links = JSON.parse(await p.ev(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel)})].map(a => [a.textContent.trim(), a.getAttribute('href')]))`));
    ok(links.length === 3, `${page}: exactly three nav tabs (${links.map((l) => l[0]).join(' | ')})`);
    ok(links.map((l) => l[1]).join() === 'index.html,prototype.html,data-centers.html', `${page}: tabs go to Introduction, Prototype, Data Center Climate Explorer`);
    ok(!/investment/i.test(await p.ev('document.body.innerText + document.documentElement.innerHTML')), `${page}: no Investment Intelligence text or links`);
    ok(p.errors.length === 0, `${page}: no JS errors ${p.errors.join(' ; ')}`);
    await p.close();
  }

  // ---- explorer, mocked weather
  const calls = { current: [], geocode: [] };
  const p = await openPage(b, { url: BASE + 'data-centers.html', mocks: openMeteoMocks({ onCurrent: (u) => calls.current.push(u), onGeocode: (u) => calls.geocode.push(u) }) });
  ok(await p.waitFor(`document.getElementById('map-overlay').classList.contains('hidden') && document.querySelectorAll('#stats .stat').length >= 4`), 'explorer loads');
  ok(/Data Center Climate Explorer/.test(await p.ev('document.querySelector("h1").textContent')), 'page title is Data Center Climate Explorer');
  const cards = JSON.parse(await p.ev(`JSON.stringify([...document.querySelectorAll('#stats .stat')].map(c => c.innerText.replace(/\\s+/g,' ')))`));
  ok(cards[0].includes(fmt(total)), `total card shows ${fmt(total)} from the dataset (${cards[0]})`);
  ok(cards[1].includes(fmt(us)), `US card shows ${fmt(us)} (${cards[1]})`);
  ok(calls.current.length === 0, 'no weather requested on load');
  ok(!(await p.ev("/investment|suitability|ROI|payback/i.test(document.querySelector('main').innerText)")), 'no investment or scoring text in the explorer');

  // US view and state filter: counts from the data
  await p.click('#view-us');
  ok(await p.waitFor(`document.getElementById('status').textContent.includes('Showing ${fmt(us)} of ${fmt(total)}')`), `US view shows ${fmt(us)} of ${fmt(total)}`);
  await p.ev(`(() => { const s = document.getElementById('f-state'); s.value = 'TX'; s.dispatchEvent(new Event('change')); })()`);
  ok(await p.waitFor(`document.getElementById('status').textContent.includes('Showing ${fmt(tx)} of ${fmt(total)}')`), `Texas filter shows ${fmt(tx)}`);
  await p.click('#f-reset');
  await p.click('#view-global');
  await sleep(1800);   // let the zoom animation settle: switching layers mid-animation can throw inside markercluster's own timer
  await p.click('#mode-markers');
  await sleep(500);

  // data center popup with weather
  await p.ev(`(() => { const m = window.__maps[0]; let done = false; m.eachLayer(function walk(l) { if (!done && l instanceof L.CircleMarker && l.getPopup()) { done = true; l.openPopup(); } }); })()`);
  ok(await p.waitFor(`document.querySelector('.leaflet-popup .wx dd')`), 'data center popup shows weather');
  const pop = await p.ev(`document.querySelector('.leaflet-popup').innerText.replace(/\\s+/g,' ')`);
  ok(/Current local weather/.test(pop) && /53\.4 °F/.test(pop) && /7\.2 mph/.test(pop) && /61 %/.test(pop) && /Overcast/.test(pop), `popup values and units from the API response (${pop.slice(0, 160)}...)`);
  ok(/Coordinates/.test(pop) && /Open-Meteo/.test(pop), 'popup shows coordinates and Open-Meteo attribution');
  ok(calls.current.length === 1, 'exactly one weather request for one selection');
  const q = new URL(calls.current[0]).searchParams;
  ok(q.get('temperature_unit') === 'fahrenheit' && q.get('wind_speed_unit') === 'mph', 'request uses fahrenheit and mph');

  // map click
  await p.ev(`(() => { const m = window.__maps[0]; m.closePopup(); m.fire('click', { latlng: L.latLng(31.0, -97.5) }); })()`);
  ok(await p.waitFor(`document.querySelector('.leaflet-popup .wx dd') && /Selected location/.test(document.querySelector('.leaflet-popup').innerText)`), 'map click shows weather for the selected point');

  // place search
  await p.ev(`(() => { document.getElementById('wx-q').value = 'Ashburn'; document.getElementById('wx-form').dispatchEvent(new Event('submit', { cancelable: true })); })()`);
  ok(await p.waitFor(`document.querySelector('#wx-results button')`), 'place search lists results');
  ok(calls.geocode.length === 1 && new URL(calls.geocode[0]).searchParams.get('countryCode') === 'US', 'search is limited to the US by default');
  await p.click('#wx-results button');
  ok(await p.waitFor(`/Ashburn/.test(document.querySelector('.leaflet-popup')?.innerText || '') && document.querySelector('.leaflet-popup .wx dd')`), 'chosen place shows weather');
  ok(p.errors.length === 0, 'no JS errors in the explorer ' + p.errors.join(' ; '));
  await p.shot('explorer-desktop');
  await p.close();

  // ---- weather failure keeps the facility information
  const f = await openPage(b, { url: BASE + 'data-centers.html', mocks: openMeteoMocks({ failCurrent: true }) });
  await f.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
  await sleep(1800); await f.click('#mode-markers'); await sleep(500);
  await f.ev(`(() => { const m = window.__maps[0]; let done = false; m.eachLayer(function (l) { if (!done && l instanceof L.CircleMarker && l.getPopup()) { done = true; l.openPopup(); } }); })()`);
  ok(await f.waitFor(`/Weather unavailable/.test(document.querySelector('.leaflet-popup .wx')?.innerText || '')`), 'API failure shows a clear weather-unavailable message');
  ok(await f.ev(`!!document.querySelector('.leaflet-popup h3') && !!document.querySelector('.leaflet-popup dl')`), 'facility information stays visible when weather fails');
  await f.close();

  // ---- mobile
  const m = await openPage(b, { url: BASE + 'data-centers.html', width: 390, height: 800, mocks: openMeteoMocks() });
  await m.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
  ok(await m.ev('document.documentElement.scrollWidth <= window.innerWidth'), 'explorer has no horizontal scroll at 390px');
  ok(await m.ev(`[...document.querySelectorAll('header.nav nav a')].every(a => a.offsetParent !== null)`), 'all three tabs are visible on mobile');
  await m.shot('explorer-mobile');
  await m.close();
} finally { b.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
