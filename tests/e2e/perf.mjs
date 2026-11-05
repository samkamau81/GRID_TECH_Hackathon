// Performance measurements (headless Chrome, same conditions each run): load time, transferred data files, repeated requests,
// JS heap, tab-switch time. Usage: node tests/e2e/perf.mjs [label] [page1,page2,...]   Writes tests/perf-<label>.json
import { launch, openPage, BASE, sleep, ROOT } from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path';
const label = process.argv[2] || 'run';
const pages = (process.argv[3] || 'index.html,prototype.html,data-centers.html,appendix.html').split(',');
const b = await launch(); const out = { label, when: new Date().toISOString(), runs: 3, pages: {} };
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const pg of pages) {
  const loads = [], heaps = [], reqs = [];
  let last = null;
  for (let i = 0; i < 3; i++) {
    const p = await openPage(b, { width: 1400, height: 900 });
    await p.S('Network.setCacheDisabled', { cacheDisabled: true });
    const t0 = Date.now();
    const loaded = new Promise((r) => b.listeners.push((m) => { if (m.method === 'Page.loadEventFired') r(); }));
    await p.S('Page.navigate', { url: BASE + pg });
    await Promise.race([loaded, sleep(20000)]);
    const wall = Date.now() - t0;
    await sleep(1500);
    const nav = await p.ev(`(()=>{const n=performance.getEntriesByType('navigation')[0];if(!n)return null;return {dcl:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd)}})()`);
    const res = await p.ev(`JSON.stringify(performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)).map(r=>({u:r.name.replace(location.origin,''),b:r.transferSize||r.encodedBodySize,ms:Math.round(r.duration)})))`);
    const heap = await p.ev(`performance.memory?performance.memory.usedJSHeapSize:null`);
    loads.push(nav?.load ?? wall); heaps.push(heap); last = { nav, res: JSON.parse(res), errors: p.errors.slice(), failed: p.failed.slice() };
    reqs.push(last.res.length); await p.close();
  }
  const total = last.res.reduce((a, r) => a + r.b, 0);
  const dup = Object.entries(last.res.reduce((m, r) => (m[r.u] = (m[r.u] || 0) + 1, m), {})).filter(([, n]) => n > 1);
  out.pages[pg] = { load_ms_median: med(loads), load_ms_all: loads, heap_mb_median: heaps[0] == null ? null : +(med(heaps) / 1048576).toFixed(1), requests: med(reqs), same_origin_bytes: total, duplicate_requests: dup, biggest: last.res.sort((a, c) => c.b - a.b).slice(0, 4), errors: last.errors, failed: last.failed };
  console.log(pg, JSON.stringify({ ...out.pages[pg], biggest: undefined }));
}
// Prototype interactions: step switching and Find a site first paint
if (pages.includes('prototype.html')) {
  const p = await openPage(b, { width: 1400, height: 900, url: BASE + 'prototype.html' });
  await p.waitFor(`!!document.getElementById('tab-1')`, 20000); await sleep(2500);
  const tm = await p.ev(`(async()=>{const r={};const t=async(name,fn)=>{const s=performance.now();fn();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));r[name]=Math.round(performance.now()-s)};
    await t('portfolio_to_plan',()=>document.getElementById('tab-1').click());
    await t('plan_to_portfolio',()=>document.getElementById('tab-0').click());
    await t('find_site_first_view',()=>{document.getElementById('pf-mapv')?.scrollIntoView();});
    return r})()`);
  const hp = await p.ev(`performance.memory.usedJSHeapSize`);
  out.prototype_interactions_ms = tm; out.prototype_heap_after_mb = +(hp / 1048576).toFixed(1);
  console.log('interactions', JSON.stringify(tm), 'heap MB', out.prototype_heap_after_mb);
  await p.close();
}
b.close();
fs.writeFileSync(path.join(ROOT, 'tests', `perf-${label}.json`), JSON.stringify(out, null, 1));
process.exit(0);
