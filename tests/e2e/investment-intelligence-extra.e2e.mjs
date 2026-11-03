// Responsive layout, keyboard, contrast and HTML-injection checks.
import fs from 'node:fs';
import { launch, openPage, openMeteoMocks, sleep, BASE, helpers } from './lib.mjs';
const { ROOT } = helpers;
const PROC = ROOT + '/peak-power/data/processed/';
const gridSnap = JSON.parse(fs.readFileSync(PROC + 'climate-grid.json', 'utf8'));
let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch();
const gridMock = { re: /climate-grid\.json/, pattern: '*climate-grid.json*', handler: async () => ({ body: gridSnap }) };
const mocks = () => [...openMeteoMocks({}), gridMock];
async function fresh(opts) {
  const q = await openPage(b, { ...opts, url: 'about:blank' });
  await q.S('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
  const done = new Promise((r) => b.listeners.push((m) => { if (m.method === 'Page.loadEventFired') r(); }));
  await q.S('Page.navigate', { url: BASE + (opts.page || 'investment-intelligence.html') }); await done;
  await q.waitFor(`document.getElementById('ii-overlay') ? document.getElementById('ii-overlay').classList.contains('hidden') : true`, 45000); await sleep(1000); return q;
}
const rect = (p, sel) => p.ev(`JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, r: r.right + scrollX, b: r.bottom + scrollY }; })())`).then(JSON.parse);

// ---------------------------------------------------------------- responsive layouts
console.log('=== layouts ===');
for (const [W, H, name] of [[1700, 1000, 'wide'], [1400, 900, 'desktop'], [1200, 900, 'medium'], [820, 1000, 'tablet'], [390, 800, 'phone']]) {
  const p = await fresh({ width: W, height: H, mocks: mocks() });
  const over = await p.ev(`document.documentElement.scrollWidth - window.innerWidth`);
  ok(over <= 0, `${name} ${W}px: no horizontal overflow (${over})`);
  const m = await rect(p, '#ii-map'), c = await rect(p, '.ii-controls'), pan = await rect(p, '#ii-panel');
  if (W >= 1481) ok(c.x < m.x && m.x < pan.x && Math.abs(c.y - m.y) < 40, `${name}: three columns (controls | map | panel): x ${Math.round(c.x)} < ${Math.round(m.x)} < ${Math.round(pan.x)}`);
  else if (W > 900) ok(pan.x > m.x + m.w - 4 && c.y > m.b - 4 && Math.abs(pan.y - m.y) < 40, `${name}: map beside the panel, controls below (map ${Math.round(m.w)}px wide)`);
  else ok(m.y < pan.y && pan.y < c.y && m.w > W - 60, `${name}: stacked as map, panel, controls (map ${Math.round(m.w)}px of ${W})`);
  ok(m.w >= (W >= 1481 ? 700 : W > 900 ? 600 : W - 50), `${name}: the map is usable (${Math.round(m.w)} x ${Math.round(m.h)})`);
  const btn = await p.ev(`Math.min(...[...document.querySelectorAll('.ii-seg button')].map((x) => x.getBoundingClientRect().height))`);
  ok(btn >= 32, `${name}: toolbar buttons are tall enough to tap (${Math.round(btn)}px)`);
  if (W === 390) { await p.shot('ii-phone', true); }
  if (W === 1700) await p.shot('ii-wide');
  ok(p.errors.length === 0, `${name}: no JS errors`);
  await p.close();
}

// ---------------------------------------------------------------- contrast
console.log('\n=== text contrast (WCAG AA: 4.5:1 for normal text) ===');
const contrastJs = `(() => {
  const parse = (s) => { let m = s.match(/rgba?\\(([^)]+)\\)/); if (m) { const v = m[1].split(',').map((x) => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; }
    m = s.match(/color\\(srgb ([^)]+)\\)/); if (m) { const parts = m[1].split('/'), v = parts[0].trim().split(/\\s+/).map(parseFloat); return { r: v[0] * 255, g: v[1] * 255, b: v[2] * 255, a: parts[1] ? parseFloat(parts[1]) : 1 }; } return null; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { let stack = []; for (let e = el; e; e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor, c = parse(bg); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let under = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; if (under.a < 1) under = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) under = blend(stack[i], under); return under; };
  return (sel) => { const el = document.querySelector(sel); if (!el) return null; const fg = parse(getComputedStyle(el).color), bg = bgOf(el), f = blend(fg, bg), l1 = lum(f), l2 = lum(bg); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2); };
})()`;
for (const dark of [false, true]) {
  const p = await fresh({ width: 1400, height: 900, dark, mocks: mocks() });
  await p.ev(`void __maps[0].setView([39.04, -77.49], 10, {animate:false})`); await sleep(1200);
  const pt = JSON.parse(await p.ev(`JSON.stringify(__maps[0].latLngToContainerPoint([39.04, -77.49]))`)), r = JSON.parse(await p.ev(`JSON.stringify(document.getElementById('ii-map').getBoundingClientRect())`));
  await p.ev(`document.getElementById('ii-map').scrollIntoView({behavior:'instant', block:'center'})`); await sleep(300);
  const r2 = JSON.parse(await p.ev(`JSON.stringify(document.getElementById('ii-map').getBoundingClientRect())`));
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await p.S('Input.dispatchMouseEvent', { type, x: r2.x + pt.x, y: r2.y + pt.y, button: 'left', clickCount: 1 });
  await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000); await sleep(800);
  await p.ev(`document.getElementById('adv-q').value = 'Which states score highest?'; document.getElementById('adv-form').requestSubmit()`); await sleep(400);
  const get = await p.ev(`window.__c = ${contrastJs}; 0`);
  const sels = ['.nav nav a[aria-current="page"]', '.ii-lede', '.ii-notice', '.ii-hint', '.ii-fld output', '.ii-wrow output', '.ii-status', '.ii-badge', '.ii-tag.live', '.ii-tag.modeled', '.ii-tag.measured', '.ii-tag.assumption',
    '#ii-loc .ii-coords', '#ii-loc .ii-tile .k', '#ii-loc .ii-tile .v', '#ii-loc .ii-note', '.ii-legend summary', '.ii-legend p', '.ii-frow .l', '.ii-frow .d', '#ii-rank td', '#ii-rank .ii-link', '.ii-answer p', '.ii-ev span', '.ii-gaps li', '.ii-method p', '.ii-chips button', '.ii-ask input', '.foot p'];
  const rows = [];
  for (const s of sels) { const v = await p.ev(`window.__c(${JSON.stringify(s)})`); rows.push([s, v]); }
  const low = rows.filter(([, v]) => v !== null && v < 4.5), missing = rows.filter(([, v]) => v === null);
  ok(low.length === 0, `${dark ? 'dark' : 'light'} theme: all ${rows.length - missing.length} sampled text colours reach 4.5:1` + (low.length ? ' LOW: ' + low.map(([s, v]) => `${s}=${v}`).join(', ') : ` (lowest ${Math.min(...rows.filter(([, v]) => v !== null).map(([, v]) => v))})`));
  if (missing.length) console.log('  (not present, skipped: ' + missing.map(([s]) => s).join(', ') + ')');
  if (dark) await p.shot('ii-dark-full', true);
  await p.close();
}

// ---------------------------------------------------------------- keyboard
console.log('\n=== keyboard ===');
{
  const calls = { archive: [] };
  const p = await fresh({ width: 1400, height: 900, mocks: [...openMeteoMocks({ onArchive: Object.assign((u) => calls.archive.push(u), {}) }), gridMock] });
  const key = async (k, code, vk) => { await p.S('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === 'Enter' ? String.fromCharCode(13) : (k.length === 1 ? k : undefined) }); await p.S('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const order = []; await p.ev(`document.body.focus()`);
  for (let i = 0; i < 14; i++) { await key('Tab', 'Tab', 9); order.push(await p.ev(`(() => { const e = document.activeElement; return (e.id || e.textContent.trim().slice(0, 24) || e.tagName); })()`)); }
  console.log('  info: first Tab stops:', order.join(' > '));
  ok(order[0].startsWith('Skip') && ['mode-existing', 'mode-climate', 'mode-suit', 'ext-us', 'ext-global', 'ii-search'].every((id) => order.includes(id)), 'Tab reaches the skip link, then the mode, extent and search controls in order');
  const ring = await p.ev(`(() => { document.getElementById('mode-climate').focus(); const c = getComputedStyle(document.activeElement); return c.outlineStyle + ' ' + c.outlineWidth; })()`);
  ok(/solid 3px/.test(ring), 'a focused control shows a visible outline: ' + ring);
  await p.ev(`document.getElementById('mode-existing').focus()`); await key('Enter', 'Enter', 13); await sleep(500);
  ok(await p.ev(`document.getElementById('mode-existing').getAttribute('aria-pressed')`) === 'true', 'Enter on a mode button switches the mode');
  await p.ev(`document.getElementById('mode-suit').focus()`); await key(' ', 'Space', 32); await sleep(500);
  ok(await p.ev(`document.getElementById('mode-suit').getAttribute('aria-pressed')`) === 'true', 'Space on a mode button switches the mode');
  await p.ev(`document.getElementById('ii-center').focus()`); await key('Enter', 'Enter', 13);
  ok(await p.waitFor(`document.querySelector('#ii-loc .ii-ring')`, 20000) && calls.archive.length === 1, 'the "Analyze map centre" button gives keyboard users a way to analyse a location');
  await p.ev(`document.getElementById('ii-search').focus()`); await p.S('Input.insertText', { text: 'Ashburn' });
  ok(await p.waitFor(`document.querySelectorAll('#ii-results button').length === 2`, 8000), 'typing in the search box lists results');
  await key('Enter', 'Enter', 13); await p.waitFor(`document.querySelector('#ii-loc h2') && document.querySelector('#ii-loc h2').textContent === 'Ashburn, Virginia'`, 20000);
  ok(await p.ev(`document.querySelector('#ii-loc h2').textContent`) === 'Ashburn, Virginia', 'Enter in the search box analyses the first result');
  await p.ev(`document.getElementById('ii-search').focus()`); await p.S('Input.insertText', { text: ' x' }); await sleep(500); await key('Escape', 'Escape', 27);
  ok(await p.ev(`document.getElementById('ii-results').hidden`), 'Escape closes the results list');
  const labels = await p.ev(`JSON.stringify([...document.querySelectorAll('input, select')].filter((e) => e.type !== 'hidden').map((e) => ({ id: e.id, ok: !!(e.labels && e.labels.length) || !!e.getAttribute('aria-label') })).filter((x) => !x.ok))`).then(JSON.parse);
  ok(labels.length === 0, 'every form control has a label' + (labels.length ? ': missing for ' + labels.map((x) => x.id).join(', ') : ''));
  ok(await p.ev(`document.documentElement.lang`) === 'en' && await p.ev(`document.querySelectorAll('h1').length`) === 1, 'page has a language and exactly one h1');
  await p.close();
}

// ---------------------------------------------------------------- HTML in a facility name must never run
console.log('\n=== untrusted names are shown as text, never parsed as HTML ===');
const evil = JSON.parse(fs.readFileSync(PROC + 'data-centers.geojson', 'utf8'));
const PAYLOAD = '<img src=x onerror="window.__xss=1">EVIL <b>bold</b>';
evil.features.unshift({ type: 'Feature', geometry: { type: 'Point', coordinates: [-100.5, 41.0] }, properties: { id: 'node/1', name: PAYLOAD, operator: PAYLOAD, kind: 'colocation', country: 'United States of America', iso2: 'US', region: 'North America', state: 'NE', city: PAYLOAD } });
evil.metadata.stats.total += 1; evil.metadata.stats.us += 1;
const evilMock = { re: /data-centers\.geojson/, pattern: '*data-centers.geojson*', handler: async () => ({ body: evil }) };
for (const [label, page, prep] of [['Investment Intelligence', 'investment-intelligence.html', `document.getElementById('mode-existing').click()`], ['Investment Intelligence, data centers over the suitability cells', 'investment-intelligence.html', `document.getElementById('ov-dc').click()`], ['Data Center Explorer', 'data-centers.html', `document.getElementById('mode-markers').click()`]]) {
  const p = await fresh({ width: 1400, height: 900, mocks: [evilMock, gridMock, ...openMeteoMocks({})], page });
  await p.waitFor(`document.getElementById('${page.startsWith('invest') ? 'ii-overlay' : 'map-overlay'}').classList.contains('hidden')`, 40000);
  await p.ev(prep); await sleep(800);
  await p.ev(`document.getElementById('${page.startsWith('invest') ? 'ii-map' : 'map'}').scrollIntoView({behavior:'instant', block:'center'})`); await sleep(300);
  await p.ev(`void __maps[0].setView([41.0, -100.5], 17, {animate:false})`); await sleep(1500);
  const pt = JSON.parse(await p.ev(`JSON.stringify(__maps[0].latLngToContainerPoint([41.0, -100.5]))`)), mapId = page.startsWith('invest') ? 'ii-map' : 'map';
  const r = JSON.parse(await p.ev(`JSON.stringify(document.getElementById('${mapId}').getBoundingClientRect())`));
  for (const [dx, dy] of [[-40, -40], [-10, -10], [0, 0]]) { await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + pt.x + dx, y: r.y + pt.y + dy }); await sleep(250); }   // Leaflet throttles canvas hover, so move in steps
  const tip = await p.waitFor(`document.querySelector('.leaflet-tooltip')`, 4000);
  const tipInfo = JSON.parse(await p.ev(`JSON.stringify((() => { const t = document.querySelector('.leaflet-tooltip'); return t ? { text: t.textContent, imgs: t.querySelectorAll('img, b').length } : null; })())`));
  ok(tip && tipInfo.imgs === 0 && tipInfo.text.includes('<img src=x'), `${label}: the tooltip shows the hostile name as plain text (${tipInfo ? 'elements inside: ' + tipInfo.imgs : 'no tooltip appeared'})`);
  for (const type of ['mousePressed', 'mouseReleased']) await p.S('Input.dispatchMouseEvent', { type, x: r.x + pt.x, y: r.y + pt.y, button: 'left', clickCount: 1 });
  await p.waitFor(`document.querySelector('.leaflet-popup')`, 4000);
  const pop = JSON.parse(await p.ev(`JSON.stringify((() => { const t = document.querySelector('.leaflet-popup-content'); return t ? { imgs: t.querySelectorAll('img, b').length, text: t.textContent.slice(0, 60) } : null; })())`));
  ok(pop && pop.imgs === 0, `${label}: the popup shows it as plain text too`);
  ok(await p.ev(`typeof window.__xss`) === 'undefined', `${label}: the injected script did not run`);
  await p.close();
}
b.close();
console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nALL EXTRA CHECKS PASSED'); process.exit(bad ? 1 : 0);
