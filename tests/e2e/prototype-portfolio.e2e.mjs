// End-to-end test for the migrated Prototype (peak-power/prototype.html, split from the Claude Artifact): portfolio, nine comparison
// dimensions, Find a site (Texas and US county map), change tracking across visits, the four steps, and the V2 data underneath.
// Usage: node tests/e2e/prototype-portfolio.e2e.mjs      (takes about 2 minutes: the portfolio is simulated in the browser)
import fs from 'node:fs';
import { launch, openPage, BASE, ROOT, sleep } from './lib.mjs';

let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const NL = 'String.fromCharCode(10)';
const w = {};
new Function('window', fs.readFileSync(ROOT + '/peak-power/js/data/site-counties.js', 'utf8'))(w);
const MAP = w.PEAKPOWER_SITE_MAP, TX = MAP.c.filter((c) => c.f.startsWith('48')).length;

const b = await launch();
try {
  const p = await openPage(b, { url: BASE + 'prototype.html', width: 1400, height: 900 });
  const text = (sel) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.split(${NL}).join(' | ') : ''; })()`);
  ok(await p.waitFor(`document.querySelectorAll('#pf-cards > *').length === 4`, 120000), 'portfolio shows four project cards');

  // navigation and structure
  const nav = JSON.parse(await p.ev(`JSON.stringify([...document.querySelectorAll('nav.sitelinks a')].map(a => a.getAttribute('href')))`));
  ok(nav.join() === 'index.html,prototype.html,appendix.html', 'site navigation has exactly three tabs');
  ok((await p.ev(`document.querySelectorAll('.steps button').length`)) === 4, 'prototype has its four steps (Portfolio, Project plan, Run the plant, Live Operations)');
  ok(!/investment intelligence/i.test(await p.ev('document.body.innerText')), 'no Investment Intelligence tab or text');

  // nine comparison dimensions
  const cardText = await text('#pf-cards > *');
  const want = ['Location', 'Energy', 'Policy', 'Fiber', 'Land', 'Grid reliability', 'Water', 'Hazard', 'Time to power'];
  ok(want.every((d) => cardText.includes(d)), 'first project card carries all nine dimensions: ' + want.join(', '));
  ok((await p.ev(`document.querySelectorAll('#pf-proj .dimrow').length`)) === 9, 'the comparison list has nine rows');
  ok(await p.ev(`!!document.querySelector('#pf-gantt svg')`), 'timeline ("When each could open") is drawn');

  // switching between projects
  const opts = JSON.parse(await p.ev(`JSON.stringify([...document.querySelectorAll('#proj option')].map(o => [o.value, o.textContent]))`));
  ok(opts.length === 5, 'project selector lists all projects plus the portfolio view');
  await p.ev(`(() => { const s = document.getElementById('proj'); s.value = s.options[2].value; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  ok(await p.waitFor(`document.getElementById('hdr-site').innerText.indexOf('Ellis') >= 0`, 60000), 'switching project updates the header (Ellis County)');
  await p.ev(`(() => { const s = document.getElementById('proj'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);

  // Find a site: Texas, then the whole US
  ok((await p.ev(`document.querySelectorAll('#map path.cty').length`)) === TX, `Texas map shows ${TX} counties`);
  await p.click('#map-scope [data-scope="us"]');
  ok(await p.waitFor(`document.querySelectorAll('#map path.cty').length === ${MAP.c.length}`, 30000), `US map shows ${MAP.c.length} counties`);
  const fips = JSON.parse(await p.ev(`JSON.stringify([...document.querySelectorAll('#map path.cty')].map(e => e.dataset.f))`));
  ok(new Set(fips).size === fips.length && fips.every((f) => /^[0-9]{5}$/.test(f)), 'county identifiers are unique five-digit FIPS codes');
  const fill0 = await p.ev(`document.querySelector('#map path.cty[data-f="48453"]').getAttribute('fill')`);
  await p.ev(`[...document.querySelectorAll('#map-layers button, #map-layers2 button')].find(b => b.textContent === 'Water').click()`);
  ok(await p.waitFor(`document.querySelector('#map path.cty[data-f="01001"]').getAttribute('fill-opacity') !== null`, 5000), 'switching the map layer recolors counties');
  await p.ev(`document.querySelector('#map path.cty[data-f="01001"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  ok(await p.waitFor(`document.getElementById('cdet').innerText.indexOf('Autauga') >= 0`, 10000), 'clicking a county opens its detail (Autauga, AL)');
  const det = await text('#cdet');
  ok(/Energy availability \| Not graded/.test(det) && /ERCOT only/.test(det), 'a county outside Texas shows Energy as "Not graded", explained (the dispatch model covers ERCOT only), not an invented value');
  await p.click('#map-scope [data-scope="tx"]');
  await p.ev(`document.querySelector('#map path.cty[data-f="48453"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  ok(await p.waitFor(`document.getElementById('cdet').innerText.indexOf('Travis') >= 0`, 10000), 'Texas filter: Travis County can be selected');
  ok(await p.ev(`document.querySelector('details.fold .gl2') !== null && document.querySelectorAll('details.fold .gl2 li').length >= 5`), 'the collapsible "Where these grades come from" source list is present');

  // change tracking: first visit on this browser, then a return visit
  ok(await p.waitFor(`document.getElementById('scr-alert').innerText.indexOf('Checking your projects') < 0`, 240000), 'portfolio simulation finishes');
  ok(/first visit on this browser/.test(await text('#scr-alert')), 'What changed: first visit is reported as such');
  ok(await p.ev(`!!localStorage.getItem('pp_snap_v1')`), 'the visit snapshot is stored (the only persistence, as in the artifact)');
  ok(/If the pause lifts/.test(await text('#scr-alert')), 'What to watch: the Texas permit pause is listed with its effect on each project');

  // the four steps, on the V2 data
  await p.click('.next [data-open="1"]');
  ok(await p.waitFor(`!document.getElementById('v-1').hidden`, 30000), 'Open selected project goes to the Project plan');
  ok(await p.waitFor(`document.getElementById('pipe').innerText.indexOf('up to 53 MW') >= 0`, 60000), 'Energy section shows the V2 battery limit (up to 53 MW)');
  ok(await p.waitFor(`document.querySelector('#pipe').innerText.indexOf('$45/MWh') >= 0`, 5000), 'Energy section shows the V2 wind price ($45/MWh)');
  // the app ignores a tab click until the project plan has been computed, so retry the click until it takes effect
  const goTo = async (tab, view) => { const t0 = Date.now(); while (Date.now() - t0 < 180000) { await p.click(tab); if (await p.waitFor(`!document.getElementById('${view}').hidden`, 4000)) return true; } return false; };
  ok(await goTo('#tab-2', 'v-2') && await p.waitFor(`document.getElementById('v-2').innerText.length > 200`, 60000), 'Run the plant (board review) renders');
  ok(await goTo('#tab-3', 'v-3') && await p.waitFor(`document.getElementById('v-3').innerText.length > 100`, 60000), 'Live Operations renders');
  ok(/symposium packet/.test(await p.ev('document.body.innerText')), 'footer states the symposium packet as the data source');
  ok(p.errors.length === 0, 'no JavaScript errors in these flows ' + p.errors.slice(0, 2).join(' ; '));
  await p.shot('prototype-portfolio-desktop');

  // return visit: same browser profile, previous snapshot exists
  const q = await openPage(b, { url: BASE + 'prototype.html', width: 1400, height: 900 });
  ok(await q.waitFor(`document.getElementById('scr-alert').innerText.indexOf('Checking your projects') < 0 && document.getElementById('scr-alert').innerText.length > 100`, 240000), 'return visit: simulation finishes');
  const again = await q.ev(`document.getElementById('scr-alert').innerText.split(${NL}).join(' | ')`);
  ok(/Nothing has moved/.test(again) && !/first visit on this browser/.test(again), 'return visit: compares with the stored snapshot ("Nothing has moved")');
  ok(q.errors.length === 0, 'return visit: no JavaScript errors');
  await q.close();

  // mobile
  const m = await openPage(b, { url: BASE + 'prototype.html', width: 390, height: 800 });
  ok(await m.waitFor(`document.querySelectorAll('#pf-cards > *').length === 4`, 120000), 'mobile: portfolio renders');
  ok(await m.ev('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobile: no horizontal scroll');
  ok(m.errors.length === 0, 'mobile: no JavaScript errors');
  await m.shot('prototype-portfolio-mobile');
  await m.close();
} finally { b.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
