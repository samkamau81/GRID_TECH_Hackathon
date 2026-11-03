// Shared harness for the browser tests: serves peak-power/ itself, finds Chrome or Edge, and drives it over the
// Chrome DevTools Protocol (Node 22 or newer; no dependencies). Set CHROME_PATH to use a specific browser.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const helpers = require(path.join(ROOT, 'tests', 'unit', 'helpers.js'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME_PATH to the browser executable.');
  return found;
}

/* A tiny static server for peak-power/ on a free localhost port (the pages fetch data files, so they cannot run from file://). */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
export async function startServer(dir = path.join(ROOT, 'peak-power')) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(dir, '.' + p);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}
const server = await startServer();
export const BASE = server.base;
process.on('exit', () => { try { server.close(); } catch {} });

export async function launch() {
  const port = 9700 + Math.floor(Math.random() * 250);
  const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'pp-chrome-'))}`,
    '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let wsUrl; for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
  if (!wsUrl) throw new Error('Chrome did not start');
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const listeners = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } else listeners.forEach((l) => l(m)); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  return { send, listeners, close: () => { try { ws.close(); } catch {} chrome.kill(); } };
}

/* A page with: error collection, optional request mocks (url regex -> async handler returning {status, body} or null to pass through),
   evaluation helpers and screenshots. */
export async function openPage(b, { width = 1400, height = 900, dark, mocks = [], url, reduced } = {}) {
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => b.send(m, p, sessionId);
  const errors = [], failed = [], requests = [], reqUrls = {};
  b.listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Network.requestWillBeSent') { reqUrls[m.params.requestId] = m.params.request.url; requests.push(m.params.request.url); }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled && !/fonts\.(googleapis|gstatic)/.test(reqUrls[m.params.requestId] || '') && m.params.blockedReason !== 'inspector') failed.push((reqUrls[m.params.requestId] || '?') + ' ' + m.params.errorText);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !/open-meteo|arcgis/.test(m.params.response.url)) failed.push(m.params.response.status + ' ' + m.params.response.url);
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url, hit = mocks.find((x) => x.re.test(u));
      (async () => {
        try {
          const r = hit ? await hit.handler(u, m.params.request) : null;
          if (r) await S('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: r.status || 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(r.body)).toString('base64') });
          else await S('Fetch.continueRequest', { requestId: m.params.requestId });
        } catch (e) { try { await S('Fetch.continueRequest', { requestId: m.params.requestId }); } catch {} }
      })();
    }
  });
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  // captures every L.map(...) so tests can read the map (no hook is needed in the app code)
  await S('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { let real, proxy; Object.defineProperty(window, 'L', { configurable: true, get() { return proxy; }, set(v) { real = v; proxy = new Proxy(v, { get(t, k, r) { if (k === 'map') return function () { const m = t.map.apply(t, arguments); (window.__maps = window.__maps || []).push(m); return m; }; return Reflect.get(t, k, r); } }); } }); })();` });
  await S('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  if (mocks.length) await S('Fetch.enable', { patterns: mocks.map((x) => ({ urlPattern: x.pattern })) });
  await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  const media = []; if (dark !== undefined) media.push({ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }); if (reduced) media.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (media.length) await S('Emulation.setEmulatedMedia', { features: media });
  const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails)); return r.result.value; };
  const waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(120); } return false; };
  if (url) { const done = new Promise((r) => b.listeners.push((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') r(); })); await S('Page.navigate', { url }); await done; }
  const shots = path.join(os.tmpdir(), 'peak-power-e2e'); fs.mkdirSync(shots, { recursive: true });
  return { S, ev, waitFor, errors, failed, requests, click: (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`),
    shot: async (name, full) => { const d = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full }); fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(d.data, 'base64')); },
    shotEl: async (name, sel, pad = 0) => { const r = JSON.parse(await ev(`JSON.stringify((()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({behavior:'instant',block:'start'}); const b=e.getBoundingClientRect(); return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height};})())`));
      await sleep(300); const d = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + 2 * pad, height: r.height + 2 * pad, scale: 1 } });
      fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(d.data, 'base64')); },
    close: () => b.send('Target.closeTarget', { targetId }) };
}

// Canned Open-Meteo / FEMA responses, built with the real climate helpers so they are shaped like the live API
export function openMeteoMocks({ onArchive, onCurrent, onGeocode, femaBody } = {}) {
  const archive = (meanC) => { const h = helpers.hourlySeries({ mean: meanC, annualAmp: 11, dailyAmp: 5, rh: 60, years: 3, startYear: 2023, windMph: 9 });
    return { latitude: 39.05, longitude: -77.53, elevation: 92, timezone: 'America/New_York', hourly: { time: h.time, temperature_2m: h.temperature_2m, relative_humidity_2m: h.relative_humidity_2m, wet_bulb_temperature_2m: h.temperature_2m.map((t) => t - 4), wind_speed_10m: h.wind_speed_10m } }; };
  const current = { elevation: 92, current_units: { temperature_2m: '°F' }, current: { time: '2026-11-01T14:30', temperature_2m: 53, apparent_temperature: 51.3, weather_code: 3, wind_speed_10m: 0.9, relative_humidity_2m: 74, wet_bulb_temperature_2m: 47 } };
  return [
    { re: /archive-api\.open-meteo\.com/, pattern: '*archive-api.open-meteo.com*', handler: async (u) => { onArchive && onArchive(u); return onArchive && onArchive.fail ? onArchive.fail() : { body: archive(onArchive && onArchive.mean || 13) }; } },
    { re: /api\.open-meteo\.com\/v1\/forecast/, pattern: '*api.open-meteo.com/v1/forecast*', handler: async (u) => { onCurrent && onCurrent(u); const n = (new URL(u).searchParams.get('latitude') || '').split(',').length; return { body: n > 1 ? Array.from({ length: n }, (_, i) => ({ ...current, current: { ...current.current, temperature_2m: 50 + i } })) : current }; } },
    { re: /geocoding-api\.open-meteo\.com/, pattern: '*geocoding-api.open-meteo.com*', handler: async (u) => { onGeocode && onGeocode(u); return { body: { results: [{ name: 'Ashburn', admin1: 'Virginia', country_code: 'US', latitude: 39.04, longitude: -77.49 }, { name: 'Ashburn', admin1: 'Georgia', country_code: 'US', latitude: 31.7, longitude: -83.65 }] } }; } },
    ...(femaBody ? [{ re: /arcgis\.com/, pattern: '*arcgis.com*', handler: async () => ({ body: femaBody }) }] : [])
  ];
}
