// Landing page, Business model tab, hardware roadmap and FAQ assistant: browser checks.
import { launch, openPage, BASE, sleep } from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const PP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'peak-power');
const bw = {}; vm.runInNewContext(fs.readFileSync(path.join(PP, 'js/data/business-model.js'), 'utf8'), { window: bw }); const B = bw.PEAKPOWER_BUSINESS;
// independent re-computation of total revenue per year (does not share code with the page)
const expect = (sc) => { let prev = { analyst: 0, pro: 0, ent: 0 }; return sc.years.map((y) => { const a = (k) => (prev[k] + y[k]) / 2, sub = a('analyst') * B.tiers[0].price + a('pro') * B.tiers[1].price + a('ent') * B.tiers[2].price;
  const t = sub * 1.1 + y.projects * B.services.feasibilityPerProject + Math.max(0, y.ent - prev.ent) * B.services.onboardingPerNewEnterprise; prev = { analyst: y.analyst, pro: y.pro, ent: y.ent }; return Math.round(t); }); };
const ask = (p, q) => p.ev(`(()=>{const i=document.querySelector('.pp-chat-f input');i.value=${JSON.stringify(q)};document.querySelector('.pp-chat-f').requestSubmit()})()`);
const b = await launch();
try {
  // ---- landing page
  const p = await openPage(b, { width: 1400, height: 900, url: BASE + 'index.html' }); await sleep(500);
  const txt = await p.ev(`document.body.innerText`);
  ok(!/75\s?MW|876,?000|87,600|Williamson|Texas|fictional|in your browser/i.test(txt), 'landing page has no 75 MW / 10-year / 876,000 metrics, Texas, fictional or browser-operation text');
  ok(await p.ev(`(()=>{const v=document.querySelector('.hero-visual');const t=v.textContent;return !!v.querySelector('svg title')&&['Grid connection','Power supply','Land and permits','Fiber and network','Water and hazards','Policy','Data Center'].every(x=>t.includes(x))&&!/Campus|\d{2,}\s?MW/.test(t)})()`), 'graphic: data center with the six labelled dimensions and no numbers');
  ok(await p.ev(`!document.querySelector('dl.stats')`), 'metric strip removed');
  for (const h of ['What Is Peak Power?', 'The problem', 'Our solution']) ok(txt.includes(h), 'section present: ' + h);
  ok(!/Objectives|What to expect|Where you can see them/i.test(txt) && await p.ev(`!document.querySelector('table.obj, .expect')`), 'Objectives and What to expect sections removed');
  ok(await p.ev(`document.querySelector('.pp-chat-btn').textContent.includes('Peak Power Assistant')`), 'assistant button is named Peak Power Assistant');
  ok(await p.ev(`[...document.querySelectorAll('header.nav nav a')].map(a=>a.getAttribute('href')).join()==='index.html,prototype.html,appendix.html'`), 'three-tab navigation');
  ok(p.errors.length === 0 && p.failed.length === 0, 'landing: no console errors or failed requests ' + p.errors.join('|'));
  await p.shot('landing-new', true);
  // ---- chatbot on the landing page
  ok(await p.ev(`!!document.querySelector('.pp-chat-btn')`), 'assistant button present');
  const before = p.requests.length;
  await p.click('.pp-chat-btn'); ok(await p.waitFor(`!document.querySelector('.pp-chat').hidden && document.querySelectorAll('.pp-chat-chips button').length>=6`), 'assistant opens with suggested questions');
  ok(await p.ev(`document.activeElement===document.querySelector('.pp-chat-f input')`), 'focus moves to the input');
  await ask(p, 'What would it cost?');
  ok(await p.waitFor(`/\\$3,600/.test(document.querySelector('.pp-chat-log').innerText) && /not been tested|Proposed/.test(document.querySelector('.pp-chat-log').innerText)`), 'pricing answer quotes proposed prices and says they are untested');
  ok(await p.ev(`[...document.querySelectorAll('.pp-links a')].some(a=>a.getAttribute('href')==='appendix.html#business')`), 'answer links to the Business model section');
  await ask(p, 'what is the weather in paris');
  ok(await p.waitFor(`/do not have a verified answer/.test(document.querySelector('.pp-chat-log').innerText)`), 'unanswerable question gets an honest fallback');
  const net = p.requests.slice(before).filter((u) => !u.startsWith(BASE));
  ok(net.length === 0, 'assistant makes no external requests ' + net.join(','));
  await p.shotEl('chat-open', '.pp-chat', 10);
  await p.ev(`document.querySelector('.pp-chat').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  ok(await p.ev(`document.querySelector('.pp-chat').hidden && !document.querySelector('.pp-chat-btn').hidden`), 'Escape closes the assistant');
  await p.close();

  // ---- Appendix: business model and hardware roadmap
  const a = await openPage(b, { width: 1400, height: 900, url: BASE + 'appendix.html#business' });
  ok(await a.waitFor(`document.querySelectorAll('#tiers .tier').length===3`), 'three pricing tiers drawn');
  ok(await a.ev(`/no customers, no revenue, no signed partners/i.test(document.getElementById('s-business').innerText)`), 'states plainly there are no customers, revenue or partners');
  ok(await a.ev(`document.querySelectorAll('#unit-table tbody tr').length===3`), 'unit economics for three tiers');
  ok(await a.ev(`document.querySelectorAll('#phases > li').length===5`), 'five go-to-market phases');
  for (const k of ['conservative', 'base', 'ambitious']) {
    await a.click(`#scn [data-k=${k}]`); await sleep(150);
    const want = expect(B.scenarios[k]);
    const got = JSON.parse(await a.ev(`JSON.stringify([...document.querySelectorAll('#rev-table tr.tot td')].slice(1).map(td=>+td.textContent.replace(/[$,]/g,'')))`));
    ok(want.every((v, i) => Math.abs(v - got[i]) <= 1), `${k}: revenue table equals independent calculation (${got.map((v) => '$' + v.toLocaleString('en-US')).join(' / ')})`);
    ok(await a.ev(`document.querySelectorAll('#rev-chart rect').length===9`), `${k}: chart draws 3 years x 3 streams`);
  }
  ok(await a.ev(`document.querySelectorAll('#s-business .badge.prop').length>=3 && document.querySelectorAll('#s-business .badge.built').length>=2 && document.querySelectorAll('#s-business .badge.todo').length>=2`), 'built / proposed / not-validated labels are used');
  await a.shot('appendix-business', true);
  await a.click('#t-limits');
  ok(await a.ev(`document.querySelectorAll('#hw-table tbody tr').length===8`), 'hardware table lists eight technologies');
  ok(await a.ev(`/Nothing in the proposed column is built/.test(document.getElementById('s-limits').innerText) && /GPU/.test(document.getElementById('hw-table').innerText) && /IoT/.test(document.getElementById('hw-table').innerText) && /gateway/i.test(document.getElementById('hw-table').innerText) && /CPU/.test(document.getElementById('hw-table').innerText)`), 'hardware section covers CPU, GPU, IoT and edge and separates built from proposed');
  await a.shot('appendix-hardware', true);
  ok(await a.ev(`document.documentElement.scrollWidth<=innerWidth+1`), 'no horizontal overflow (desktop)');
  ok(a.errors.length === 0 && a.failed.length === 0, 'appendix: no errors ' + a.errors.join('|')); await a.close();
  const m = await openPage(b, { width: 390, height: 800, url: BASE + 'appendix.html#business' }); await m.waitFor(`document.querySelectorAll('#tiers .tier').length===3`);
  ok(await m.ev(`document.documentElement.scrollWidth<=innerWidth+1`), 'no horizontal overflow at 390 px (business tab)');
  await m.click('.pp-chat-btn'); await m.waitFor(`!document.querySelector('.pp-chat').hidden`);
  ok(await m.ev(`(()=>{const r=document.querySelector('.pp-chat').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`), 'assistant fits within a 390 px screen');
  await m.shot('chat-mobile'); await m.close();

  // ---- Prototype: assistant present, no errors, and the Recommended/Alternative box is gone
  const q = await openPage(b, { width: 1400, height: 900, url: BASE + 'prototype.html' }); await sleep(1500);
  ok(await q.ev(`!!document.querySelector('.pp-chat-btn') && !document.getElementById('alt-box')`), 'prototype has the assistant and no Recommended/Alternative box');
  ok(q.errors.length === 0, 'prototype: no console errors ' + q.errors.join('|')); await q.close();
} catch (e) { fail++; console.log('FAIL exception', e.message); }
b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
