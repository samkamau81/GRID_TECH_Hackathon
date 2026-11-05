// Before/after regression: the prototype (peak-power/prototype.html) against its original single-file version
// (backup/PeakPower.original.html), at four widths, through a scripted walk of all three steps. It compares the DOM, every element's
// layout rectangle and key computed styles, scroll size, and screenshots, and collects JS errors and failed requests.
// The prototype's header gained a small links bar (.sitelinks); it is hidden and ignored here so everything else is compared exactly.
// Usage: node tests/e2e/prototype-regression.e2e.mjs      (VIEWPORTS=1400x900 to run one width; SAVE=<dir> keeps differing screenshots)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { findChrome, ROOT } from './lib.mjs';

const CHROME = findChrome();
const toUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const TARGETS = { original: toUrl('backup/PeakPower.original.html'), refactored: process.env.REFACTORED_URL || toUrl('peak-power/prototype.html') };
const VIEWPORTS = (process.env.VIEWPORTS || '1400x900,820x900,600x900,390x800').split(',').map(v => v.split('x').map(Number));
// Top-level names the prototype's scripts declare, to check none of them shadows a built-in window property
const APP_DIR = path.join(ROOT, 'peak-power', 'js', 'app');
const NAMES = [...new Set(fs.readdirSync(APP_DIR).flatMap(f => (fs.readFileSync(path.join(APP_DIR, f), 'utf8').match(/^(?:async function|function|const|let|var) +[A-Za-z_$][\w$]*/gm) || []).map(x => x.split(/\s+/).pop())))];
const PORT = 9300 + Math.floor(Math.random() * 300);
const sha = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
}
if (!wsUrl) throw new Error('Chrome did not start');
const ws = new WebSocket(wsUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  else listeners.forEach(l => l(m));
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

// ---- in-page code (identical for both versions)
const PAGE_HELPERS = `
(() => {
  window.__lastMut = Date.now();
  new MutationObserver(() => window.__lastMut = Date.now()).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__settle = async (quiet = 500, max = 90000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
      if (!document.querySelector('.busy') && Date.now() - window.__lastMut > quiet) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    return false;
  };
  const PROPS = ['display','position','width','height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
    'border-top-width','border-top-color','border-top-style','border-left-width','border-left-color','border-radius','color','background-color','font-family','font-size','font-weight','line-height',
    'letter-spacing','text-align','text-transform','opacity','overflow-x','overflow-y','grid-template-columns','flex-direction','flex-wrap','gap','align-items','justify-content',
    'min-width','max-width','cursor','fill','stroke','stroke-width','stroke-dasharray','white-space','box-shadow','visibility','color-scheme'];
  window.__snapshot = () => {
    const root = document.querySelector('.wrap');
    const clone = root.cloneNode(true);
    clone.querySelectorAll('.sitelinks').forEach(n => n.remove());
    clone.querySelectorAll('script').forEach(s => s.remove());
    const els = [...root.querySelectorAll('*')].filter(e => !e.closest('[hidden]') && !e.closest('.sitelinks'));
    const rows = els.map((e, i) => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return (e.tagName + '.' + (e.getAttribute('class') || '') + '#' + e.id) + '|' + [r.x, r.y, r.width, r.height].map(v => Math.round(v * 100) / 100).join(',') + '|' + PROPS.map(p => cs.getPropertyValue(p)).join(';');
    });
    return { html: clone.outerHTML, rows, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, title: document.title };
  };
  const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} .sitelinks{display:none!important}';
  document.head.appendChild(st);
})();`;

// The scripted walk. Each stage returns after the UI settles. Steps tolerate missing optional controls.
const WALK = [
  ['step1-initial', `await __settle(); return true;`],
  ['step1-settings', `const s=document.getElementById('s-delay'); if(s&&s.options.length>1){s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true}));} await __settle(); return true;`],
  ['step1-model+startmonth', `const q=document.getElementById('q-model'); if(q&&q.options.length>1){q.value=q.options[1].value; q.dispatchEvent(new Event('change',{bubbles:true}));} await __settle();
     const c=[...document.querySelectorAll('#starts .col')]; if(c.length>3) c[3].dispatchEvent(new MouseEvent('click',{bubbles:true})); await __settle(); return {startCols:c.length, goEnabled:!document.getElementById('go-2').disabled};`],
  ['step1-layout-planner', `const f=document.getElementById('lp-fold'); if(f&&f.tagName==='DETAILS') f.open=true; await __settle(); const t=document.querySelector('#lp-tools .tool'); if(t) t.click(); await __settle(); return !!t;`],
  ['step2-board', `await __settle(); const b=document.getElementById('go-2'); const was=b.disabled; if(!was) b.click(); await __settle(); return {goDisabledBeforeClick:was, v2hidden:document.getElementById('v-2').hidden};`],
  ['step2-decision', `const o=[...document.querySelectorAll('#c-decs .dopt')].find(x=>!x.disabled&&!x.classList.contains('cur')); if(o) o.click(); await __settle(); return !!o;`],
  ['step2-nav-back-forward', `document.getElementById('back-1').click(); await __settle(); const mid=document.getElementById('v-1').hidden; document.getElementById('tab-2').click(); await __settle(); return {v1hiddenAfterBack:mid, v2hidden:document.getElementById('v-2').hidden};`],
  ['step3-live', `document.getElementById('go-3').click(); await new Promise(r=>setTimeout(r,200)); const p=document.getElementById('l-play'); if(/Pause/.test(p.textContent)) p.click(); await __settle(); document.querySelector('[data-j="open"]').click(); await __settle(); return {v3hidden:document.getElementById('v-3').hidden, play:p.textContent};`],
  ['step3-jump-open', `document.querySelector('[data-j="open"]').click(); await __settle(); return true;`],
  ['step3-jump-full', `document.querySelector('[data-j="full"]').click(); await __settle(); return true;`],
  ['step3-speed', `const b=[...document.querySelectorAll('#l-speed button')]; if(b[1]) b[1].click(); await __settle(); return b.length;`],
  ['step3-equipment', `const g=[...document.querySelectorAll('.eq[data-k]')]; if(g.length>2) g[2].dispatchEvent(new MouseEvent('click',{bubbles:true})); await __settle(); return {groups:g.length, selected:(document.querySelector('.eq.sel')||{dataset:{}}).dataset.k};`],
  ['step3-event-wind', `const s=document.getElementById('sim'); const opts=[...s.options].map(o=>o.value); s.value='wind'; s.dispatchEvent(new Event('change',{bubbles:true})); await __settle(); return {opts, report:document.getElementById('op-report').textContent.length>0};`],
  ['step3-event-play', `const b=document.getElementById('op-play'); if(b) b.click(); await __settle(800, 120000); const pl=document.getElementById('l-play'); if(/Pause/.test(pl.textContent)) pl.click(); document.querySelector('[data-j="full"]').click(); await __settle(); return {hasPlay:!!b, report:document.getElementById('op-report').textContent.length};`],
  ['step3-event-fail', `const s=document.getElementById('sim'); s.value='fail'; s.dispatchEvent(new Event('change',{bubbles:true})); await __settle(); const pl=document.getElementById('l-play'); if(/Pause/.test(pl.textContent)) pl.click(); document.querySelector('[data-j="full"]').click(); await __settle(); return {src:document.getElementById('sim-src').hidden, report:document.getElementById('op-report').textContent.length};`],
  ['step3-event-clear', `const b=document.getElementById('op-clear'); if(b) b.click(); await __settle(); return {hasClear:!!b, sim:document.getElementById('sim').value};`],
];

async function runPage(name, url, [W, H]) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const errors = [], failed = [];
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Network.responseReceived' && m.params.response.url.startsWith('file:') && m.params.response.status >= 400) failed.push(m.params.response.url);
  });
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__pre = new Set(Object.getOwnPropertyNames(window));' });
  const reqs = {};
  listeners.push(m => { if (m.sessionId === sessionId && m.method === 'Network.requestWillBeSent') reqs[m.params.requestId] = m.params.request.url; });
  listeners.push(m => { if (m.sessionId === sessionId && m.method === 'Network.loadingFailed' && /^file:/.test(reqs[m.params.requestId] || '')) failed.push('FILE LOAD FAILED ' + reqs[m.params.requestId]); });
  const loaded = new Promise(r => listeners.push(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') r(); }));
  await S('Page.navigate', { url });
  await loaded;
  await S('Runtime.evaluate', { expression: PAGE_HELPERS });
  const out = { stages: [], errors, failed };
  for (const [stage, body] of WALK) {
    const ev = await S('Runtime.evaluate', { expression: `(async()=>{ try { const info = await (async()=>{ ${body} })(); const s = __snapshot(); return JSON.stringify({info, s}); } catch(e){ return JSON.stringify({err:String(e&&e.stack||e)}); } })()`, awaitPromise: true, returnByValue: true });
    const r = JSON.parse(ev.result.value);
    if (r.err) { out.stages.push({ stage, err: r.err }); errors.push(`WALK ${stage}: ${r.err}`); continue; }
    const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    out.stages.push({ stage, info: r.info, html: r.s.html.replace(/>\s+</g, '><'), rows: r.s.rows, scroll: [r.s.scrollW, r.s.scrollH], title: r.s.title, shot: sha(shot.data), shotData: shot.data });
  }
  if (name === 'refactored') {
    const ev = await S('Runtime.evaluate', { expression: `JSON.stringify(${JSON.stringify(NAMES)}.filter(n => window.__pre.has(n)).map(n => { const d = Object.getOwnPropertyDescriptor(window, n); return n + (d && !d.configurable ? ' [non-configurable]' : ''); }))`, returnByValue: true });
    out.collisions = JSON.parse(ev.result.value);
    const g = await S('Runtime.evaluate', { expression: `JSON.stringify({engine: typeof window.GTEngine, ref: !!window.PEAKPOWER_REFERENCE, scen: window.PEAKPOWER_SCENARIOS && window.PEAKPOWER_SCENARIOS.length})`, returnByValue: true });
    out.globals = JSON.parse(g.result.value);
  }
  await send('Target.closeTarget', { targetId });
  return out;
}

let bad = 0;
const report = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) bad++; };
for (const vp of VIEWPORTS) {
  console.log(`\n=== viewport ${vp.join('x')} ===`);
  const A = await runPage('original', TARGETS.original, vp);
  const B = await runPage('refactored', TARGETS.refactored, vp);
  report(A.errors.length === 0, `original: ${A.errors.length} JS errors` + (A.errors.length ? '\n    ' + A.errors.slice(0, 5).join('\n    ') : ''));
  report(B.errors.length === 0, `refactored: ${B.errors.length} JS errors` + (B.errors.length ? '\n    ' + B.errors.slice(0, 5).join('\n    ') : ''));
  report(B.failed.length === 0, `refactored: ${B.failed.length} failed local requests` + (B.failed.length ? '\n    ' + JSON.stringify(B.failed).slice(0, 400) : ''));
  if (vp === VIEWPORTS[0]) { console.log('  info: globals', JSON.stringify(B.globals)); console.log('  info: top-level names that shadow existing window props:', JSON.stringify(B.collisions)); }
  for (let i = 0; i < WALK.length; i++) {
    const a = A.stages[i], b = B.stages[i], n = WALK[i][0];
    if (a.err || b.err) { report(false, `${n}: walk error (orig: ${a.err ? 'yes' : 'no'}, new: ${b.err ? 'yes' : 'no'})`); continue; }
    if (process.env.SHOW_INFO && vp === VIEWPORTS[0]) console.log('    info', n, JSON.stringify(b.info));
    const htmlEq = a.html === b.html, rowsEq = a.rows.length === b.rows.length && a.rows.every((r, j) => r === b.rows[j]);
    const infoEq = JSON.stringify(a.info) === JSON.stringify(b.info), scrollEq = a.scroll.join() === b.scroll.join(), shotEq = a.shot === b.shot;
    report(htmlEq && rowsEq && infoEq && scrollEq && shotEq,
      `${n.padEnd(24)} dom:${htmlEq ? '=' : 'DIFF'} layout+style(${a.rows.length} els):${rowsEq ? '=' : 'DIFF'} scroll:${a.scroll.join('x')}${scrollEq ? '' : ' vs ' + b.scroll.join('x')} pixels:${shotEq ? '=' : 'DIFF'} info:${infoEq ? '=' : 'DIFF'}`);
    if (!rowsEq) { const j = a.rows.findIndex((r, k) => r !== b.rows[k]); console.log('    first layout diff:\n      o: ' + String(a.rows[j]).slice(0, 300) + '\n      n: ' + String(b.rows[j]).slice(0, 300)); }
    if (!htmlEq) { let k = 0; while (a.html[k] === b.html[k]) k++; console.log('    first DOM diff @' + k + ':\n      o: ' + a.html.slice(k - 60, k + 120) + '\n      n: ' + b.html.slice(k - 60, k + 120)); }
    if (!shotEq && process.env.SAVE) { fs.writeFileSync(path.join(process.env.SAVE, `${vp[0]}-${n}-orig.png`), Buffer.from(a.shotData, 'base64')); fs.writeFileSync(path.join(process.env.SAVE, `${vp[0]}-${n}-new.png`), Buffer.from(b.shotData, 'base64')); }
  }
}
console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nALL BROWSER CHECKS PASSED');
ws.close(); chrome.kill();
process.exit(bad ? 1 : 0);
